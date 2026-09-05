/**
 * Auth Context — global authentication state.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import api from '../lib/axios';

interface User {
  id: string;
  email: string;
  role: string;
  title?: string;
  isVerified: boolean;
  preferredLanguage: string;
  organizationId?: string;
  organizationName?: string;
  onboardingCompleted?: boolean;
  permissions: Array<{ module: string; page?: string; actions: string[] }>;
  sidebarAccess: string[];
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  gender: string;
  organizationId?: string;
  role?: string;
  preferredLanguage?: string;
}

function newLoginSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `login-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeUser(raw: any): User {
  let orgId: string | undefined;
  if (typeof raw.organizationId === 'object' && raw.organizationId !== null) orgId = (raw.organizationId._id || raw.organizationId).toString();
  else if (raw.organizationId) orgId = String(raw.organizationId);

  return {
    id: raw.id || raw._id,
    email: raw.email,
    role: raw.role,
    title: raw.title || undefined,
    isVerified: raw.isVerified,
    preferredLanguage: raw.preferredLanguage || 'en',
    organizationId: orgId,
    organizationName: raw.organizationName || (typeof raw.organizationId === 'object' && raw.organizationId?.name) || undefined,
    onboardingCompleted: raw.onboardingCompleted ?? true,
    permissions: Array.isArray(raw.permissions) ? raw.permissions : [],
    sidebarAccess: Array.isArray(raw.sidebarAccess) ? raw.sidebarAccess : [],
  };
}

function clearAuthStorage() {
  if (typeof window === 'undefined') return;
  const keysToClear = ['accessToken', 'tenant', 'tenantSlug', 'selectedTenant', 'activeTenant', 'loginSessionId'];
  keysToClear.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const { data } = await api.get('/auth/me');
        if (!localStorage.getItem('loginSessionId')) localStorage.setItem('loginSessionId', newLoginSessionId());
        setUser(normalizeUser(data.data?.user));
      } catch {
        clearAuthStorage();
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const loginSessionId = newLoginSessionId();
    try {
      const { data } = await api.post('/auth/login', { email, password }, {
        headers: { 'X-Login-Session-Id': loginSessionId },
      });

      if (data.success) {
        clearAuthStorage();
        const accessToken = data.data?.accessToken;
        const userData = data.data?.user;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('loginSessionId', loginSessionId);
        const normalized = normalizeUser(userData);
        setUser(normalized);
        return normalized;
      }
      throw new Error(data.message || 'Login failed');
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Login failed. Please try again.';
      setError(message);
      throw err;
    }
  }, []);

  const register = useCallback(async (formData: RegisterData) => {
    setError(null);
    const loginSessionId = newLoginSessionId();
    try {
      const { data } = await api.post('/auth/register', {
        ...formData,
        role: formData.role || 'student',
        preferredLanguage: formData.preferredLanguage || 'en',
      }, {
        headers: { 'X-Login-Session-Id': loginSessionId },
      });

      if (data.success) {
        clearAuthStorage();
        const accessToken = data.data?.accessToken;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('loginSessionId', loginSessionId);
        setUser(normalizeUser(data.data?.user));
        return;
      }
      throw new Error(data.message || 'Registration failed');
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Registration failed. Please try again.';
      setError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    // Keep loginSessionId in storage until the logout request is sent so the
    // backend can attach the logout event to the same login session.
    try {
      await api.post('/auth/logout');
    } catch {
      // Logout must still clear local state when the network is unavailable.
    }
    clearAuthStorage();
    setUser(null);
    window.location.href = '/auth/login';
  }, []);

  const completeOnboarding = useCallback(async () => {
    setUser(prev => prev ? { ...prev, onboardingCompleted: true } : null);
    try {
      await api.patch('/auth/me/onboarding-complete');
    } catch (err: any) {
      console.warn('Failed to mark onboarding complete:', err.message);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    completeOnboarding,
    error,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export default AuthContext;
