/**
 * Public Routes Configuration
 */

import { lazy, Suspense } from 'react';
import { type RouteObject } from 'react-router-dom';
import { PublicLayout } from '../components/layout/public-layout';

const LandingPage = lazy(() => import('../features/public/pages/landing').then((m) => ({ default: m.LandingPage })));
const SuganhubLandingPage = lazy(() => import('../features/public/pages/suganhub-landing').then((m) => ({ default: m.SuganhubLandingPage })));
const TeacherAttendance = lazy(() => import('../features/teacher/pages/teacher-attendance').then((m) => ({ default: m.TeacherAttendance })));
const TeacherTakeAttendance = lazy(() => import('../features/teacher/pages/teacher-take-attendance').then((m) => ({ default: m.TeacherTakeAttendance })));
const TeacherAssignments = lazy(() => import('../features/teacher/pages/teacher-assignments').then((m) => ({ default: m.TeacherAssignments })));
const TeacherLayout = lazy(() => import('../features/teacher/components/teacher-layout').then((m) => ({ default: m.TeacherLayout })));
const TeacherGuard = lazy(() => import('../features/teacher/components/teacher-guard').then((m) => ({ default: m.TeacherGuard })));

const CUSTOM_DOMAIN_LANDING: Record<string, typeof SuganhubLandingPage> = { 'suganhub.com': SuganhubLandingPage };

function HomePage() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname.replace(/^www\./, '') : '';
  const CustomLanding = CUSTOM_DOMAIN_LANDING[hostname];
  return CustomLanding ? <CustomLanding /> : <LandingPage />;
}

function PageLoader() {
  return <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]"><div className="flex flex-col items-center gap-4"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /><p className="text-sm text-[var(--color-text-tertiary)]">Loading...</p></div></div>;
}

const teacherShell = <Suspense fallback={<PageLoader />}><TeacherGuard><TeacherLayout /></TeacherGuard></Suspense>;
const lazyPage = (element: JSX.Element) => <Suspense fallback={<PageLoader />}>{element}</Suspense>;

export const publicRoutes: RouteObject[] = [
  {
    path: 'teacher/attendance',
    element: teacherShell,
    children: [
      { index: true, element: lazyPage(<TeacherAttendance />) },
      { path: 'take/:scheduleId', element: lazyPage(<TeacherTakeAttendance />) },
    ],
  },
  {
    path: 'teacher/assignments',
    element: teacherShell,
    children: [{ index: true, element: lazyPage(<TeacherAssignments />) }],
  },
  {
    element: <Suspense fallback={<PageLoader />}><PublicLayout /></Suspense>,
    children: [{ index: true, element: lazyPage(<HomePage />) }],
  },
];
