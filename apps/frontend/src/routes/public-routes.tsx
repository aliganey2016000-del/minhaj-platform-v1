/**
 * Public Routes Configuration
 *
 * Defines routes for the public-facing website.
 * Uses React Router's lazy loading for code splitting.
 */

import { lazy, Suspense } from 'react';
import { type RouteObject } from 'react-router-dom';
import { PublicLayout } from '../components/layout/public-layout';

// ---------------------------------------------------------------------------
// Lazy-loaded pages
// ---------------------------------------------------------------------------

const LandingPage = lazy(() =>
  import('../features/public/pages/landing').then((m) => ({ default: m.LandingPage }))
);

const SuganhubLandingPage = lazy(() =>
  import('../features/public/pages/suganhub-landing').then((m) => ({ default: m.SuganhubLandingPage }))
);

// Teacher Attendance is exposed as a dedicated top-level route until the
// teacher route tree is regenerated. It remains strictly protected by the
// same TeacherGuard and TeacherLayout used by the teacher portal.
const TeacherAttendance = lazy(() =>
  import('../features/teacher/pages/teacher-attendance').then((m) => ({ default: m.TeacherAttendance }))
);
const TeacherLayout = lazy(() =>
  import('../features/teacher/components/teacher-layout').then((m) => ({ default: m.TeacherLayout }))
);
const TeacherGuard = lazy(() =>
  import('../features/teacher/components/teacher-guard').then((m) => ({ default: m.TeacherGuard }))
);

// Custom domains that get their own dedicated landing page instead of the
// generic multi-tenant SaaS marketing page. Checked directly against
// window.location.hostname rather than the subdomain-only TenantContext,
// since these are fully separate top-level domains, not *.sahaledu.com
// subdomains.
const CUSTOM_DOMAIN_LANDING: Record<string, typeof SuganhubLandingPage> = {
  'suganhub.com': SuganhubLandingPage,
};

function HomePage() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname.replace(/^www\./, '') : '';
  const CustomLanding = CUSTOM_DOMAIN_LANDING[hostname];
  return CustomLanding ? <CustomLanding /> : <LandingPage />;
}

// ---------------------------------------------------------------------------
// Fallback loading component
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route Definitions
// ---------------------------------------------------------------------------

export const publicRoutes: RouteObject[] = [
  // Dedicated teacher attendance entrypoint. This is role-protected and
  // renders the same teacher portal shell, so /teacher/attendance no longer
  // falls through to the generic 404 route while the main teacher route tree
  // is kept unchanged.
  {
    path: 'teacher/attendance',
    element: (
      <Suspense fallback={<PageLoader />}>
        <TeacherGuard>
          <TeacherLayout />
        </TeacherGuard>
      </Suspense>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<PageLoader />}>
            <TeacherAttendance />
          </Suspense>
        ),
      },
    ],
  },
  {
    element: (
      <Suspense fallback={<PageLoader />}>
        <PublicLayout />
      </Suspense>
    ),
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<PageLoader />}>
            <HomePage />
          </Suspense>
        ),
      },
      // Additional public routes will be added here:
      // { path: 'about', element: <AboutPage /> },
      // { path: 'courses', element: <CoursesPage /> },
      // { path: 'events', element: <EventsPage /> },
      // { path: 'news', element: <NewsPage /> },
      // { path: 'news/:slug', element: <NewsArticlePage /> },
      // { path: 'gallery', element: <GalleryPage /> },
      // { path: 'contact', element: <ContactPage /> },
    ],
  },
];
