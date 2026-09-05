/**
 * Reset Password Page
 * Sets a new password via POST /api/v1/auth/reset-password/:token.
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import api from '../../../lib/axios';

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, 'Must include uppercase, lowercase, a number, and a special character'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetFormData = z.infer<typeof resetSchema>;

export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (data: ResetFormData) => {
    if (!token) {
      setFormError(t('reset.invalid_token'));
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      await api.post(`/auth/reset-password/${encodeURIComponent(token)}`, {
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      setDone(true);
    } catch (err: any) {
      setFormError(err?.response?.data?.message || err?.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center bg-[var(--color-surface-secondary)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('reset.title')}</h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{t('reset.subtitle')}</p>
          </div>

          {done ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                {t('reset.success')}
              </div>
              <Link
                to="/auth/login"
                className="block w-full rounded-xl bg-primary-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-md shadow-primary-600/20 transition-all hover:bg-primary-700"
              >
                {t('reset.go_to_login')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>
              )}
              <div>
                <label htmlFor="rp-password" className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                  {t('reset.password_label')}
                </label>
                <input
                  id="rp-password"
                  type="password"
                  autoComplete="new-password"
                  {...register('password')}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                />
                {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
              </div>
              <div>
                <label htmlFor="rp-confirm" className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                  {t('reset.confirm_password')}
                </label>
                <input
                  id="rp-confirm"
                  type="password"
                  autoComplete="new-password"
                  {...register('confirmPassword')}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                />
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword.message}</p>}
              </div>
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
                  t('reset.submit_button')
                )}
              </button>
              <p className="text-center text-sm text-[var(--color-text-secondary)]">
                <Link to="/auth/forgot-password" className="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
                  {t('reset.request_new')}
                </Link>
              </p>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-text-tertiary)]">
          <Link to="/" className="hover:text-[var(--color-text-primary)] transition-colors">&larr; {tc('back_to_top')}</Link>
        </p>
      </div>
    </div>
  );
}

export default ResetPasswordPage;

