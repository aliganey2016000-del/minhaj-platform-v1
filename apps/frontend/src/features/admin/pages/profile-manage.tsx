import { useState, useEffect } from 'react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

interface ProfileData {
  profile?: {
    firstName: string; lastName: string; gender: string; avatar?: string;
    dateOfBirth?: string; address?: { street: string; city: string; state: string; country: string; zip: string };
    emergencyContact?: { name: string; phone: string; relationship: string };
  };
}

export function ProfileManage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/auth/me');
        setProfile(data.data || null);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) { setPwError('Both fields are required'); return; }
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    const pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
    if (!pwRegex.test(newPassword)) {
      setPwError('Password must contain: uppercase letter, lowercase letter, number, and special character (@$!%*?&)');
      return;
    }
    setPwLoading(true); setPwError(''); setPwMessage('');
    try {
      await api.patch('/auth/change-password', { currentPassword, newPassword });
      setPwMessage('✅ Password changed successfully!');
      setCurrentPassword(''); setNewPassword('');
    } catch (err: any) {
      setPwError(err.response?.data?.message || 'Failed to change password');
    } finally { setPwLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;

  const p = profile?.profile;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">👤 Profile</h1>

        {/* User Info Card */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-2xl font-bold text-primary-600">
              {p?.firstName?.[0]}{p?.lastName?.[0]}
            </div>
            <div>
              <h2 className="text-xl font-bold">{p?.firstName} {p?.lastName}</h2>
              <p className="text-sm text-[var(--color-text-tertiary)]">{user?.email}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1 capitalize">Role: {user?.role} · {user?.isVerified ? '✅ Verified' : '❌ Not verified'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
            <ProfileField label="First Name" value={p?.firstName} />
            <ProfileField label="Last Name" value={p?.lastName} />
            <ProfileField label="Gender" value={p?.gender} />
            <ProfileField label="Date of Birth" value={p?.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : undefined} />
            <ProfileField label="Preferred Language" value={user?.preferredLanguage} />
            <ProfileField label="Email Verified" value={user?.isVerified ? 'Yes' : 'No'} />
          </div>

          {p?.address && (p.address.street || p.address.city) && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
              <h3 className="text-sm font-bold mb-2">📍 Address</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">{[p.address.street, p.address.city, p.address.state, p.address.country, p.address.zip].filter(Boolean).join(', ') || 'Not provided'}</p>
            </div>
          )}

          {p?.emergencyContact && p?.emergencyContact?.name && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
              <h3 className="text-sm font-bold mb-2">🆘 Emergency Contact</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">{p.emergencyContact.name} — {p.emergencyContact.relationship} — {p.emergencyContact.phone}</p>
            </div>
          )}
        </div>

        {/* Change Password Card */}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card">
          <h2 className="text-lg font-bold mb-4">🔒 Change Password</h2>
          {pwMessage && <div className="mb-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-700">{pwMessage}</div>}
          {pwError && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-600">{pwError}</div>}
          <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Current Password</label>
              <input type="password" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">New Password</label>
              <input type="password" className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={8} required />
              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">Must contain: uppercase, lowercase, number, and special character</p>
            </div>
            <button type="submit" disabled={pwLoading} className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 transition-colors">
              {pwLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{value || '—'}</p>
    </div>
  );
}

export default ProfileManage;