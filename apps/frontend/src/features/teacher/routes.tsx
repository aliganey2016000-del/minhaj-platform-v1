/**
 * Teacher Portal Routes
 *
 * Wires exam portal + existing teacher routes together.
 * Teachers see only their own courses' exams (backend scopes via tenant-scope).
 */

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Existing teacher pages (assumed to exist)
const TeacherDashboard = lazy(() => import('./dashboard').then(m => ({ default: m.TeacherDashboard })));
const TeacherResults = lazy(() => import('./pages/results-enter').then(m => ({ default: m.TeacherResultsEnter })));

// NEW: Unified exam portal (Jadwal + Attendance + Incidents)
const TeacherExamPortal = lazy(() => import('./pages/exam-portal').then(m => ({ default: m.TeacherExamPortal })));

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" />
        <p className="text-sm text-[var(--color-text-tertiary)]">Loading...</p>
      </div>
    </div>
  );
}

export function TeacherRoutes() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Dashboard */}
        <Route path="/" element={<TeacherDashboard />} />

        {/* Results Entry (Existing) */}
        <Route path="/results/enter" element={<TeacherResults />} />

        {/* NEW: Exam Portal — Jadwal + Attendance + Incidents */}
        <Route path="/exams" element={<TeacherExamPortal />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Routes>
    </Suspense>
  );
}
