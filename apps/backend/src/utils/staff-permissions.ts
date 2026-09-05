export const STAFF_MODULES = ['finance', 'exams', 'admissions', 'courses', 'organization', 'academic', 'content', 'communication', 'system'] as const;

export type StaffModule = (typeof STAFF_MODULES)[number];
export const STAFF_ACTIONS = ['read', 'create', 'edit', 'delete', 'export', 'import'] as const;
export type StaffAction = (typeof STAFF_ACTIONS)[number];

export interface StaffPermission {
  module: StaffModule;
  page?: string;
  actions: StaffAction[];
}

export const STAFF_PERMISSION_CATALOG: Array<{
  module: StaffModule;
  label: string;
  description: string;
  actions: StaffAction[];
}> = [
  { module: 'finance', label: 'Finance', description: 'Payments, invoices, fees, and financial reports', actions: [...STAFF_ACTIONS] },
  { module: 'exams', label: 'Exam Office', description: 'Exams, seating, papers, attendance, and results', actions: [...STAFF_ACTIONS] },
  { module: 'admissions', label: 'Admissions', description: 'Student and admission records', actions: [...STAFF_ACTIONS] },
  { module: 'courses', label: 'Courses', description: 'Courses, categories, and course content', actions: [...STAFF_ACTIONS] },
  { module: 'organization', label: 'Organization', description: 'Schools, users, classes, teachers, parents, and staff', actions: [...STAFF_ACTIONS] },
  { module: 'academic', label: 'Academic Operations', description: 'Schedules, attendance, assignments, and certificates', actions: [...STAFF_ACTIONS] },
  { module: 'content', label: 'Content', description: 'Announcements, news, events, and gallery', actions: [...STAFF_ACTIONS] },
  { module: 'communication', label: 'Communication', description: 'Forum, WhatsApp, and Telegram', actions: [...STAFF_ACTIONS] },
  { module: 'system', label: 'System', description: 'Settings, analytics, logs, trash, profile, and access controls', actions: [...STAFF_ACTIONS] },
];

export function normalizeStaffPermissions(value: unknown): StaffPermission[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: any) => {
    const module = item?.module as StaffModule;
    if (!STAFF_MODULES.includes(module)) return [];
    const actions = Array.isArray(item?.actions)
      ? STAFF_ACTIONS.filter((action) => item.actions.includes(action))
      : [];
    return actions.length ? [{ module, ...(typeof item.page === 'string' ? { page: item.page } : {}), actions }] : [];
  });
}

export function hasStaffPermission(permissions: StaffPermission[], module: StaffModule, action: StaffAction): boolean {
  return permissions.some((permission) => permission.module === module && permission.actions.includes(action));
}
