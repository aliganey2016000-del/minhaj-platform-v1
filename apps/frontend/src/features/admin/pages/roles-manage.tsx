import { useAuth } from '../../../store/auth-context';

export function RolesManage() {
  const { user } = useAuth();
  const roles = [
    { role: 'admin', permissions: 'Full system access — manage all organizations, users, settings globally', icon: '🔐', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    { role: 'org_admin', permissions: 'Full access — manage all data, users, settings of his organization only', icon: '🏢', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    { role: 'teacher', permissions: 'Manage courses, classes, attendance, results', icon: '👨‍🏫', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    { role: 'student', permissions: 'View courses, attendance, results, certificates', icon: '🎓', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    { role: 'parent', permissions: 'View linked children data, attendance, results, payments', icon: '👨‍👩‍👧‍👦', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  ];
  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🔐 Roles & Permissions</h1>
        <p className="text-sm text-[var(--color-text-tertiary)]">Current user: <strong>{user?.email}</strong> ({user?.role})</p>
        <div className="grid gap-4">
          {roles.map(r => (
            <div key={r.role} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${r.color}`}>{r.icon}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold capitalize">{r.role}</h3>
                  <p className="text-sm text-[var(--color-text-tertiary)] mt-1">{r.permissions}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-6 text-center">
          <p className="text-sm text-amber-700 dark:text-amber-300">📌 Full role-based access control (RBAC) with granular permissions will be available in a future update.</p>
        </div>
      </div>
    </div>
  );
}
export default RolesManage;