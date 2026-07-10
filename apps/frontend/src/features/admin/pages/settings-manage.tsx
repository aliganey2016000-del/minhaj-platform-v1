import { useEffect, useState } from 'react';
import { useAuth } from '../../../store/auth-context';
import api from '../../../lib/axios';

interface Setting { _id: string; key: string; value: string; description: string; updatedAt: string; }

export function SettingsManage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const defaultSettings = [
    { key: 'schoolName', value: 'Masjid Al-Rahma', description: 'Organization name' },
    { key: 'contactEmail', value: 'admin@masjidalrahma.com', description: 'Primary contact email' },
    { key: 'contactPhone', value: '', description: 'Contact phone number' },
    { key: 'address', value: '', description: 'Physical address' },
    { key: 'academicYear', value: '2026-2027', description: 'Current academic year' },
    { key: 'maxStudentsPerClass', value: '50', description: 'Default max students per course' },
    { key: 'currency', value: 'USD', description: 'Currency code for payments' },
    { key: 'language', value: 'en', description: 'Default language (en/so/ar)' },
    { key: 'timezone', value: 'Africa/Mogadishu', description: 'Default timezone' },
    { key: 'enableNotifications', value: 'true', description: 'Enable email notifications' },
    { key: 'maintenanceMode', value: 'false', description: 'Enable maintenance mode' },
  ];

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await api.get('/system/settings');
      const existing = data.data || [];
      // Merge with defaults
      const merged = defaultSettings.map(d => {
        const found = existing.find((e: Setting) => e.key === d.key);
        return found || d;
      });
      setSettings(merged);
    } catch {
      setSettings(defaultSettings as any);
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      await api.put('/system/settings', { settings: settings.map(s => ({ key: s.key, value: s.value, description: s.description })) });
      setMessage('✅ Settings saved successfully!');
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save'); }
    finally { setLoading(false); }
  };

  const updateValue = (key: string, value: string) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div><h1 className="text-3xl font-bold text-[var(--color-text-primary)]">⚙️ Settings</h1><p className="text-sm text-[var(--color-text-tertiary)] mt-1">Configure system-wide settings</p></div>
          <button onClick={handleSave} disabled={loading} className="rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 shadow-sm">
            {loading ? 'Saving...' : '💾 Save All'}
          </button>
        </div>
        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {settings.map(s => (
              <div key={s.key} className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4 hover:bg-[var(--color-surface-secondary)] transition-colors">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-semibold text-[var(--color-text-primary)]">{s.key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</label>
                  <p className="text-xs text-[var(--color-text-tertiary)]">{s.description}</p>
                </div>
                <input
                  className="w-full sm:w-64 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  value={s.value}
                  onChange={e => updateValue(s.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] text-center">Logged in as {user?.email} ({user?.role})</p>
      </div>
    </div>
  );
}
export default SettingsManage;