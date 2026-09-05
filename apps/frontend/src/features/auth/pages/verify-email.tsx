/**
 * Verify Email Page
 * Confirms an account via POST /api/v1/auth/verify-email/:token, and offers a
 * resend form (POST /api/v1/auth/resend-verification) when the link is missing
 * or has expired.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/axios';

type Status = 'loading' | 'success' | 'error';

export function VerifyEmailPage() {
  const { t } = useTranslation('auth');
  const { t: tc } = useTranslation('common');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<Status>(token ? 'loading' : 'error');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        await api.post(`/auth/verify-email/${encodeURIComponent(token)}`);
        if (!cancelled) setStatus('success');
      } catch (err: any) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(err?.response?.data?.message || t('verify.error'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const onResend = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResending(true);
    setResendError(null);
    setResendSent(false);
    try {
      await api.post('/auth/resend-verification', { email: resendEmail });
      setResendSent(true);
    } catch (err: any) {
      setResendError(err?.response?.data?.message || err?.message || 'Something went wrong');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center bg-[var(--color-surface-secondary)] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{t('verify.title')}</h1>
          </div>

          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
              <p className="text-sm text-[var(--color-text-secondary)]">{t('verify.verifying')}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                {t('verify.success')}
              </div>
              <Link
                to="/auth/login"
                className="block w-full rounded-xl bg-primary-600 px-6 py-3 text-center text-sm font-semibold text-white shadow-md shadow-primary-600/20 transition-all hover:bg-primary-700"
              >
                {t('verify.go_to_login')}
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {errorMessage || t('verify.error')}
              </div>
              <div className="rounded-xl border border-[var(--color-border-default)] p-4">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{t('verify.resend_title')}</p>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{t('verify.resend_subtitle')}</p>
                {resendSent && (
                  <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800">{t('verify.resend_success')}</div>
                )}
                {resendError && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{resendError}</div>
                )}
                <form onSubmit={onResend} className="mt-3 space-y-3">
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder={t('verify.email_placeholder')}
                    autoComplete="email"
                    required
                    className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={resending}
                    className="w-full rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-primary-600/20 transition-all hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {resending ? tc('loading') : t('verify.resend_button')}
                  </button>
                </form>
              </div>
              <p className="text-center text-sm text-[var(--color-text-secondary)]">
                <Link to="/auth/login" className="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
                  {t('verify.go_to_login')}
                </Link>
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--color-text-tertiary)]">
          <Link to="/" className="hover:text-[var(--color-text-primary)] transition-colors">&larr; {tc('back_to_top')}</Link>
        </p>
      </div>
    </div>
  );
}

export default VerifyEmailPage;

