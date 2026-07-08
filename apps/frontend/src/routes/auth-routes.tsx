/**
 * Auth Routes Configuration
 */

import { lazy, Suspense } from 'react';
import { type RouteObject } from 'react-router-dom';

const LoginPage = lazy(() =>
  import('../features/auth/pages/login').then((m) => ({ default: m.LoginPage }))
);

const RegisterPage = lazy(() =>
  import('../features/auth/pages/register').then((m) => ({ default: m.RegisterPage }))
);

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
        <p className="text-sm text-[var(--color-text-tertiary)]">Loading...</p>
      </div>
    </div>
  );
}

export const authRoutes: RouteObject[] = [
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        element: (
          <Suspense fallback={<PageLoader />}>
            <LoginPage />
          </Suspense>
        ),
      },
      {
        path: 'register',
        element: (
          <Suspense fallback={<PageLoader />}>
            <RegisterPage />
          </Suspense>
        ),
      },
    ],
  },
];