/** Canonical sidebar registries for tenant visibility controls. */
export interface SidebarItemDef {
  key: string;
  label: string;
  section: string;
}

export type SidebarPortal = 'student' | 'admin';

export const STUDENT_SIDEBAR_ITEMS: SidebarItemDef[] = [
  { key: 'student/courses', label: 'My Courses', section: 'Learning & Performance' },
  { key: 'student/available', label: 'Browse Courses', section: 'Learning & Performance' },
  { key: 'student/assignments', label: 'Assignments', section: 'Learning & Performance' },
  { key: 'student/analytics', label: 'Quiz & Lesson Performance', section: 'Learning & Performance' },
  { key: 'group:exams', label: 'Exams (entire menu)', section: 'Learning & Performance' },
  { key: 'student/exams', label: 'My Exam Schedule', section: 'Learning & Performance' },
  { key: 'student/exams/seating', label: 'Seat & Hall Allocation', section: 'Learning & Performance' },
  { key: 'student/exams/active', label: 'Active Exams', section: 'Learning & Performance' },
  { key: 'student/exams/attendance', label: 'Attendance History', section: 'Learning & Performance' },
  { key: 'student/exams/results', label: 'Exam Results & Grades', section: 'Learning & Performance' },
  { key: 'student/exams/appeals', label: 'Academic Appeals', section: 'Learning & Performance' },
  { key: 'student/attendance', label: 'Attendance', section: 'Learning & Performance' },
  { key: 'student/certificates', label: 'Certificates', section: 'Learning & Performance' },
  { key: 'student/payments', label: 'My Fees & Payments', section: 'Learning & Performance' },
  { key: 'student/forum', label: 'Forum', section: 'Communication' },
  { key: 'student/notifications', label: 'Notifications', section: 'Account' },
  { key: 'student/profile', label: 'Profile', section: 'Account' },
  { key: 'student/settings', label: 'Settings', section: 'Account' },
];

export const ADMIN_SIDEBAR_ITEMS: SidebarItemDef[] = [
  { key: 'admin/students', label: 'Manage Students', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/students/report', label: 'Student Reports', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/activity', label: 'Student Activity', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/parents', label: 'Manage Parents', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/teachers', label: 'Manage Teachers', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/courses', label: 'Manage Courses', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/hr?tab=structure', label: 'Institution Structure', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/courses/builder', label: 'Course Builder', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/courses/gradebook', label: 'Course Gradebook', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/courses/gate-report', label: 'Course Gate Report', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/courses/lesson-edit', label: 'Lesson Editor', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/courses/quiz-edit', label: 'Quiz Editor', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/courses/exam-paper-edit', label: 'Course Exam Paper Editor', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/courses/preview', label: 'Course Preview', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/schools', label: 'Organization Management', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/website', label: 'Website Management', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/users', label: 'User Management', section: 'INSTITUTION MANAGEMENT' },
  { key: 'admin/classes', label: 'Manage Classes', section: 'INSTITUTION MANAGEMENT' },

  { key: 'admin/schedules', label: 'Class Schedules', section: 'Academic' },
  { key: 'admin/attendance', label: 'Attendance', section: 'Academic' },
  { key: 'group:learning-assessments', label: 'Learning & Assessments (entire menu)', section: 'Academic' },
  { key: 'admin/analytics', label: 'Learning & Assessments Overview', section: 'Academic' },
  { key: 'admin/analytics?tab=lessons', label: 'Lessons', section: 'Academic' },
  { key: 'admin/analytics?tab=quizzes', label: 'Quizzes', section: 'Academic' },
  { key: 'admin/analytics?tab=questions', label: 'Question Bank', section: 'Academic' },
  { key: 'admin/assignments', label: 'Assignments', section: 'Academic' },
  { key: 'admin/analytics?tab=performance', label: 'Learning Results', section: 'Academic' },
  { key: 'group:exam-management', label: 'Examinations (entire menu)', section: 'Academic' },
  { key: 'admin/exams', label: 'Examinations Overview', section: 'Academic' },
  { key: 'admin/exams/schedule', label: 'Exam Schedule', section: 'Academic' },
  { key: 'admin/results/enter', label: 'Marks Entry', section: 'Academic' },
  { key: 'admin/exams/review', label: 'Review & Approval', section: 'Academic' },
  { key: 'admin/results', label: 'Results', section: 'Academic' },
  { key: 'admin/exams/rooms', label: 'Room Allocation (schedule tool)', section: 'Academic' },
  { key: 'admin/exams/attendance', label: 'Exam Attendance (schedule tool)', section: 'Academic' },
  { key: 'admin/exams/papers', label: 'Paper Approval (review tool)', section: 'Academic' },
  { key: 'admin/exams/paper-review', label: 'Exam Paper Review', section: 'Academic' },
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

  { key: 'group:hr-management', label: 'HR Management (entire menu)', section: 'HR' },
  { key: 'admin/hr', label: 'HR Dashboard', section: 'HR' },
  { key: 'admin/staff', label: 'Staff Directory', section: 'HR' },
  { key: 'admin/hr/access', label: 'Access & Permissions', section: 'HR' },

  { key: 'admin/roles', label: 'Roles & Permissions', section: 'System' },
  { key: 'admin/settings', label: 'Settings', section: 'System' },
  { key: 'admin/settings/sidebar', label: 'Tenant Sidebar Config', section: 'System' },
  { key: 'admin/analytics?tab=overview', label: 'Institution Analytics', section: 'System' },
  { key: 'admin/logs', label: 'Activity Logs', section: 'System' },
  { key: 'admin/trash', label: 'Trash', section: 'System' },
  { key: 'admin/profile', label: 'Profile', section: 'System' },
];

export const STUDENT_SIDEBAR_ITEM_KEYS = new Set(STUDENT_SIDEBAR_ITEMS.map((item) => item.key));
export const ADMIN_SIDEBAR_ITEM_KEYS = new Set(ADMIN_SIDEBAR_ITEMS.map((item) => item.key));

export function moduleForSidebarKey(key: string): 'finance' | 'exams' | 'admissions' | 'courses' | 'organization' | 'academic' | 'content' | 'communication' | 'system' | null {
  if (key.startsWith('admin/payments')) return 'finance';
  if (key.startsWith('admin/exams') || key.startsWith('admin/results') || key === 'admin/certificates' || key === 'group:exam-management') return 'exams';
  if (key.startsWith('admin/students') || key === 'admin/activity') return 'admissions';
  if (key.startsWith('admin/courses') || key === 'group:learning-assessments' || key === 'admin/analytics' || key.startsWith('admin/analytics?tab=lessons') || key.startsWith('admin/analytics?tab=quizzes') || key.startsWith('admin/analytics?tab=questions') || key.startsWith('admin/analytics?tab=performance')) return 'courses';
  if (['admin/parents', 'admin/teachers', 'admin/staff', 'admin/schools', 'admin/website', 'admin/users', 'admin/classes', 'admin/hr?tab=structure', 'admin/hr', 'admin/hr/access', 'group:hr-management'].includes(key)) return 'organization';
  if (['admin/schedules', 'admin/attendance', 'admin/assignments'].includes(key)) return 'academic';
  if (['admin/announcements', 'admin/news', 'admin/events', 'admin/gallery'].includes(key)) return 'content';
  if (['admin/forum', 'admin/whatsapp', 'admin/telegram'].includes(key)) return 'communication';
  if (['admin/roles', 'admin/settings', 'admin/settings/sidebar', 'admin/analytics?tab=overview', 'admin/logs', 'admin/trash', 'admin/profile'].includes(key)) return 'system';
  return null;
}

function registryFor(portal: SidebarPortal): SidebarItemDef[] {
  return portal === 'admin' ? ADMIN_SIDEBAR_ITEMS : STUDENT_SIDEBAR_ITEMS;
}

export function keysFor(portal: SidebarPortal): Set<string> {
  return portal === 'admin' ? ADMIN_SIDEBAR_ITEM_KEYS : STUDENT_SIDEBAR_ITEM_KEYS;
}

export function mergeSidebarOverrides(overrides: { key: string; visible: boolean }[], portal: SidebarPortal = 'student') {
  const overrideMap = new Map(overrides.map((override) => [override.key, override.visible]));
  return registryFor(portal).map((item) => ({ ...item, visible: overrideMap.has(item.key) ? !!overrideMap.get(item.key) : true }));
}
