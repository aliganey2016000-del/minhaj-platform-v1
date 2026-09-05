export const STAFF_MODULES = ['finance', 'exams', 'admissions', 'courses'] as const;

export type StaffModule = (typeof STAFF_MODULES)[number];
export const STAFF_ACTIONS = ['read', 'create', 'edit', 'delete', 'export', 'import'] as const;
export type StaffAction = (typeof STAFF_ACTIONS)[number];

export interface StaffPermission {
  module: StaffModule;
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
];

export function normalizeStaffPermissions(value: unknown): StaffPermission[] {
  if (!Array.isArray(value)) return [];
  return STAFF_MODULES.flatMap((module) => {
    const entry = value.find((item: any) => item?.module === module);
    const actions = Array.isArray(entry?.actions)
      ? STAFF_ACTIONS.filter((action) => entry.actions.includes(action))
      : [];
    return actions.length ? [{ module, actions }] : [];
  });
}

export function hasStaffPermission(permissions: StaffPermission[], module: StaffModule, action: StaffAction): boolean {
  return permissions.some((permission) => permission.module === module && permission.actions.includes(action));
}
