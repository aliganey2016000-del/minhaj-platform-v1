/**
 * Canonical registries of sidebar items that can be shown/hidden per
 * organization via the Sidebar Settings managers. Keep these in sync with
 * the frontend's nav configs:
 *   - student-sidebar.tsx  (portal: 'student')
 *   - admin-sidebar.tsx    (portal: 'admin' — the shared org_admin/teacher portal)
 * The `key` values here are the source of truth the frontend filters by.
 *
 * The dashboard home link and Logout are intentionally excluded from both:
 * they must always remain visible regardless of tenant configuration.
 */

export interface SidebarItemDef {
  key: string;
  label: string;
  section: string;
}

export type SidebarPortal = 'student' | 'admin';

export const STUDENT_SIDEBAR_ITEMS: SidebarItemDef[] = [
  { key: 'student/courses', label: 'My Courses', section: 'Learning' },
  { key: 'student/available', label: 'Browse Courses', section: 'Learning' },
  { key: 'student/assignments', label: 'Assignments', section: 'Learning' },
  { key: 'student/downloads', label: 'Downloads', section: 'Learning' },

  { key: 'group:exams', label: 'Exams (entire menu)', section: 'Performance' },
  { key: 'student/exams', label: 'My Exam Schedule', section: 'Performance' },
  { key: 'student/exams/seating', label: 'Seat & Hall Allocation', section: 'Performance' },
  { key: 'student/exams/active', label: 'Active Exams', section: 'Performance' },
  { key: 'student/exams/attendance', label: 'Attendance History', section: 'Performance' },
  { key: 'student/exams/results', label: 'Exam Results & Grades', section: 'Performance' },
  { key: 'student/exams/appeals', label: 'Academic Appeals', section: 'Performance' },
  { key: 'student/attendance', label: 'Attendance', section: 'Performance' },
  { key: 'student/certificates', label: 'Certificates', section: 'Performance' },
  { key: 'student/bookmarks', label: 'Bookmarks', section: 'Performance' },
  { key: 'student/payments', label: 'My Fees & Payments', section: 'Performance' },

  { key: 'student/forum', label: 'Forum', section: 'Communication' },

  { key: 'student/notifications', label: 'Notifications', section: 'Account' },
  { key: 'student/profile', label: 'Profile', section: 'Account' },
  { key: 'student/settings', label: 'Settings', section: 'Account' },
];

/**
 * The admin-portal sidebar is shared by org_admin and teacher. This registry
 * lets a super admin decide what each organization's staff see there —
 * e.g. hiding "Roles & Permissions" or "Tenant Sidebar Config" from an
 * org_admin, or trimming the menu down for a smaller org.
 */
export const ADMIN_SIDEBAR_ITEMS: SidebarItemDef[] = [
  { key: 'admin/students', label: 'Manage Students', section: 'Main' },
  { key: 'admin/students/report', label: 'Student Reports', section: 'Main' },
  { key: 'admin/activity', label: 'Student Activity', section: 'Main' },
  { key: 'admin/parents', label: 'Manage Parents', section: 'Main' },
  { key: 'admin/teachers', label: 'Manage Teachers', section: 'Main' },
  { key: 'admin/staff', label: 'Manage Staff', section: 'Main' },
  { key: 'admin/courses', label: 'Manage Courses', section: 'Main' },
  { key: 'admin/courses/builder', label: 'Course Builder', section: 'Main' },
  { key: 'admin/courses/gradebook', label: 'Course Gradebook', section: 'Main' },
  { key: 'admin/courses/gate-report', label: 'Course Gate Report', section: 'Main' },
  { key: 'admin/courses/lesson-edit', label: 'Lesson Editor', section: 'Main' },
  { key: 'admin/courses/quiz-edit', label: 'Quiz Editor', section: 'Main' },
  { key: 'admin/courses/exam-paper-edit', label: 'Course Exam Paper Editor', section: 'Main' },
  { key: 'admin/courses/preview', label: 'Course Preview', section: 'Main' },
  { key: 'admin/schools', label: 'Organization Management', section: 'Main' },
  { key: 'admin/users', label: 'User Management', section: 'Main' },
  { key: 'admin/classes', label: 'Manage Classes', section: 'Main' },

  { key: 'admin/schedules', label: 'Class Schedules', section: 'Academic' },
  { key: 'admin/attendance', label: 'Attendance', section: 'Academic' },
  { key: 'admin/assignments', label: 'Manage Assignments', section: 'Academic' },
  { key: 'group:exam-management', label: 'Exam Management (entire menu)', section: 'Academic' },
  { key: 'admin/exams', label: 'Exam Scheduling', section: 'Academic' },
  { key: 'admin/exams/rooms', label: 'Room Allocation', section: 'Academic' },
  { key: 'admin/exams/attendance', label: 'Exam Attendance', section: 'Academic' },
  { key: 'admin/exams/papers', label: 'Papers & Approval', section: 'Academic' },
  { key: 'admin/exams/paper-review', label: 'Exam Paper Review', section: 'Academic' },
  { key: 'admin/results', label: 'Results Management', section: 'Academic' },
  { key: 'admin/results/enter', label: 'Enter Results', section: 'Academic' },
  { key: 'admin/exams/compliance', label: 'Compliances & Issues', section: 'Academic' },
  { key: 'admin/exams/grading-rules', label: 'Grading Rules', section: 'Academic' },
  { key: 'admin/certificates', label: 'Certificates', section: 'Academic' },

  { key: 'admin/payments', label: 'Payments Overview', section: 'Payments' },
  { key: 'admin/payments/fee-structures', label: 'Fee Structures', section: 'Payments' },
  { key: 'admin/payments/invoices', label: 'Invoices', section: 'Payments' },
  { key: 'admin/payments/record', label: 'Record Payment', section: 'Payments' },
  { key: 'admin/payments/bulk', label: 'Bulk Payment', section: 'Payments' },
  { key: 'admin/payments/balances', label: 'Student Balances', section: 'Payments' },
  { key: 'admin/payments/balances/detail', label: 'Student Balance Detail', section: 'Payments' },
  { key: 'admin/payments/discounts', label: 'Discounts & Scholarships', section: 'Payments' },
  { key: 'admin/payments/history', label: 'Payment History', section: 'Payments' },
  { key: 'admin/payments/reports', label: 'Payment Reports', section: 'Payments' },
  { key: 'admin/payments?view=accounting', label: 'Accounting Center', section: 'Payments' },

  { key: 'admin/forum', label: 'Forum', section: 'Communication' },
  { key: 'admin/whatsapp', label: 'WhatsApp', section: 'Communication' },
  { key: 'admin/telegram', label: 'Telegram', section: 'Communication' },

  { key: 'admin/announcements', label: 'Announcements', section: 'Content' },
  { key: 'admin/news', label: 'News', section: 'Content' },
  { key: 'admin/events', label: 'Events', section: 'Content' },
  { key: 'admin/gallery', label: 'Gallery', section: 'Content' },

  { key: 'admin/roles', label: 'Roles & Permissions', section: 'System' },
  { key: 'admin/settings', label: 'Settings', section: 'System' },
  { key: 'admin/settings/sidebar', label: 'Tenant Sidebar Config', section: 'System' },
  { key: 'admin/analytics', label: 'Analytics', section: 'System' },
  { key: 'admin/logs', label: 'Activity Logs', section: 'System' },
  { key: 'admin/trash', label: 'Trash', section: 'System' },
  { key: 'admin/profile', label: 'Profile', section: 'System' },
];

export const STUDENT_SIDEBAR_ITEM_KEYS = new Set(STUDENT_SIDEBAR_ITEMS.map((i) => i.key));
export const ADMIN_SIDEBAR_ITEM_KEYS = new Set(ADMIN_SIDEBAR_ITEMS.map((i) => i.key));

export function moduleForSidebarKey(key: string): 'finance' | 'exams' | 'admissions' | 'courses' | 'organization' | 'academic' | 'content' | 'communication' | 'system' | null {
  if (key.startsWith('admin/payments')) return 'finance';
  if (key.startsWith('admin/exams') || key.startsWith('admin/results') || key === 'admin/certificates') return 'exams';
  if (key.startsWith('admin/students') || key === 'admin/activity') return 'admissions';
  if (key.startsWith('admin/courses')) return 'courses';
  if (['admin/parents', 'admin/teachers', 'admin/staff', 'admin/schools', 'admin/users', 'admin/classes'].includes(key)) return 'organization';
  if (['admin/schedules', 'admin/attendance', 'admin/assignments'].includes(key)) return 'academic';
  if (['admin/announcements', 'admin/news', 'admin/events', 'admin/gallery'].includes(key)) return 'content';
  if (['admin/forum', 'admin/whatsapp', 'admin/telegram'].includes(key)) return 'communication';
  if (['admin/roles', 'admin/settings', 'admin/settings/sidebar', 'admin/analytics', 'admin/logs', 'admin/trash', 'admin/profile'].includes(key)) return 'system';
  return null;
}

function registryFor(portal: SidebarPortal): SidebarItemDef[] {
  return portal === 'admin' ? ADMIN_SIDEBAR_ITEMS : STUDENT_SIDEBAR_ITEMS;
}

export function keysFor(portal: SidebarPortal): Set<string> {
  return portal === 'admin' ? ADMIN_SIDEBAR_ITEM_KEYS : STUDENT_SIDEBAR_ITEM_KEYS;
}

/** Merges an org's stored overrides onto the full item registry (default: visible). */
export function mergeSidebarOverrides(
  overrides: { key: string; visible: boolean }[],
  portal: SidebarPortal = 'student'
) {
  const overrideMap = new Map(overrides.map((o) => [o.key, o.visible]));
  return registryFor(portal).map((item) => ({
    ...item,
    visible: overrideMap.has(item.key) ? !!overrideMap.get(item.key) : true,
  }));
}
