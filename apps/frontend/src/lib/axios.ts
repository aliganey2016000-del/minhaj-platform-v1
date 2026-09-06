import axios from 'axios';

const API_URL = '/api/v1';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Some admin pages derive hook dependencies from reference-data arrays. Keep
// an identical departments payload on the same array reference so a harmless
// re-fetch cannot manufacture a new dependency and restart the fetch effect.
let cachedDepartmentsKey = '';
let cachedDepartmentsArray: unknown[] | null = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const loginSessionId = localStorage.getItem('loginSessionId');
  if (loginSessionId) config.headers['X-Login-Session-Id'] = loginSessionId;

  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  return config;
});

const AUTH_ENDPOINTS_EXEMPT_FROM_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh-token'];
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh-token`, {}, { withCredentials: true })
      .then(({ data }) => data.data?.accessToken || null)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => {
    if (response.config.method?.toLowerCase() === 'get' && response.config.url?.replace(/\/$/, '') === '/departments' && Array.isArray(response.data?.data)) {
      const departments = response.data.data as unknown[];
      const key = JSON.stringify(departments);
      if (key === cachedDepartmentsKey && cachedDepartmentsArray) {
        response.data.data = cachedDepartmentsArray;
      } else {
        cachedDepartmentsKey = key;
        cachedDepartmentsArray = departments;
      }
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = AUTH_ENDPOINTS_EXEMPT_FROM_REFRESH.some((path) => originalRequest?.url?.includes(path));

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
        localStorage.removeItem('accessToken');
        localStorage.removeItem('loginSessionId');
        const from = window.location.pathname + window.location.search;
        window.location.href = `/auth/login?from=${encodeURIComponent(from)}`;
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
