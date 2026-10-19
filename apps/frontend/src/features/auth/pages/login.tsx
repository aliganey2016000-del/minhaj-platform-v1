/**
 * Login Page — Fully Functional
 *
 * Uses React Hook Form + Zod for validation.
 * Connects to backend /api/v1/auth/login via AuthContext.
 */

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../../../store/auth-context';
import { useTenant } from '../../../store/tenant-context';
import { listAutomaticOfflineTeachers } from '../../../lib/offline-teacher-password';
import { WifiOff, LockKeyhole, Wifi } from 'lucide-react';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoginPage() {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const { login, unlockOffline, error: authError, clearError } = useAuth();
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const [offlinePassword, setOfflinePassword] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState('');
  const [preparedAccounts, setPreparedAccounts] = useState(listAutomaticOfflineTeachers);
  const [selectedAccount, setSelectedAccount] = useState(() => listAutomaticOfflineTeachers().find(a => !a.expired)?.key || '');
  const refreshAccounts = () => {
    const accounts = listAutomaticOfflineTeachers();
    setPreparedAccounts(accounts);
    setSelectedAccount(previous =>
      accounts.some(a => a.key === previous && !a.expired) ? previous : accounts.find(a => !a.expired)?.key || '');
  };

  useEffect(() => {
    const onOnline = () => { setOnline(true); refreshAccounts(); };
    const onOffline = () => { setOnline(false); setOfflineMode(true); refreshAccounts(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const onOfflineUnlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pinBusy) return;
    setPinBusy(true);
    setPinError('');
    try {
      await unlockOffline(offlinePassword, selectedAccount);
      navigate('/teacher/attendance', { replace: true });
    } catch (err: any) {
      setPinError(err?.message || 'Could not unlock offline attendance.');
    } finally { setPinBusy(false); }
  };
  const tenantLogo = !tenant?.isMainSite ? tenant?.branding?.logo?.trim() : '';
  const tenantName = !tenant?.isMainSite ? tenant?.name?.trim() : '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    clearError();
    try {
      const userData: any = await login(data.email, data.password);
      // If the guard bounced them here from a specific page (session expired
      // mid-use, or a bookmarked deep link), send them straight back to it
      // instead of the default dashboard — the guard re-checks role on that
      // page anyway, so this is safe even if the "from" page belongs to a
      // different portal than this account turns out to have. Router state
      // covers the client-side redirect case; the query param covers the
      // hard window.location redirect axios.ts falls back to when a silent
      // token refresh fails outright (see lib/axios.ts).
      const stateFrom = (location.state as { from?: string } | null)?.from;
      const queryFrom = new URLSearchParams(location.search).get('from');
      // Only ever follow a same-app relative path — never an absolute URL
      // or protocol-relative one — so this can't become an open redirect.
      const isSafeRelativePath = (p: string | null | undefined): p is string =>
        !!p && p.startsWith('/') && !p.startsWith('//');
      const from = isSafeRelativePath(stateFrom) ? stateFrom : isSafeRelativePath(queryFrom) ? queryFrom : null;
      const role = userData?.role || 'student';
      const canUseRequestedPortal = !from
        || (role === 'staff' && from.startsWith('/admin'))
        || ((role === 'admin' || role === 'org_admin') && from.startsWith('/admin'))
        || (role === 'teacher' && from.startsWith('/teacher'))
        || (role === 'parent' && from.startsWith('/parent'))
        || (role === 'student' && from.startsWith('/student'));
      if (from && canUseRequestedPortal) {
        navigate(from);
        return;
      }
      // Redirect based on role — staff use the admin shell, while the
      // sidebar and backend permissions limit them to the pages granted.
      if (role === 'staff' || role === 'admin' || role === 'org_admin') navigate('/admin');
      else if (role === 'teacher') navigate('/teacher');
      else if (role === 'parent') navigate('/parent');
      else navigate('/student');
    } catch {
      // Error is handled by auth context
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center bg-[var(--color-surface-secondary)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 shadow-elevated">
          {/* Header */}
          <div className="mb-8 text-center">
            <Link
              to="/"
              aria-label={tenantName ? `${tenantName} home` : 'Home'}
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-gold-sm ${tenantLogo ? 'border border-[var(--color-border-default)] bg-white p-1.5' : 'bg-primary-600 text-white'}`}
            >
              {tenantLogo ? (
                <img
                  src={tenantLogo}
                  alt={tenantName ? `${tenantName} logo` : 'Organization logo'}
                  className="h-full w-full object-contain"
                />
              ) : (
                <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5zm0 17.5c-4.2-1.4-8-4.93-8-9V8.81l8-4 8 4V10.5c0 4.07-3.8 7.6-8 9z"/>
                </svg>
              )}
            </Link>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('login.title')}</h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{tc('site_tagline')}</p>
          </div>

          {/* Offline password unlock requires the teacher's prior online-verified login. */}
          {(offlineMode || !online) && (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
              <div className="mb-3 flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300">
                <WifiOff className="h-5 w-5" />
                <span className="text-sm font-black">Offline Attendance</span>
              </div>
              {preparedAccounts.some(a => !a.expired) ? (
                <form onSubmit={onOfflineUnlock} className="space-y-3">
                  <p className="text-center text-xs text-[var(--color-text-secondary)]">Use the same password as your SAHAL teacher account. No separate PIN or Prepare Offline is required.</p>
                  <label htmlFor="teacher-offline-account" className="block text-xs font-bold text-[var(--color-text-primary)]">Teacher account</label>
                  <select id="teacher-offline-account" value={selectedAccount}
                    onChange={(event) => { setSelectedAccount(event.target.value); setOfflinePassword(''); setPinError(''); }}
                    className="w-full rounded-xl border border-emerald-200 bg-[var(--color-surface-primary)] px-3 py-3 text-sm font-semibold">
                    {preparedAccounts.filter(a => !a.expired).map(account =>
                      <option key={account.key} value={account.key}>{account.email}</option>)}
                  </select>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    Each teacher has a separate password verifier, cached rosters and pending attendance on this device.
                  </p>
                  {preparedAccounts.find(a => a.key === selectedAccount)?.warning && (
                    <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                      7 days without online verification. Reconnect within 24 hours to sync your saved attendance. Otherwise offline access will be locked.
                    </p>
                  )}
                  <label htmlFor="offline-password" className="block text-xs font-bold text-[var(--color-text-primary)]">Account password</label>
                  <input id="offline-password" type="password" autoComplete="off"
                    value={offlinePassword} onChange={(event) => setOfflinePassword(event.target.value)}
                    className="w-full rounded-xl border border-emerald-200 bg-[var(--color-surface-primary)] px-4 py-3 text-sm outline-none focus:border-emerald-600"
                    placeholder="••••••" required />
                  {(pinError || authError) && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{pinError || authError}</p>}
                  <button type="submit" disabled={pinBusy || offlinePassword.length === 0 || !selectedAccount}
                    className="flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                    <LockKeyhole className="h-4 w-4" />{pinBusy ? 'Unlocking...' : 'Open Offline Attendance'}
                  </button>
                  <p className="text-center text-[11px] text-[var(--color-text-tertiary)]">Available only on a previously verified teacher device.</p>
                </form>
              ) : (
                <p role="status" className="text-center text-sm text-amber-800 dark:text-amber-300">No offline account is ready or the 24-hour reconnect grace has passed. Connect online and sign in once with your school password to renew and automatically download attendance.</p>
              )}
            </div>
          )}
          {online && (
            <button type="button" onClick={() => { setOfflineMode(v => !v); refreshAccounts(); setPinError(''); }}
              className="mb-4 flex w-full items-center justify-center gap-2 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
              {offlineMode ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {offlineMode ? 'Use email and password instead' : 'Use offline with account password'}
            </button>
          )}

          {/* Error banner */}
          {authError && !offlineMode && online && (
            <div className="mb-6 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
              <p className="text-sm text-red-700 dark:text-red-300">{authError}</p>
            </div>
          )}

          {/* Form */}
          {!offlineMode && online && <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                {t('login.email_label')}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...register('email')}
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                placeholder={t('login.email_placeholder')}
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                {t('login.password_label')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...register('password')}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 pe-11 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                  placeholder={t('login.password_placeholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 end-0 flex items-center px-3.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {/* Remember me + Forgot */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-[var(--color-text-secondary)] cursor-pointer">
                <input type="checkbox" {...register('rememberMe')} className="rounded border-[var(--color-border-default)]" />
                {t('login.remember_me')}
              </label>
              <a href="/auth/forgot-password" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium">
                {t('login.forgot_password')}
              </a>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-primary-600/20 transition-all hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-600/30 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {tc('loading')}
                </span>
              ) : (
                t('login.submit_button')
              )}
            </button>
          </form>}

          {/* Footer link */}
          <p className="mt-6 text-center text-sm text-[var(--color-text-secondary)]">
            {t('login.no_account')}{' '}
            <Link to="/auth/register" className="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
              {t('login.register_link')}
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-text-tertiary)]">
          <Link to="/" className="hover:text-[var(--color-text-primary)] transition-colors">&larr; {tc('back_to_top')}</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;