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
import { unlockTeacherWithPassword, enrollTeacherOfflinePassword, listAutomaticOfflineTeachers } from '../lib/offline-teacher-password';
import { prepareTeacherOfflineAutomatically } from '../lib/teacher-offline-auto-prepare';
import { lockOfflineTeacher, getPreparedTeacher, offlineAccountKey } from '../lib/offline-teacher-vault';
import { clearAllOfflineData, resetOfflineDataOnLogin } from '../lib/offline-store';
import {
  OFFLINE_TEACHER_IDENTITY_KEY, saveVerifiedTeacherIdentity, verifiedOfflineTeacherIdentity,
} from '../lib/teacher-offline-attendance';

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
  offlineOnly?: boolean;
  /** From Profile, only present once /auth/me has loaded. */
  firstName?: string;
  lastName?: string;
  /** From the org's branding, only present once /auth/me has loaded. */
  organizationLogo?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  unlockOffline: (password: string, accountKey: string) => Promise<User>;
  lockOfflineSession: () => void;
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

// `profile` and the populated org's branding.logo are only present on the
// full GET /auth/me response, not on login/register — those fields stay
// undefined until the AuthProvider's own /auth/me call fills them in, which
// is what lets every page read the greeting name and org logo straight from
// context instead of each issuing its own /auth/me + /schools/:id/branding
// requests.
function normalizeUser(raw: any, profile?: any): User {
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
    firstName: profile?.firstName || undefined,
    lastName: profile?.lastName || undefined,
    organizationLogo: (typeof raw.organizationId === 'object' && raw.organizationId?.branding?.logo) || undefined,
  };
}

async function clearAuthStorage(options: {
  preservePendingAttendance?: boolean;
  transferFrom?: string | null;
  transferTo?: string | null;
} = {}): Promise<void> {
  if (typeof window === 'undefined') return;
  lockOfflineTeacher();
  const keysToClear = ['accessToken', 'tenant', 'tenantSlug', 'selectedTenant', 'activeTenant', 'loginSessionId', OFFLINE_TEACHER_IDENTITY_KEY];
  keysToClear.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
  // The service worker caches several authenticated-API responses by URL
  // alone, with no account/tenant identifier in the cache key (see sw.ts:
  // api-student-cache, api-course-content-cache, api-gamification-cache).
  // On a shared device the next person to sign in — or the same person
  // after logging out — must never be served a previous account's
  // dashboard, results, seating, course content or leaderboard position
  // from that cache. All three authenticated runtime caches are dropped
  // here; only font/image/app-code caches (not account-specific) are left
  // alone.
  if ('caches' in window) {
    void Promise.all(
      ['api-student-cache', 'api-course-content-cache', 'api-gamification-cache'].map((name) =>
        caches.delete(name).catch(() => {}),
      ),
    );
  }
  // Same reasoning for IndexedDB: the offline-sync pending-actions queue and
  // downloaded/in-progress course data aren't keyed by account either, and
  // unlike the Cache Storage entries above they survive a plain page reload
  // too. Without this, a queued offline mutation from the account logging
  // out would replay against the next account that logs in on this device.
  try {
    if (options.transferFrom && options.transferTo) {
      await resetOfflineDataOnLogin(options.transferFrom, options.transferTo);
    } else {
      await clearAllOfflineData(true);
    }
  } catch {
    // Browser storage may be unavailable; account/tenant session keys above
    // were still revoked and all cached attendance remains identity-scoped.
  }
}

function attendanceLoginTransfer(next: User, newLoginSessionId: string): { transferFrom: string | null; transferTo: string | null } {
  try {
    if (next.role !== 'teacher' || !next.organizationId) return { transferFrom: null, transferTo: null };
    const prepared = getPreparedTeacher(offlineAccountKey({
      hostname: window.location.hostname, organizationId: next.organizationId, id: next.id,
    }));
    const raw = localStorage.getItem(OFFLINE_TEACHER_IDENTITY_KEY);
    const last = prepared?.identity || (raw ? JSON.parse(raw) : null);
    if (!last) return { transferFrom: null, transferTo: null };
    if (last.role !== 'teacher' || last.id !== next.id ||
      last.organizationId !== next.organizationId || last.hostname !== window.location.hostname ||
      typeof last.loginSessionId !== 'string') return { transferFrom: null, transferTo: null };
    const prefix = [last.hostname, last.organizationId, last.id];
    return {
      transferFrom: [...prefix, last.loginSessionId].join(':'),
      transferTo: [...prefix, newLoginSessionId].join(':'),
    };
  } catch { return { transferFrom: null, transferTo: null }; }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);

  // Expose only the current authenticated role to the document so global
  // UI guards can make security-sensitive controls read-only without
  // duplicating auth state in individual pages. Backend authorization
  // remains authoritative; this is presentation/interaction protection.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (user?.role) document.documentElement.dataset.userRole = user.role;
    else delete document.documentElement.dataset.userRole;
    return () => {
      delete document.documentElement.dataset.userRole;
    };
  }, [user?.role]);

  // Institution type is immutable for org admins. Keep the control visibly
  // present for context, but make it genuinely non-interactive (including
  // keyboard focus) whenever the Organization Management modal renders it.
  useEffect(() => {
    if (typeof document === 'undefined' || user?.role !== 'org_admin') return;

    const lockInstitutionType = () => {
      document.querySelectorAll<HTMLSelectElement>('select[name="institutionType"]').forEach((select) => {
        select.disabled = true;
        select.setAttribute('aria-disabled', 'true');
        select.dataset.orgAdminLocked = 'true';
        select.tabIndex = -1;
      });
    };

    lockInstitutionType();
    const observer = new MutationObserver(lockInstitutionType);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.querySelectorAll<HTMLSelectElement>('select[data-org-admin-locked="true"]').forEach((select) => {
        select.disabled = false;
        select.removeAttribute('aria-disabled');
        delete select.dataset.orgAdminLocked;
        select.removeAttribute('tabindex');
      });
    };
  }, [user?.role]);

  useEffect(() => {
    const controller = new AbortController();
    const checkAuth = async () => {
      setIsLoading(true);
      setSessionError(false);
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      // A cold offline launch must pass the device PIN gate first. A cached
      // identity or bearer token alone must never silently unlock rosters.
      if (!navigator.onLine) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      try {
        const { data } = await api.get('/auth/me', { timeout: 15_000, signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!localStorage.getItem('loginSessionId')) localStorage.setItem('loginSessionId', newLoginSessionId());
        const verified = normalizeUser(data.data?.user, data.data?.profile);
        setUser(verified);
        await saveVerifiedTeacherIdentity(verified).then(() => {
          void prepareTeacherOfflineAutomatically(verified);
        }).catch(() => {
          // A verified online account is still usable when offline preparation fails.
        });
      } catch (err: any) {
        if (controller.signal.aborted) return;
        if (err?.response?.status === 401) {
          // A revoked/expired token cannot sync, but do not destroy an
          // unsent teacher attendance register: only the same account may
          // recover it after a new server-verified login.
          await clearAuthStorage({ preservePendingAttendance: true });
          setUser(null);
        } else if (!err?.response && (listAutomaticOfflineTeachers().length > 0 || !navigator.onLine)) {
          // Fall through to the login page, which offers PIN unlock only
          // when this exact teacher/device was prepared while online.
          setUser(null);
        } else {
          setSessionError(true);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void checkAuth();
    return () => controller.abort();
  }, [sessionAttempt]);

  // The org logo changes rarely (organization-branding-manage.tsx dispatches
  // this after an upload/removal) — update it in place here instead of
  // every header/sidebar instance keeping its own listener and own copy.
  useEffect(() => {
    const handleBrandingUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ organizationId?: string; logo?: string }>).detail;
      setUser((current) => {
        if (!current || !detail?.organizationId || String(detail.organizationId) !== String(current.organizationId || '')) return current;
        return { ...current, organizationLogo: detail.logo || undefined };
      });
    };
    window.addEventListener('organization-branding-updated', handleBrandingUpdate);
    return () => window.removeEventListener('organization-branding-updated', handleBrandingUpdate);
  }, []);

  // Login/register responses don't include profile/branding (see
  // normalizeUser), so firstName/organizationLogo fill in a moment later via
  // this background fetch instead of making login/register wait on it.
  const enrichUserInBackground = useCallback(() => {
    api.get('/auth/me').then(({ data }) => {
      setUser((current) => {
        if (!current) return current;
        const next = normalizeUser(data.data?.user, data.data?.profile);
        // Profile updates never replace a locally verified account password.
        // An online login explicitly enrolls the new password.
        return next;
      });
    }).catch(() => {
      // The basic user set at login/register already covers the app; this
      // only fills in the greeting name and org logo.
    });
  }, []);

  useEffect(() => {
    if (user?.role !== 'teacher' || user.offlineOnly) return;
    const refresh = () => {
      if (!navigator.onLine) return;
      void saveVerifiedTeacherIdentity(user).then(() => prepareTeacherOfflineAutomatically(user)).catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const poll = window.setInterval(refresh, 12 * 60 * 60_000);
    return () => {
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(poll);
    };
  }, [user?.id, user?.organizationId, user?.role, user?.offlineOnly]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const loginSessionId = newLoginSessionId();
    try {
      const { data } = await api.post('/auth/login', { email, password }, {
        headers: { 'X-Login-Session-Id': loginSessionId },
        timeout: 30_000,
      });

      if (data.success) {
        const accessToken = data.data?.accessToken;
        const userData = data.data?.user;
        const normalized = normalizeUser(userData);
        const transfer = attendanceLoginTransfer(normalized, loginSessionId);
        await clearAuthStorage(transfer);
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('loginSessionId', loginSessionId);
        setUser(normalized);
        await saveVerifiedTeacherIdentity(normalized).then(async () => {
          if (normalized.role === 'teacher') {
            const preparedIdentity = verifiedOfflineTeacherIdentity();
            if (preparedIdentity && preparedIdentity.id === normalized.id) {
              await enrollTeacherOfflinePassword(password, preparedIdentity);
              void prepareTeacherOfflineAutomatically(normalized);
            }
          }
        }).catch(() => {
          // Do not block a valid online login because offline setup failed.
        });
        enrichUserInBackground();
        return normalized;
      }
      throw new Error(data.message || 'Login failed');
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Login failed. Please try again.';
      setError(message);
      throw err;
    }
  }, [enrichUserInBackground]);

  const unlockOffline = useCallback(async (password: string, accountKey: string): Promise<User> => {
    setError(null);
    try {
      const identity = await unlockTeacherWithPassword(password, accountKey);
      const offlineUser: User = { ...normalizeUser(identity), offlineOnly: true };
      setUser(offlineUser);
      return offlineUser;
    } catch (err: any) {
      setError(err?.message || 'Offline unlock failed.');
      throw err;
    }
  }, []);

  const lockOfflineSession = useCallback(() => {
    lockOfflineTeacher();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('loginSessionId');
    localStorage.removeItem(OFFLINE_TEACHER_IDENTITY_KEY);
    setUser(null);
    setError(null);
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
        timeout: 30_000,
      });

      if (data.success) {
        await clearAuthStorage();
        const accessToken = data.data?.accessToken;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('loginSessionId', loginSessionId);
        setUser(normalizeUser(data.data?.user));
        enrichUserInBackground();
        return;
      }
      throw new Error(data.message || 'Registration failed');
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Registration failed. Please try again.';
      setError(message);
      throw err;
    }
  }, [enrichUserInBackground]);

  const logout = useCallback(async () => {
    // Keep loginSessionId in storage until the logout request is sent so the
    // backend can attach the logout event to the same login session.
    try {
      await api.post('/auth/logout');
    } catch {
      // Logout must still clear local state when the network is unavailable.
    }
    await clearAuthStorage();
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
    unlockOffline,
    lockOfflineSession,
    register,
    logout,
    completeOnboarding,
    error,
    clearError,
  };

  return <AuthContext.Provider value={value}>{sessionError ? (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)] p-6">
      <div role="alert" className="max-w-sm rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold">Unable to verify your session</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">The connection is taking longer than expected. Please check your internet connection and try again.</p>
        <button type="button" onClick={() => setSessionAttempt(attempt => attempt + 1)} className="mt-5 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
      </div>
    </div>
  ) : children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

export default AuthContext;
