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
  { key: 'admin/parents', label: 'Manage Parents', section: 'Main' },
  { key: 'admin/teachers', label: 'Manage Teachers', section: 'Main' },
  { key: 'admin/courses', label: 'Manage Courses', section: 'Main' },
  { key: 'admin/schools', label: 'Organization Management', section: 'Main' },
  { key: 'admin/classes', label: 'Manage Classes', section: 'Main' },

  { key: 'admin/schedules', label: 'Class Schedules', section: 'Academic' },
  { key: 'admin/attendance', label: 'Attendance', section: 'Academic' },
  { key: 'group:exam-management', label: 'Exam Management (entire menu)', section: 'Academic' },
  { key: 'admin/exams', label: 'Exam Scheduling', section: 'Academic' },
  { key: 'admin/exams/rooms', label: 'Room Allocation', section: 'Academic' },
  { key: 'admin/exams/attendance', label: 'Exam Attendance', section: 'Academic' },
  { key: 'admin/exams/papers', label: 'Papers & Approval', section: 'Academic' },
  { key: 'admin/results', label: 'Results Management', section: 'Academic' },
  { key: 'admin/exams/compliance', label: 'Compliances & Issues', section: 'Academic' },
  { key: 'group:payments', label: 'Payments (entire menu)', section: 'Academic' },
  { key: 'admin/payments', label: 'Payments Overview', section: 'Academic' },
  { key: 'admin/payments/record', label: 'Payment Center', section: 'Academic' },
  { key: 'admin/payments/history', label: 'Payment History', section: 'Academic' },
  { key: 'admin/payments/outstanding', label: 'Outstanding Dues', section: 'Academic' },
  { key: 'admin/certificates', label: 'Certificates', section: 'Academic' },

  { key: 'admin/forum', label: 'Forum', section: 'Communication' },

  { key: 'admin/announcements', label: 'Announcements', section: 'Content' },
  { key: 'admin/news', label: 'News', section: 'Content' },
  { key: 'admin/events', label: 'Events', section: 'Content' },
  { key: 'admin/gallery', label: 'Gallery', section: 'Content' },

  { key: 'admin/roles', label: 'Roles & Permissions', section: 'System' },
  { key: 'admin/settings', label: 'Settings', section: 'System' },
  { key: 'admin/analytics', label: 'Analytics', section: 'System' },
  { key: 'admin/logs', label: 'Activity Logs', section: 'System' },
];

export const STUDENT_SIDEBAR_ITEM_KEYS = new Set(STUDENT_SIDEBAR_ITEMS.map((i) => i.key));
export const ADMIN_SIDEBAR_ITEM_KEYS = new Set(ADMIN_SIDEBAR_ITEMS.map((i) => i.key));

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
