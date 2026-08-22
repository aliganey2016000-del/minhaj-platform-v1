/**
 * Main Route Configuration
 *
 * Combines public, auth, admin, student, parent, and teacher routes.
 * Uses createBrowserRouter for React Router v6 data API.
 * Teacher portal is strictly sandboxed — no admin routes or finance access.
 */

import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { publicRoutes } from './public-routes';
import { authRoutes } from './auth-routes';

// Teacher assignments is intentionally a teacher-specific lightweight UI.
const TeacherAssignments = lazy(() =>
  import('../features/teacher/pages/teacher-assignments').then((m) => ({ default: m.TeacherAssignments }))
);

// Keep the existing route module and lazily load the full portal tree.
const PortalRouter = lazy(() => import('./teacher-and-portal-routes').then((m) => ({ default: m.PortalRouter })));

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

const L = (el: JSX.Element) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

export const router = createBrowserRouter([
  ...publicRoutes,
  ...authRoutes,
  {
    path: 'teacher',
    element: L(<PortalRouter />),
    children: [
      { path: 'assignments', element: L(<TeacherAssignments />) },
    ],
  },
]);

export default router;
