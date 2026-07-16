/**
 * Portal Page — Shared generic page for Admin & Parent portals.
 * Displays the correct icon, title, and description based on the current route.
 */

import { useLocation } from 'react-router-dom';

// Admin pages
const adminPages: Record<string, { title: string; icon: string; desc: string }> = {
  '/admin':              { title: 'Admin Dashboard',      icon: '🏠', desc: 'System overview and quick actions' },
  '/admin/students':     { title: 'Manage Students',      icon: '🎓', desc: 'View, create, update, and manage all students' },
  '/admin/parents':      { title: 'Manage Parents',       icon: '👨‍👩‍👧‍👦', desc: 'Manage parent accounts and child links' },
  '/admin/teachers':     { title: 'Manage Teachers',      icon: '👨‍🏫', desc: 'Manage teacher profiles and assignments' },
  '/admin/courses':      { title: 'Manage Courses',       icon: '📚', desc: 'Create and manage course catalog' },
  '/admin/classes':      { title: 'Manage Classes',       icon: '🏫', desc: 'Schedule and manage class sessions' },
  '/admin/attendance':   { title: 'Attendance',           icon: '📅', desc: 'Track and manage student attendance' },
  '/admin/exams/papers': { title: 'Papers & Approval',    icon: '📄', desc: 'Instructor paper submission with admin proofreading and approval — coming soon' },
  '/admin/exams/compliance': { title: 'Compliances & Issues', icon: '⚠️', desc: 'Log exam violations, cheating, or special accommodations — coming soon' },
  '/admin/payments':     { title: 'Payments',             icon: '💰', desc: 'Manage fees, payments, and invoices' },
  '/admin/certificates': { title: 'Certificates',         icon: '🏆', desc: 'Generate and manage certificates' },
  '/admin/announcements':{ title: 'Announcements',        icon: '📢', desc: 'Create and manage announcements' },
  '/admin/news':         { title: 'News',                 icon: '📰', desc: 'Publish and manage news articles' },
  '/admin/events':       { title: 'Events',               icon: '🎉', desc: 'Manage events and registrations' },
  '/admin/gallery':      { title: 'Gallery',              icon: '🖼️', desc: 'Manage photo and video galleries' },
  '/admin/roles':        { title: 'Roles & Permissions',  icon: '🔐', desc: 'Manage user roles and access control' },
  '/admin/settings':     { title: 'Settings',             icon: '⚙️', desc: 'System and website configuration' },
  '/admin/analytics':    { title: 'Analytics',            icon: '📈', desc: 'View system analytics and reports' },
  '/admin/logs':         { title: 'Activity Logs',        icon: '📋', desc: 'View system activity and audit logs' },
  '/admin/profile':      { title: 'Admin Profile',        icon: '👤', desc: 'Manage your admin account' },
};

// Parent pages
const parentPages: Record<string, { title: string; icon: string; desc: string }> = {
  '/parent':              { title: 'Parent Dashboard',     icon: '🏠', desc: 'Overview of your children\'s progress' },
  '/parent/children':     { title: 'My Children',         icon: '👨‍👩‍👧‍👦', desc: 'View and manage your children' },
  '/parent/attendance':   { title: 'Attendance',          icon: '📅', desc: 'View your children\'s attendance records' },
  '/parent/results':      { title: 'Results & Grades',    icon: '📊', desc: 'View academic results and grades' },
  '/parent/fees':         { title: 'Fees & Payments',     icon: '💰', desc: 'View fee status and payment history' },
  '/parent/teachers':     { title: 'Teachers',            icon: '👨‍🏫', desc: 'View your children\'s teachers' },
  '/parent/events':       { title: 'Events',       icon: '🎉', desc: 'Upcoming events and activities' },
  '/parent/notifications':{ title: 'Notifications',       icon: '🔔', desc: 'Your alerts and notifications' },
  '/parent/messages':     { title: 'Messages',            icon: '💬', desc: 'Communicate with teachers and staff' },
  '/parent/profile':      { title: 'Profile',             icon: '👤', desc: 'Manage your parent profile' },
  '/parent/settings':     { title: 'Settings',            icon: '⚙️', desc: 'Account and notification settings' },
};

const allPages: Record<string, Record<string, { title: string; icon: string; desc: string }>> = {
  admin: adminPages,
  parent: parentPages,
};

export function PortalPage() {
  const location = useLocation();
  const path = location.pathname;

  // Determine which portal (admin or parent)
  const portal = path.startsWith('/admin') ? 'admin' : 'parent';
  const pages = allPages[portal] || {};
  const data = pages[path] || pages[`/${portal}`] || { title: 'Page', icon: '📄', desc: 'Content coming soon' };

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

export default PortalPage;