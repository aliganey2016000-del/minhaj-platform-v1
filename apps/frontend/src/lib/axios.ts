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
      const { data } = await axios.post(
          `/api/v1/auth/refresh-token`,
          {},
          { withCredentials: true }
        );

        // Store new access token
        const newToken = data.data?.accessToken;
        if (newToken) {
          localStorage.setItem('accessToken', newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed — redirect to login
        localStorage.removeItem('accessToken');
        window.location.href = '/auth/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;