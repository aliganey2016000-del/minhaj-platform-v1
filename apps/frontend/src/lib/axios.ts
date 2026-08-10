import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
    // Must hit the same absolute API_URL the main `api` instance uses, not
    // a bare relative path — in production VITE_API_URL points at a
    // different origin (e.g. api.masjidalrahma.com) than the frontend
    // itself (e.g. sahaledu.com/suganhub.com), and the refreshToken cookie
    // is scoped to that API origin. A relative path here resolves against
    // window.location.origin instead, so the browser never attaches the
    // cookie and every silent refresh silently fails — invisibly at first
    // since the access token is still valid, then forcing a full logout
    // the moment it expires (15 min by default) on the next request.
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh-token`, {}, { withCredentials: true })
      .then(({ data }) => data.data?.accessToken || null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Response interceptor — handle 401, refresh token
api.interceptors.response.use(
  (response) => response,
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