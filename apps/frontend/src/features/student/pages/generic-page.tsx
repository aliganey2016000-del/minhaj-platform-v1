import { useLocation } from 'react-router-dom';

const pageTitles: Record<string, { title: string; icon: string; desc: string }> = {
  '/student':            { title: 'Dashboard',         icon: '🏠', desc: 'Overview of your learning journey' },
  '/student/courses':    { title: 'My Courses',        icon: '📚', desc: 'Your enrolled courses and progress' },
  '/student/available':  { title: 'Available Courses', icon: '🆕', desc: 'Browse and enroll in new courses' },
  '/student/assignments':{ title: 'Assignments',       icon: '📝', desc: 'View and submit assignments' },
  '/student/exams/active':     { title: 'Active Exams',           icon: '⏱️', desc: 'Launch and take your timed computer-based exams — coming soon' },
  '/student/exams/appeals':    { title: 'Academic Appeals',       icon: '⚖️', desc: 'Submit grade reviews or report exam issues — coming soon' },
  '/student/certificates':{ title: 'Certificates',     icon: '🏆', desc: 'Your earned certificates' },
  '/student/attendance': { title: 'Attendance',        icon: '📅', desc: 'Track your attendance records' },
  '/student/downloads':  { title: 'Downloads',         icon: '📥', desc: 'Course materials and resources' },
  '/student/bookmarks':  { title: 'Bookmarks',         icon: '🔖', desc: 'Saved courses and resources' },
  '/student/notifications':{ title: 'Notifications',   icon: '🔔', desc: 'Your alerts and updates' },
  '/student/profile':    { title: 'Profile',           icon: '👤', desc: 'Manage your personal information' },
  '/student/settings':   { title: 'Settings',          icon: '⚙️', desc: 'Account and display settings' },
};

export function StudentPage() {
  const location = useLocation();
  const data = pageTitles[location.pathname] || pageTitles['/student'];

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 lg:p-12 shadow-card text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-gold-sm text-3xl">
            {data.icon}
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] lg:text-3xl">
            {data.title}
          </h1>
          <p className="mt-3 text-[var(--color-text-secondary)] max-w-md mx-auto">
            {data.desc}
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-gold-200 dark:border-gold-800 bg-gold-50 dark:bg-gold-950/30 px-4 py-2 text-sm text-gold-700 dark:text-gold-300">
            🏗️ Full features coming soon
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudentPage;