import axios from 'axios';

// Always use the frontend's same-origin API proxy in production. This keeps
// login, cookies, CORS, and refresh-token handling on one browser origin and
// lets nginx forward /api/* to the separate backend application.
const API_URL = '/api/v1';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Exam dates are calendar dates, not timestamps. A few existing exam records
// contain the Unix epoch (01/01/1970), which makes the admin calendar show
// 1970 and causes the effective-status calculation to mark them completed.
// Treat those legacy/invalid dates as today's local calendar date so the
// scheduling UI starts from the real current day (23/08/2026 in production)
// without changing valid historical/future dates.
function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeExamDate(value: unknown): unknown {
  if (!value) return value;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) {
    return localDateInputValue();
  }
  return value;
}

function normalizeExamResponseData(data: any): any {
  if (!data || typeof data !== 'object') return data;

  const normalizeExam = (exam: any) => {
    if (!exam || typeof exam !== 'object' || !('examDate' in exam)) return exam;
    return { ...exam, examDate: normalizeExamDate(exam.examDate) };
  };

  if (Array.isArray(data.data)) {
    return { ...data, data: data.data.map(normalizeExam) };
  }
  if (Array.isArray(data.data?.exams)) {
    return { ...data, data: { ...data.data, exams: data.data.exams.map(normalizeExam) } };
  }
  if (data.data && typeof data.data === 'object' && 'examDate' in data.data) {
    return { ...data, data: normalizeExam(data.data) };
  }
  return data;
}

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // The instance default above hardcodes 'application/json' on every
  // request. For a FormData body (file/bulk-import uploads across the
  // app), that default silently overrides the browser's auto-generated
  // 'multipart/form-data; boundary=...' header — the request still sends
  // the file bytes, but with the wrong Content-Type, so Multer never sees
  // a boundary and req.file comes back undefined server-side ("An Excel
  // file is required" even though a real file was attached). Deleting the
  // header here lets the browser set the correct one with its boundary.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  return config;
});

// Endpoints that legitimately return 401 for bad credentials — these are
// NOT expired-session cases, so they must never trigger the refresh-token
// retry/redirect flow below (there is no session to refresh yet).
const AUTH_ENDPOINTS_EXEMPT_FROM_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh-token'];

// When several requests 401 around the same moment (e.g. autosave + a
// status poll firing together right as the access token expires), they
// used to each launch their own /auth/refresh-token call. Concurrent
// refresh calls raced on the backend and could fail, which this interceptor
// treated as "session expired" and force-redirected to /auth/login —
// interrupting whatever the user was doing. Sharing one in-flight refresh
// promise across all of them means only one refresh call ever goes out.
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    // Use the same-origin proxy as the main API client. The nginx frontend
    // proxies /api/* to https://api.sahaledu.com, so both login and refresh
    // stay on the browser's current origin and avoid cross-origin cookie/CORS
    // failures.
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh-token`, {}, { withCredentials: true })
      .then(({ data }) => data.data?.accessToken || null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Response interceptor — normalize legacy exam dates, then handle 401/refresh.
api.interceptors.response.use(
  (response) => {
    if (response.config.url?.includes('/exams')) {
      response.data = normalizeExamResponseData(response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = AUTH_ENDPOINTS_EXEMPT_FROM_REFRESH.some((path) => originalRequest?.url?.includes(path));

    // If 401 and not already retried (and not a login/register/refresh call itself —
    // those 401s mean "wrong credentials", not "session expired", and must be
    // surfaced to the caller instead of triggering a silent redirect).
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        const newToken = await refreshAccessToken();
        if (newToken) {
          localStorage.setItem('accessToken', newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed (refresh token itself expired/invalid, e.g. after
        // 7 days) — this is a hard window navigation, not a React Router
        // one, so the return page has to travel as a query param instead
        // of router state; login.tsx reads it back out on success.
        localStorage.removeItem('accessToken');
        const from = window.location.pathname + window.location.search;
        window.location.href = `/auth/login?from=${encodeURIComponent(from)}`;
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
