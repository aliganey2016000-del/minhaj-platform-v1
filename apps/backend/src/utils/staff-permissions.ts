export const STAFF_MODULES = ['finance', 'exams', 'admissions', 'courses', 'organization', 'academic', 'content', 'communication', 'system'] as const;

export type StaffModule = (typeof STAFF_MODULES)[number];
export const STAFF_ACTIONS = [
  'read', 'create', 'edit', 'delete', 'approve', 'publish', 'print', 'export',
  'import', 'receive_payment', 'submit', 'enter_results',
] as const;
export type StaffAction = (typeof STAFF_ACTIONS)[number];

export interface StaffPermission {
  module: StaffModule;
  page?: string;
  actions: StaffAction[];
}

const MODULE_ACTIONS: Record<StaffModule, StaffAction[]> = {
  finance: ['read', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'receive_payment'],
  exams: ['read', 'create', 'edit', 'delete', 'approve', 'publish', 'print', 'export', 'submit', 'enter_results'],
  admissions: ['read', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'import'],
  courses: ['read', 'create', 'edit', 'delete', 'publish', 'print', 'export', 'import'],
  organization: ['read', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'import'],
  academic: ['read', 'create', 'edit', 'delete', 'approve', 'publish', 'print', 'export'],
  content: ['read', 'create', 'edit', 'delete', 'publish'],
  communication: ['read', 'create', 'edit', 'delete', 'publish'],
  system: ['read', 'edit', 'print', 'export'],
};

export const STAFF_PERMISSION_CATALOG: Array<{
  module: StaffModule;
  label: string;
  description: string;
  actions: StaffAction[];
}> = [
  { module: 'finance', label: 'Finance', description: 'Payments, invoices, fees, and financial reports', actions: MODULE_ACTIONS.finance },
  { module: 'exams', label: 'Exam Office', description: 'Exams, seating, papers, attendance, and results', actions: MODULE_ACTIONS.exams },
  { module: 'admissions', label: 'Admissions', description: 'Student and admission records', actions: MODULE_ACTIONS.admissions },
  { module: 'courses', label: 'Courses', description: 'Courses, categories, and course content', actions: MODULE_ACTIONS.courses },
  { module: 'organization', label: 'Organization', description: 'Schools, users, classes, teachers, parents, and staff', actions: MODULE_ACTIONS.organization },
  { module: 'academic', label: 'Academic Operations', description: 'Schedules, attendance, assignments, and certificates', actions: MODULE_ACTIONS.academic },
  { module: 'content', label: 'Content', description: 'Announcements, news, events, and gallery', actions: MODULE_ACTIONS.content },
  { module: 'communication', label: 'Communication', description: 'Forum, WhatsApp, and Telegram', actions: MODULE_ACTIONS.communication },
  { module: 'system', label: 'System', description: 'Settings, analytics, logs, trash, profile, and access controls', actions: MODULE_ACTIONS.system },
];

/**
 * Page-specific action vocabulary. This is shared by the UI catalog and
 * server-side normalization so a caller cannot persist nonsensical actions
 * merely by crafting a request body.
 */
export function allowedActionsForSidebarKey(key: string, module: StaffModule): StaffAction[] {
  if (key === 'admin/results/enter') return ['read', 'enter_results', 'edit', 'submit', 'publish'];
  if (key === 'admin/exams/review' || key === 'admin/exams/papers' || key === 'admin/exams/paper-review') return ['read', 'approve', 'publish', 'print'];
  if (key === 'admin/exams/attendance') return ['read', 'edit', 'submit', 'print'];
  if (key === 'admin/exams/rooms' || key === 'admin/exams/invigilators') return ['read', 'create', 'edit', 'delete', 'print'];
  if (key === 'admin/payments/record' || key === 'admin/payments/bulk') return ['read', 'receive_payment', 'print'];
  if (key === 'admin/payments/reports' || key === 'admin/payments/history') return ['read', 'print', 'export'];
  if (key === 'admin/payments/invoices') return ['read', 'create', 'edit', 'approve', 'print', 'delete'];
  if (key === 'admin/payments/fee-structures' || key === 'admin/payments/discounts') return ['read', 'create', 'edit', 'approve', 'delete'];
  if (key === 'admin/announcements' || key === 'admin/news' || key === 'admin/events' || key === 'admin/gallery') return ['read', 'create', 'edit', 'publish', 'delete'];
  if (key === 'admin/settings' || key === 'admin/settings/sidebar' || key === 'admin/roles' || key === 'admin/hr/access') return ['read', 'edit'];
  return MODULE_ACTIONS[module];
}

export function normalizeStaffPermissions(value: unknown): StaffPermission[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: any) => {
    const module = item?.module as StaffModule;
    if (!STAFF_MODULES.includes(module)) return [];
    const page = typeof item?.page === 'string' ? item.page : undefined;
    const allowed = page ? allowedActionsForSidebarKey(page, module) : MODULE_ACTIONS[module];
    const actions = Array.isArray(item?.actions)
      ? allowed.filter((action) => item.actions.includes(action))
      : [];
    return actions.length ? [{ module, ...(page ? { page } : {}), actions }] : [];
  });
}

export function hasStaffPermission(permissions: StaffPermission[], module: StaffModule, action: StaffAction): boolean {
  return permissions.some((permission) => permission.module === module && permission.actions.includes(action));
}
