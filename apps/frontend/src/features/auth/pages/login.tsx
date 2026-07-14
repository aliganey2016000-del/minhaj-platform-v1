/**
 * Login Page — Fully Functional
 *
 * Uses React Hook Form + Zod for validation.
 * Connects to backend /api/v1/auth/login via AuthContext.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../../../store/auth-context';

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
  const { login, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      // Redirect based on role — org_admin and teacher share the admin
      // portal shell (backend RBAC scopes what each can actually do there).
      const role = userData?.role || 'student';
      if (role === 'admin' || role === 'org_admin' || role === 'teacher') navigate('/admin');
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
            <Link to="/" className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-gold-sm">
              <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5zm0 17.5c-4.2-1.4-8-4.93-8-9V8.81l8-4 8 4V10.5c0 4.07-3.8 7.6-8 9z"/>
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('login.title')}</h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{tc('site_tagline')}</p>
          </div>

          {/* Error banner */}
          {authError && (
            <div className="mb-6 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
              <p className="text-sm text-red-700 dark:text-red-300">{authError}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                placeholder={t('login.password_placeholder')}
              />
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
          </form>

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