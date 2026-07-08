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
            <LandingPage />
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