/**
 * Teacher Course Builder — Full Course Authoring Access
 *
 * Teachers with 'COURSE_BUILDER' permission access the complete admin course
 * builder to create/edit chapters, lessons, quizzes, and assignments.
 *
 * This is a wrapper that re-exports the admin CourseBuilder with:
 * - Permission validation (must have COURSE_BUILDER permission)
 * - Teacher-specific context setup
 * - Fallback to student view if permission is revoked
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';
import { CourseBuilder as CourseBuilderWorkspace } from '../../../features/admin/pages/course-builder';
import { useCourseBuilderMobileMenu } from '../../shared/hooks/use-course-builder-mobile-menu';

// ---------------------------------------------------------------------------
// Permission Guard & Wrapper
// ---------------------------------------------------------------------------

export function TeacherCourseBuilder() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [permission, setPermission] = useState<'COURSE_BUILDER' | 'STUDENT_VIEW' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useCourseBuilderMobileMenu(rootRef);

  useEffect(() => {
    const checkPermission = async () => {
      setLoading(true);
      setError('');
      try {
        // Verifies this teacher actually owns `courseId` — the backend
        // throws (403/404) via assertTeacherOwnsCourse if not, which the
        // catch block below treats as a hard denial. Checking the global
        // dashboard permission alone (previous behavior) never validated
        // course ownership, only the account-wide role flag.
        await api.get(`/teacher-portal/courses/${courseId}/chapters`);

        const { data } = await api.get('/teacher-portal/dashboard');
        const teacherPermission = data.data?.teacher?.coursePermission === 'COURSE_BUILDER'
          ? 'COURSE_BUILDER'
          : 'STUDENT_VIEW';

        if (teacherPermission !== 'COURSE_BUILDER') {
          setError('You do not have permission to edit this course');
          setPermission('STUDENT_VIEW');
          // Redirect to student view after 2 seconds
          setTimeout(() => {
            navigate(`/teacher/lessons?courseId=${courseId}`);
          }, 2000);
          return;
        }

        setPermission('COURSE_BUILDER');
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to verify permissions');
        setTimeout(() => {
          navigate(`/teacher/courses`);
        }, 2000);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [courseId, navigate]);

  // -----------------------------------------------------------------------
  // Loading State
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="text-center space-y-4">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-border-default)] border-t-primary-600" />
          <p className="text-sm text-[var(--color-text-secondary)]">Verifying permissions...</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Error State
  // -----------------------------------------------------------------------
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-secondary)]">
        <div className="text-center space-y-4 max-w-md">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <span className="text-2xl">🔒</span>
          </div>
          <h2 className="text-lg font-bold text-red-600 dark:text-red-400">{error}</h2>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Redirecting you back...
          </p>
          <button
            onClick={() => navigate('/teacher/courses')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            ← Return to Courses
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Permission Granted — Render the existing admin course builder workspace
  // -----------------------------------------------------------------------
  if (permission === 'COURSE_BUILDER') {
    // The mobile-responsive layout fixes for this workspace (revealing the
    // otherwise hover-only edit/publish/delete actions on touch screens via
    // useCourseBuilderMobileMenu, and constraining item rows so they don't
    // overflow narrow viewports — see assets/styles/course-builder-responsive.css)
    // are scoped to this class. The admin route picks it up via
    // institution-course-builder.tsx; this teacher-facing route rendered the
    // same workspace without it, so on a phone a teacher could see a
    // lesson/quiz/assignment row but had no way to edit, publish/unpublish
    // or delete it (those controls are opacity-0 until :hover, which never
    // fires on a touchscreen).
    return (
      <div ref={rootRef} className="institution-course-builder-approved">
        <CourseBuilderWorkspace basePath="/teacher" />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Fallback (should not reach here)
  // -----------------------------------------------------------------------
  return null;
}

export default TeacherCourseBuilder;
