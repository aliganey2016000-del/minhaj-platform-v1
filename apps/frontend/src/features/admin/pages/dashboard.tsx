import { useAuth } from '../../../store/auth-context';
import { Link } from 'react-router-dom';

export function AdminDashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--color-surface-secondary)] pt-20 px-4">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-8 shadow-elevated text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-gold-sm text-2xl">⚙️</div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Admin Dashboard</h1>
          <p className="mt-2 text-[var(--color-text-secondary)]">Welcome, {user?.email}</p>
          <p className="mt-4 text-sm text-[var(--color-text-tertiary)]">Role: {user?.role}</p>
          <div className="mt-8 flex gap-4 justify-center">
            <Link to="/" className="rounded-xl border border-[var(--color-border-default)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--color-surface-tertiary)] transition-colors">Home</Link>
            <button onClick={logout} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors">Logout</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;