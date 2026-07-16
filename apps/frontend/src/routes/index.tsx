/**
 * Main Route Configuration
 *
 * Combines public, auth, admin, student, and parent routes.
 * Uses createBrowserRouter for React Router v6 data API.
 */

import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { publicRoutes } from './public-routes';
import { authRoutes } from './auth-routes';

// ---------------------------------------------------------------------------
// Lazy-loaded components
// ---------------------------------------------------------------------------

const StudentLayout = lazy(() =>
  import('../features/student/components/student-layout').then((m) => ({ default: m.StudentLayout }))
);
const StudentDashboard = lazy(() =>
  import('../features/student/pages/student-dashboard').then((m) => ({ default: m.StudentDashboard }))
);
const StudentCourses = lazy(() =>
  import('../features/student/pages/student-courses').then((m) => ({ default: m.StudentCourses }))
);
const StudentAvailable = lazy(() =>
  import('../features/student/pages/student-available').then((m) => ({ default: m.StudentAvailable }))
);
const StudentAssignments = lazy(() =>
  import('../features/student/pages/student-assignments').then((m) => ({ default: m.StudentAssignments }))
);
const StudentDownloads = lazy(() =>
  import('../features/student/pages/student-downloads').then((m) => ({ default: m.StudentDownloads }))
);
const StudentExams = lazy(() =>
  import('../features/student/pages/student-exams').then((m) => ({ default: m.StudentExams }))
);
const StudentExamResults = lazy(() =>
  import('../features/student/pages/student-exam-results').then((m) => ({ default: m.StudentExamResults }))
);
const StudentExamSeating = lazy(() =>
  import('../features/student/pages/student-exam-seating').then((m) => ({ default: m.StudentExamSeating }))
);
const StudentExamAttendance = lazy(() =>
  import('../features/student/pages/student-exam-attendance').then((m) => ({ default: m.StudentExamAttendance }))
);
const StudentAttendance = lazy(() =>
  import('../features/student/pages/student-attendance').then((m) => ({ default: m.StudentAttendance }))
);
const StudentCertificates = lazy(() =>
  import('../features/student/pages/student-certificates').then((m) => ({ default: m.StudentCertificates }))
);
const StudentBookmarks = lazy(() =>
  import('../features/student/pages/student-bookmarks').then((m) => ({ default: m.StudentBookmarks }))
);
const StudentNotifications = lazy(() =>
  import('../features/student/pages/student-notifications').then((m) => ({ default: m.StudentNotifications }))
);
const StudentProfileView = lazy(() =>
  import('../features/student/pages/student-profile').then((m) => ({ default: m.StudentProfile }))
);
const StudentSettings = lazy(() =>
  import('../features/student/pages/student-settings').then((m) => ({ default: m.StudentSettings }))
);
const StudentCourseLearn = lazy(() =>
  import('../features/student/pages/student-course-learn').then((m) => ({ default: m.StudentCourseLearn }))
);
const StudentCourseDetail = lazy(() =>
  import('../features/student/pages/student-course-detail').then((m) => ({ default: m.StudentCourseDetail }))
);
const StudentPage = lazy(() =>
  import('../features/student/pages/generic-page').then((m) => ({ default: m.StudentPage }))
);
const AdminLayout = lazy(() =>
  import('../features/admin/components/admin-layout').then((m) => ({ default: m.AdminLayout }))
);
const ParentLayout = lazy(() =>
  import('../features/parent/components/parent-layout').then((m) => ({ default: m.ParentLayout }))
);
const AdminDashboard = lazy(() =>
  import('../features/admin/pages/admin-dashboard').then((m) => ({ default: m.AdminDashboard }))
);
const CoursesManage = lazy(() =>
  import('../features/admin/pages/courses-manage').then((m) => ({ default: m.CoursesManage }))
);
const CourseBuilder = lazy(() =>
  import('../features/admin/pages/course-builder').then((m) => ({ default: m.CourseBuilder }))
);
const LessonEditPage = lazy(() =>
  import('../features/admin/pages/lesson-edit-page').then((m) => ({ default: m.LessonEditPage }))
);
const QuizEditPage = lazy(() =>
  import('../features/admin/pages/quiz-edit-page').then((m) => ({ default: m.QuizEditPage }))
);
const CoursePreview = lazy(() =>
  import('../features/admin/pages/course-preview').then((m) => ({ default: m.CoursePreview }))
);
const SchoolsManage = lazy(() =>
  import('../features/admin/pages/schools-manage').then((m) => ({ default: m.SchoolsManage }))
);
const StudentsManage = lazy(() =>
  import('../features/admin/pages/students-manage').then((m) => ({ default: m.StudentsManage }))
);
const PaymentsManage = lazy(() =>
  import('../features/admin/pages/payments-manage').then((m) => ({ default: m.PaymentsManage }))
);
const AttendanceManage = lazy(() =>
  import('../features/admin/pages/attendance-manage').then((m) => ({ default: m.AttendanceManage }))
);
const ClassesManage = lazy(() =>
  import('../features/admin/pages/classes-manage').then((m) => ({ default: m.ClassesManage }))
);
const TeachersManage = lazy(() =>
  import('../features/admin/pages/teachers-manage').then((m) => ({ default: m.TeachersManage }))
);
const ParentsManage = lazy(() =>
  import('../features/admin/pages/parents-manage').then((m) => ({ default: m.ParentsManage }))
);
const ExamsManage = lazy(() =>
  import('../features/admin/pages/exams-manage').then((m) => ({ default: m.ExamsManage }))
);
const ResultsManage = lazy(() =>
  import('../features/admin/pages/results-manage').then((m) => ({ default: m.ResultsManage }))
);
const ExamRoomsManage = lazy(() =>
  import('../features/admin/pages/exam-rooms-manage').then((m) => ({ default: m.ExamRoomsManage }))
);
const ExamAttendanceManage = lazy(() =>
  import('../features/admin/pages/exam-attendance-manage').then((m) => ({ default: m.ExamAttendanceManage }))
);
const CertificatesManage = lazy(() =>
  import('../features/admin/pages/certificates-manage').then((m) => ({ default: m.CertificatesManage }))
);
const AnnouncementsManage = lazy(() =>
  import('../features/admin/pages/announcements-manage').then((m) => ({ default: m.AnnouncementsManage }))
);
const NewsManage = lazy(() =>
  import('../features/admin/pages/news-manage').then((m) => ({ default: m.NewsManage }))
);
const EventsManage = lazy(() =>
  import('../features/admin/pages/events-manage').then((m) => ({ default: m.EventsManage }))
);
const GalleryManage = lazy(() =>
  import('../features/admin/pages/gallery-manage').then((m) => ({ default: m.GalleryManage }))
);
const RolesManage = lazy(() =>
  import('../features/admin/pages/roles-manage').then((m) => ({ default: m.RolesManage }))
);
const SettingsManage = lazy(() =>
  import('../features/admin/pages/settings-manage').then((m) => ({ default: m.SettingsManage }))
);
const AnalyticsManage = lazy(() =>
  import('../features/admin/pages/analytics-manage').then((m) => ({ default: m.AnalyticsManage }))
);
const ActivityLogsManage = lazy(() =>
  import('../features/admin/pages/activity-logs-manage').then((m) => ({ default: m.ActivityLogsManage }))
);
const ProfileManage = lazy(() =>
  import('../features/admin/pages/profile-manage').then((m) => ({ default: m.ProfileManage }))
);
const PortalPage = lazy(() =>
  import('../features/shared/pages/portal-page').then((m) => ({ default: m.PortalPage }))
);
const ForumPage = lazy(() =>
  import('../features/shared/pages/forum-page').then((m) => ({ default: m.ForumPage }))
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

// ---------------------------------------------------------------------------
// All routes helper — wraps element in Suspense
// ---------------------------------------------------------------------------

const L = (el: JSX.Element) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

// ---------------------------------------------------------------------------
// Router Instance
// ---------------------------------------------------------------------------

export const router = createBrowserRouter([
  ...publicRoutes,
  ...authRoutes,

  // ── Student Portal ──
  {
    path: 'student',
    element: L(<StudentLayout />),
    children: [
      { index: true, element: L(<StudentDashboard />) },
      { path: 'courses', element: L(<StudentCourses />) },
      { path: 'courses/:courseId', element: L(<StudentCourseDetail />) },
      { path: 'courses/:courseId/learn', element: L(<StudentCourseLearn />) },
      { path: 'available', element: L(<StudentAvailable />) },
      { path: 'assignments', element: L(<StudentAssignments />) },
      { path: 'exams', element: L(<StudentExams />) },
      { path: 'exams/seating', element: L(<StudentExamSeating />) },
      { path: 'exams/active', element: L(<StudentPage />) },
      { path: 'exams/attendance', element: L(<StudentExamAttendance />) },
      { path: 'exams/results', element: L(<StudentExamResults />) },
      { path: 'exams/appeals', element: L(<StudentPage />) },
      { path: 'certificates', element: L(<StudentCertificates />) },
      { path: 'attendance', element: L(<StudentAttendance />) },
      { path: 'downloads', element: L(<StudentDownloads />) },
      { path: 'bookmarks', element: L(<StudentBookmarks />) },
      { path: 'notifications', element: L(<StudentNotifications />) },
      { path: 'forum', element: L(<ForumPage />) },
      { path: 'profile', element: L(<StudentProfileView />) },
      { path: 'settings', element: L(<StudentSettings />) },
    ],
  },

  // ── Admin Portal (shared with teachers) ──
  {
    path: 'admin',
    element: L(<AdminLayout />),
    children: [
      { index: true, element: L(<AdminDashboard />) },
      { path: 'students', element: L(<StudentsManage />) },
      { path: 'parents', element: L(<ParentsManage />) },
      { path: 'teachers', element: L(<TeachersManage />) },
      {
        path: 'courses',
        children: [
          { index: true, element: L(<CoursesManage />) },
          { path: ':courseId/builder', element: L(<CourseBuilder />) },
          { path: ':courseId/lessons/:lessonId/edit', element: L(<LessonEditPage />) },
          { path: ':courseId/quizzes/:quizId/edit', element: L(<QuizEditPage />) },
          { path: ':courseId/preview', element: L(<CoursePreview />) },
        ],
      },
      { path: 'schools', element: L(<SchoolsManage />) },
      { path: 'classes', element: L(<ClassesManage />) },
      { path: 'attendance', element: L(<AttendanceManage />) },
      { path: 'exams', element: L(<ExamsManage />) },
      { path: 'exams/rooms', element: L(<ExamRoomsManage />) },
      { path: 'exams/attendance', element: L(<ExamAttendanceManage />) },
      { path: 'exams/papers', element: L(<PortalPage />) },
      { path: 'exams/compliance', element: L(<PortalPage />) },
      { path: 'results', element: L(<ResultsManage />) },
      { path: 'payments', element: L(<PaymentsManage />) },
      { path: 'certificates', element: L(<CertificatesManage />) },
      { path: 'announcements', element: L(<AnnouncementsManage />) },
      { path: 'news', element: L(<NewsManage />) },
      { path: 'events', element: L(<EventsManage />) },
      { path: 'gallery', element: L(<GalleryManage />) },
      { path: 'roles', element: L(<RolesManage />) },
      { path: 'settings', element: L(<SettingsManage />) },
      { path: 'analytics', element: L(<AnalyticsManage />) },
      { path: 'logs', element: L(<ActivityLogsManage />) },
      { path: 'forum', element: L(<ForumPage />) },
      { path: 'profile', element: L(<ProfileManage />) },
    ],
  },

  // ── Parent Portal ──
  {
    path: 'parent',
    element: L(<ParentLayout />),
    children: [
      { index: true, element: L(<PortalPage />) },
      { path: 'children', element: L(<PortalPage />) },
      { path: 'attendance', element: L(<PortalPage />) },
      { path: 'results', element: L(<PortalPage />) },
      { path: 'fees', element: L(<PortalPage />) },
      { path: 'teachers', element: L(<PortalPage />) },
      { path: 'events', element: L(<PortalPage />) },
      { path: 'notifications', element: L(<PortalPage />) },
      { path: 'forum', element: L(<ForumPage />) },
      { path: 'messages', element: L(<PortalPage />) },
      { path: 'profile', element: L(<PortalPage />) },
      { path: 'settings', element: L(<PortalPage />) },
    ],
  },
]);

export default router;