/**
 * Forgot Password Page
 * Requests a password-reset link via POST /api/v1/auth/forgot-password.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import api from '../../../lib/axios';

const forgotSchema = z.object({
  email: z.string().email('Invalid email'),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: ForgotFormData) => {
    setIsSubmitting(true);
    setFormError(null);
    try {
      await api.post('/auth/forgot-password', { email: data.email });
      setSubmitted(true);
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
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('forgot.title')}</h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{t('forgot.subtitle')}</p>
          </div>

          {submitted ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                {t('forgot.success')}
              </div>
              <Link
                to="/auth/login"
                className="block w-full rounded-xl bg-primary-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-md shadow-primary-600/20 transition-all hover:bg-primary-700"
              >
                {t('forgot.back_to_login')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>
              )}
              <div>
                <label htmlFor="fp-email" className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]">
                  {t('forgot.email_label')}
                </label>
                <input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('forgot.email_placeholder')}
                  {...register('email')}
                  className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
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
                  t('forgot.submit_button')
                )}
              </button>
              <p className="text-center text-sm text-[var(--color-text-secondary)]">
                <Link to="/auth/login" className="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
                  {t('forgot.back_to_login')}
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

export default ForgotPasswordPage;
