import { useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone, RotateCcw, Save } from 'lucide-react';
import api from '../../../lib/axios';
import { errorMessage } from './guuldoon-builder/types';

type Policy = { deviceLimit: number; windowHours: number; blockHours: number };
const DEFAULTS: Policy = { deviceLimit: 3, windowHours: 24, blockHours: 24 };
const endpoint = '/guuldoon/admin/device-policy';

const fields: { key: keyof Policy; label: string; hint: string; min: number; max: number; unit: string }[] = [
  { key: 'deviceLimit', label: 'Block after this many devices', hint: 'A student who verifies this many different browsers inside the time window is blocked.', min: 2, max: 10, unit: 'devices' },
  { key: 'windowHours', label: 'Time window', hint: 'How far back different devices are counted.', min: 1, max: 168, unit: 'hours' },
  { key: 'blockHours', label: 'Block length', hint: 'How long the student cannot use Guulgaar once blocked.', min: 1, max: 168, unit: 'hours' },
];

/** Super Admin control for the Guulgaar one-device rule. */
export function GuuldoonDevicePolicy() {
  const [saved, setSaved] = useState<Policy | null>(null);
  const [form, setForm] = useState<Record<keyof Policy, string>>({ deviceLimit: '', windowHours: '', blockHours: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const apply = (policy: Policy) => {
    setSaved(policy);
    setForm({ deviceLimit: String(policy.deviceLimit), windowHours: String(policy.windowHours), blockHours: String(policy.blockHours) });
  };

  useEffect(() => {
    api.get(endpoint)
      .then(({ data }) => apply(data.data))
      .catch((err) => setError(errorMessage(err, 'Could not load the device rule.')))
      .finally(() => setLoading(false));
  }, []);

  const numbers = {
    deviceLimit: Number(form.deviceLimit), windowHours: Number(form.windowHours), blockHours: Number(form.blockHours),
  };
  const invalid = fields.find(f => !Number.isInteger(numbers[f.key]) || numbers[f.key] < f.min || numbers[f.key] > f.max);
  const dirty = !!saved && fields.some(f => numbers[f.key] !== saved[f.key]);

  const save = async (payload: Policy) => {
    setSaving(true); setError(''); setNotice('');
    try {
      const { data } = await api.put(endpoint, payload);
      apply(data.data);
      setNotice('Device rule saved. New verifications use it immediately.');
    } catch (err) {
      setError(errorMessage(err, 'Could not save the device rule.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-emerald-500" size={28} /></div>;

  return (
    <section className="rounded-2xl border bg-[var(--color-surface-primary)] p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500"><MonitorSmartphone size={20} aria-hidden="true" /></span>
        <div>
          <h2 className="text-lg font-bold">Guulgaar device rule</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Students verify one browser with their account password; a new verification replaces the previous browser. Too many different browsers in a short time blocks Guulgaar for that student (school services are never affected).
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {fields.map(field => (
          <label key={field.key} className="block">
            <span className="text-sm font-semibold">{field.label}</span>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="number" inputMode="numeric" min={field.min} max={field.max} step={1}
                value={form[field.key]}
                onChange={e => { setForm(prev => ({ ...prev, [field.key]: e.target.value })); setNotice(''); }}
                className="w-full rounded-xl border bg-transparent px-3 py-2 text-base"
              />
              <span className="shrink-0 text-sm text-[var(--color-text-tertiary)]">{field.unit}</span>
            </div>
            <span className="mt-1 block text-xs text-[var(--color-text-tertiary)]">{field.hint} ({field.min}–{field.max})</span>
          </label>
        ))}
      </div>

      <p className="mt-5 rounded-xl bg-sky-500/10 px-4 py-3 text-sm text-sky-500">
        {invalid
          ? `${invalid.label}: enter a whole number from ${invalid.min} to ${invalid.max}.`
          : `A student who verifies ${numbers.deviceLimit} different devices within ${numbers.windowHours} hours is blocked for ${numbers.blockHours} hours. So ${numbers.deviceLimit - 1} different devices can be used in that time.`}
      </p>

      {error && <p role="alert" className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-500">{notice}</p>}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button" disabled={!!invalid || !dirty || saving}
          onClick={() => void save(numbers)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save rule
        </button>
        <button
          type="button" disabled={saving || (saved ? fields.every(f => saved[f.key] === DEFAULTS[f.key]) : true)}
          onClick={() => void save(DEFAULTS)}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          <RotateCcw size={16} /> Back to default (3 devices · 24 h · 24 h)
        </button>
      </div>
    </section>
  );
}
