/**
 * Auth Context
 *
 * Global authentication state — user info, login, register, logout.
 * Connects to backend API via Axios.
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  id: string;
  email: string;
  role: string;
  isVerified: boolean;
  preferredLanguage: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
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

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ------------------------------------------------------------------
  // Check for existing session on mount
  // ------------------------------------------------------------------

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const { data } = await api.get('/auth/me');
        setUser(data.data?.user || null);
      } catch {
        localStorage.removeItem('accessToken');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // ------------------------------------------------------------------
  // Login
  // ------------------------------------------------------------------

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const { data } = await api.post('/auth/login', { email, password });

      if (data.success) {
        const accessToken = data.data?.accessToken;
        const userData = data.data?.user;
        localStorage.setItem('accessToken', accessToken);
        setUser(userData || null);
        return userData;
      } else {
        throw new Error(data.message || 'Login failed');
      }
    } catch (err: any) {
      const message =
        err.response?.data?.message || err.message || 'Login failed. Please try again.';
      setError(message);
      throw err;
    }
  }, []);

  // ------------------------------------------------------------------
  // Register
  // ------------------------------------------------------------------

  const register = useCallback(async (formData: RegisterData) => {
    setError(null);
    try {
      const { data } = await api.post('/auth/register', {
        ...formData,
        role: formData.role || 'student',
        preferredLanguage: formData.preferredLanguage || 'en',
      });

      if (data.success) {
        const accessToken = data.data?.accessToken;
        localStorage.setItem('accessToken', accessToken);
        setUser(data.data?.user || null);
      } else {
        throw new Error(data.message || 'Registration failed');
      }
    } catch (err: any) {
      const message =
        err.response?.data?.message || err.message || 'Registration failed. Please try again.';
      setError(message);
      throw err;
    }
  }, []);

  // ------------------------------------------------------------------
  // Logout
  // ------------------------------------------------------------------

  const logout = useCallback(async () => {
    // Clear local session state and redirect immediately — the click must
    // take effect right away regardless of how long the network call takes.
    // The server-side call (invalidating the refresh token) happens in the
    // background; a failure there shouldn't block the user from leaving.
    localStorage.removeItem('accessToken');
    setUser(null);
    api.post('/auth/logout').catch(() => {});
    window.location.href = '/auth/login';
  }, []);

  // ------------------------------------------------------------------
  // Clear error
  // ------------------------------------------------------------------

  const clearError = useCallback(() => setError(null), []);

  // ------------------------------------------------------------------
  // Value
  // ------------------------------------------------------------------

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    error,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;