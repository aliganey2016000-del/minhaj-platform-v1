import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Crosshair,
  Fingerprint,
  History,
  Loader2,
  MapPin,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  UsersRound,
} from 'lucide-react';
import api from '../../../lib/axios';
import { getAttendanceLocation } from '../../../lib/attendance-location';
import { useAuth } from '../../../store/auth-context';

type Status = 'present' | 'absent' | 'late' | 'excused';
type OrgRef = { _id: string; name?: string };

type Attendance = {
  status: Status;
  notes?: string;
  source?: 'admin' | 'smart_self';
  checkInAt?: string;
  checkOutAt?: string;
  verification?: {
    gpsVerified?: boolean;
    faceVerified?: boolean;
    livenessVerified?: boolean;
    distanceMeters?: number;
    accuracyMeters?: number;
    faceDistance?: number;
  };
};

type Row = {
  staff: {
    _id: string;
    email: string;
    phone?: string;
    title?: string;
    role?: 'teacher' | 'staff';
    profile?: { firstName?: string; lastName?: string } | null;
    department?: { name?: string } | null;
    organizationId?: OrgRef | string | null;
  };
  attendance?: Attendance | null;
  biometricEnrolled?: boolean;
};

type SmartSettings = {
  organizationId?: string;
  configured?: boolean;
  enabled: boolean;
  latitude?: number;
  longitude?: number;
  locationAccuracyMeters?: number;
  radiusMeters: number;
  maxAccuracyMeters: number;
  faceMatchThreshold: number;
  requireLiveness: boolean;
  enrollmentRequiresGeofence: boolean;
  checkOutEnabled: boolean;
  timezone: string;
};

const statuses: { value: Status; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'excused', label: 'Excused' },
];

const inputClass =
  'min-h-10 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm outline-none focus:border-emerald-400';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Mogadishu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function orgIdOf(row: Row): string {
  const value = row.staff.organizationId;
  if (!value) return '';
  return typeof value === 'string' ? value : value._id;
}

function orgNameOf(row: Row): string {
  const value = row.staff.organizationId;
  if (!value || typeof value === 'string') return 'Organization';
  return value.name || 'Organization';
}

function time(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function StaffAttendance() {
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const settingsOnly = searchParams.get('view') === 'settings';
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [settings, setSettings] = useState<SmartSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const gpsRequest = useRef<AbortController | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsMessage, setGpsMessage] = useState('');
  const [selectedOrganization, setSelectedOrganization] = useState(() => user?.organizationId || '');

  const activeOrganization = useRef(selectedOrganization);
  activeOrganization.current = selectedOrganization;
  useEffect(() => () => gpsRequest.current?.abort(), [selectedOrganization]);

  const organizations = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => {
      const id = orgIdOf(row);
      if (id) map.set(id, orgNameOf(row));
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const loadSettings = async (organizationId: string | undefined, signal: AbortSignal) => {
    if (signal.aborted) return;
    setSettingsLoading(true);
    setSettingsError('');
    try {
      const response = await api.get('/hr/staff-attendance/settings', {
        params: organizationId ? { organizationId } : undefined,
        signal,
      });
      if (signal.aborted) return;
      setSettings(response.data.data);
    } catch (err: any) {
      if (signal.aborted) return;
      setSettings(null);
      setSettingsError(
        err.response?.data?.message ||
          'Smart attendance settings could not be loaded for this organization.'
      );
    } finally {
      if (!signal.aborted) setSettingsLoading(false);
    }
  };

  const load = async (signal: AbortSignal) => {
    setLoading(true);
    setError('');
    // Configuring an organization's GPS must not depend on loading its roster.
    if (settingsOnly && selectedOrganization) {
      await loadSettings(selectedOrganization, signal);
      if (!signal.aborted) setLoading(false);
      return;
    }
    let orgForSettings = selectedOrganization;
    try {
      const response = await api.get('/hr/staff-attendance', {
        params: {
          date,
          ...(selectedOrganization ? { organizationId: selectedOrganization } : {}),
        },
        signal,
      });
      if (signal.aborted) return;
      const nextRows = response.data.data?.rows || [];
      setRows(nextRows);
      if (!orgForSettings) {
        const unique = Array.from(new Set(nextRows.map((row: Row) => orgIdOf(row)).filter(Boolean)));
        if (unique.length === 1) {
          orgForSettings = unique[0];
          setSelectedOrganization(unique[0]);
        }
      }
    } catch (err: any) {
      if (!signal.aborted) setError(err.response?.data?.message || 'Failed to load teacher/staff attendance.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
    // Still request settings if the roster failed, so its actual response is
    // shown instead of a misleading "select organization" placeholder.
    await loadSettings(orgForSettings || undefined, signal);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!selectedOrganization && user?.organizationId) {
      setSelectedOrganization(user.organizationId);
      return;
    }
    const request = new AbortController();
    void load(request.signal);
    return () => request.abort();
  }, [date, selectedOrganization, user?.organizationId, settingsOnly, authLoading]);

  const summary = useMemo(
    () => ({
      total: rows.length,
      present: rows.filter((row) => row.attendance?.status === 'present').length,
      smart: rows.filter((row) => row.attendance?.source === 'smart_self').length,
      missing: rows.filter((row) => !row.attendance).length,
    }),
    [rows]
  );

  const mark = async (row: Row, status: Status) => {
    setSaving(row.staff._id);
    setError('');
    setMessage('');
    try {
      await api.post('/hr/staff-attendance', {
        userId: row.staff._id,
        date,
        status,
        organizationId: orgIdOf(row) || selectedOrganization || undefined,
      });
      setRows((current) =>
        current.map((item) =>
          item.staff._id === row.staff._id
            ? {
                ...item,
                attendance: {
                  ...(item.attendance || {}),
                  status,
                  source: 'admin',
                },
              }
            : item
        )
      );
      setMessage('Attendance saved.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save attendance.');
    } finally {
      setSaving(null);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await api.get('/hr/staff-attendance/history', {
        params: selectedOrganization ? { organizationId: selectedOrganization } : undefined,
      });
      setHistory(response.data.data || []);
      setShowHistory(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load attendance history.');
    }
  };

  const useCurrentLocation = async () => {
    if (!settings) return;
    gpsRequest.current?.abort();
    const request = new AbortController();
    gpsRequest.current = request;
    setSettingsError('');
    setGpsMessage('Finding an accurate school GPS location...');
    setGpsAccuracy(null);
    setSettingsLoading(true);
    try {
      const location = await getAttendanceLocation(settings.maxAccuracyMeters, request.signal);
      if (request.signal.aborted) return;
      setSettings(current => current ? { ...current,
        latitude: location.latitude, longitude: location.longitude,
        locationAccuracyMeters: location.accuracy,
      } : current);
      setGpsAccuracy(location.accuracy);
      setGpsMessage('Location captured · accuracy ±' + Math.round(location.accuracy) + ' m. Save settings to apply.');
    } catch (err: any) {
      if (!request.signal.aborted) {
        setGpsMessage('');
        setSettingsError((err?.message || 'GPS could not be read.') + ' Existing school coordinates have been kept.');
      }
    } finally {
      if (!request.signal.aborted) setSettingsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings || settingsLoading || settingsSaving) return;
    if (selectedOrganization && settings.organizationId !== selectedOrganization) {
      setSettingsError('Wait for this organization settings to load before saving.');
      return;
    }
    const organizationAtSave = selectedOrganization;
    setSettingsSaving(true);
    setSettingsError('');
    setMessage('');
    try {
      const response = await api.put('/hr/staff-attendance/settings', {
        ...settings,
        organizationId: settings.organizationId || undefined,
      });
      if (activeOrganization.current !== organizationAtSave) return;
      setSettings(response.data.data);
      setMessage('Smart attendance settings saved.');
    } catch (err: any) {
      if (activeOrganization.current !== organizationAtSave) return;
      setSettingsError(err.response?.data?.message || 'Failed to save smart attendance settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const resetFace = async (row: Row) => {
    const name =
      (row.staff.profile?.firstName || '') + ' ' + (row.staff.profile?.lastName || '');
    if (!window.confirm('Reset face enrollment for ' + (name.trim() || row.staff.email) + '?')) return;
    setSaving(row.staff._id);
    setError('');
    try {
      await api.delete('/hr/staff-attendance/teachers/' + row.staff._id + '/face', {
        data: { organizationId: orgIdOf(row) || selectedOrganization || undefined },
      });
      setRows((current) =>
        current.map((item) =>
          item.staff._id === row.staff._id ? { ...item, biometricEnrolled: false } : item
        )
      );
      setMessage('Face enrollment reset. The teacher can enroll again from Attendance.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reset face enrollment.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <UsersRound className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                Human Resources
              </p>
              <h1 className="mt-1 text-2xl font-black">{settingsOnly ? 'Smart Attendance Settings' : 'Teacher & Staff Attendance'}</h1>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {settingsOnly
                  ? 'Configure GPS geofence, face matching, liveness and verified check-out.'
                  : 'GPS + face verified teacher check-in, manual overrides and attendance history.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {organizations.length > 1 && (
              <select
                className={inputClass}
                value={selectedOrganization}
                onChange={(event) => setSelectedOrganization(event.target.value)}
              >
                <option value="">All organizations</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>{organization.name}</option>
                ))}
              </select>
            )}
            {!settingsOnly && (
              <>
                <label className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-[var(--color-text-tertiary)]" />
                  <input
                    className={inputClass}
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <button onClick={() => void loadHistory()} className={inputClass + ' inline-flex items-center gap-2 font-bold'}>
                  <History className="h-4 w-4" /> History
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {message && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {message}
        </div>
      )}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!settingsOnly && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border bg-[var(--color-surface-primary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Teachers & staff</p><p className="mt-1 text-2xl font-black">{summary.total}</p></div>
          <div className="rounded-2xl border bg-[var(--color-surface-primary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Present</p><p className="mt-1 text-2xl font-black">{summary.present}</p></div>
          <div className="rounded-2xl border bg-[var(--color-surface-primary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Smart verified</p><p className="mt-1 text-2xl font-black">{summary.smart}</p></div>
          <div className="rounded-2xl border bg-[var(--color-surface-primary)] p-4"><p className="text-xs text-[var(--color-text-tertiary)]">Not marked</p><p className="mt-1 text-2xl font-black">{summary.missing}</p></div>
        </div>
      )}

      {settingsOnly && (
      <section className="overflow-hidden rounded-3xl border border-cyan-200 bg-[var(--color-surface-primary)] shadow-sm">
        <div className="border-b border-cyan-100 bg-cyan-50/60 p-5 dark:bg-cyan-950/15">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600 text-white"><Settings2 className="h-5 w-5" /></div>
            <div>
              <h2 className="font-black">Smart Attendance Settings</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Configure the exact school geofence and verification rules used by teacher self check-in.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {settingsLoading && !settings ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[var(--color-text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" /> Loading settings...</div>
          ) : settings ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <label className="text-xs font-bold text-[var(--color-text-secondary)]">
                  Latitude
                  <input
                    type="number"
                    step="0.0000001"
                    className={inputClass + ' mt-1 w-full'}
                    value={settings.latitude ?? ''}
                    onChange={(event) => {
                      setGpsMessage('');
                      setGpsAccuracy(null);
                      setSettings({ ...settings, latitude: event.target.value === '' ? undefined : Number(event.target.value), locationAccuracyMeters: 0 });
                    }}
                  />
                </label>
                <label className="text-xs font-bold text-[var(--color-text-secondary)]">
                  Longitude
                  <input
                    type="number"
                    step="0.0000001"
                    className={inputClass + ' mt-1 w-full'}
                    value={settings.longitude ?? ''}
                    onChange={(event) => {
                      setGpsMessage('');
                      setGpsAccuracy(null);
                      setSettings({ ...settings, longitude: event.target.value === '' ? undefined : Number(event.target.value), locationAccuracyMeters: 0 });
                    }}
                  />
                </label>
                <label className="text-xs font-bold text-[var(--color-text-secondary)]">
                  Radius (meters)
                  <input
                    type="number"
                    min={20}
                    max={5000}
                    className={inputClass + ' mt-1 w-full'}
                    value={settings.radiusMeters}
                    onChange={(event) => setSettings({ ...settings, radiusMeters: Number(event.target.value) })}
                  />
                </label>
                <label className="text-xs font-bold text-[var(--color-text-secondary)]">
                  Max GPS error (m)
                  <input
                    type="number"
                    min={10}
                    max={1000}
                    className={inputClass + ' mt-1 w-full'}
                    value={settings.maxAccuracyMeters}
                    onChange={(event) => setSettings({ ...settings, maxAccuracyMeters: Number(event.target.value) })}
                  />
                </label>
                <label className="text-xs font-bold text-[var(--color-text-secondary)]">
                  Face distance threshold
                  <input
                    type="number"
                    step="0.01"
                    min={0.3}
                    max={0.8}
                    className={inputClass + ' mt-1 w-full'}
                    value={settings.faceMatchThreshold}
                    onChange={(event) => setSettings({ ...settings, faceMatchThreshold: Number(event.target.value) })}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800"
                >
                  <Crosshair className="h-4 w-4" /> Use this device location
                </button>
                {settings.configured && (
                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                    <MapPin className="h-3.5 w-3.5" /> School GPS configured{settings.locationAccuracyMeters ? ' · ±' + Math.round(settings.locationAccuracyMeters) + ' m' : ''}
                  </span>
                )}
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ['enabled', 'Enable smart attendance'],
                  ['requireLiveness', 'Require face presence check'],
                  ['enrollmentRequiresGeofence', 'Enroll only inside school'],
                  ['checkOutEnabled', 'Enable verified check-out'],
                ].map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={Boolean((settings as any)[key])}
                      onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <label className="block max-w-sm text-xs font-bold text-[var(--color-text-secondary)]">
                Timezone
                <input
                  className={inputClass + ' mt-1 w-full'}
                  value={settings.timezone}
                  onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}
                />
              </label>

              {gpsMessage && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{gpsMessage}{gpsAccuracy !== null && gpsAccuracy > settings.maxAccuracyMeters ? ' · Warning: accuracy is above your allowed GPS error.' : ''}</span>
                </div>
              )}
              {settingsError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{settingsError}</div>}

              <button
                type="button"
                disabled={settingsSaving || settingsLoading || Boolean(selectedOrganization && settings?.organizationId !== selectedOrganization)}
                onClick={() => void saveSettings()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Smart Attendance Settings
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {settingsError || 'Select one organization to configure smart attendance.'}
            </div>
          )}
        </div>
      </section>
      )}

      {!settingsOnly && (
      <div className="overflow-hidden rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)]">
        {loading ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">Loading teachers and staff...</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)]">No active teachers or staff found.</div>
        ) : (
          <div className="divide-y divide-[var(--color-border-default)]">
            {rows.map((row) => {
              const name =
                ((row.staff.profile?.firstName || '') + ' ' + (row.staff.profile?.lastName || '')).trim() ||
                row.staff.email;
              const attendance = row.attendance;
              return (
                <div key={row.staff._id} className="flex flex-col gap-4 p-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{name}</p>
                      <span className="rounded-full bg-[var(--color-surface-tertiary)] px-2 py-1 text-[10px] font-black uppercase tracking-wide">
                        {row.staff.role || 'staff'}
                      </span>
                      {row.staff.role === 'teacher' && (
                        <span className={'rounded-full px-2 py-1 text-[10px] font-black ' + (row.biometricEnrolled ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700')}>
                          <Fingerprint className="mr-1 inline h-3 w-3" />
                          {row.biometricEnrolled ? 'Face enrolled' : 'Face not enrolled'}
                        </span>
                      )}
                      {attendance?.source === 'smart_self' && (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">
                          <ShieldCheck className="mr-1 inline h-3 w-3" /> Smart verified
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                      {row.staff.title || (row.staff.role === 'teacher' ? 'Teacher' : 'Staff')}
                      {row.staff.department?.name ? ' · ' + row.staff.department.name : ''}
                      {row.staff.phone ? ' · ' + row.staff.phone : ''}
                    </p>
                    {attendance?.checkInAt && (
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-[var(--color-text-secondary)]">
                        <span>In {time(attendance.checkInAt)}</span>
                        {attendance.checkOutAt && <span>Out {time(attendance.checkOutAt)}</span>}
                        {attendance.verification?.distanceMeters !== undefined && <span>GPS {Math.round(attendance.verification.distanceMeters)} m</span>}
                        {attendance.verification?.faceVerified && <span>Face ✓</span>}
                        {attendance.verification?.livenessVerified && <span>Face presence ✓</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Clock3 className="hidden h-4 w-4 text-[var(--color-text-tertiary)] sm:block" />
                    {statuses.map((item) => (
                      <button
                        key={item.value}
                        disabled={saving === row.staff._id}
                        onClick={() => void mark(row, item.value)}
                        className={'rounded-lg border px-2.5 py-2 text-xs font-semibold transition disabled:opacity-50 ' + (attendance?.status === item.value ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-[var(--color-border-default)] hover:border-emerald-400')}
                      >
                        {attendance?.status === item.value && <Check className="mr-1 inline h-3 w-3" />}
                        {item.label}
                      </button>
                    ))}
                    {row.staff.role === 'teacher' && row.biometricEnrolled && (
                      <button
                        type="button"
                        disabled={saving === row.staff._id}
                        onClick={() => void resetFace(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Reset Face
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {!settingsOnly && showHistory && (
        <div className="rounded-3xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="font-black">Recent history</h2><p className="text-xs text-[var(--color-text-tertiary)]">Latest attendance records with verification source.</p></div>
            <button onClick={() => setShowHistory(false)} className="text-sm font-bold text-emerald-600">Close</button>
          </div>
          <div className="space-y-2">
            {history.length === 0 ? (
              <p className="text-sm text-[var(--color-text-tertiary)]">No attendance records yet.</p>
            ) : (
              history.slice(0, 100).map((record) => {
                const profile = record.user?.profile;
                const name =
                  ((profile?.firstName || '') + ' ' + (profile?.lastName || '')).trim() ||
                  record.user?.email ||
                  'Teacher/Staff';
                return (
                  <div key={record._id} className="flex flex-col gap-2 rounded-xl border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-semibold">{name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{record.source === 'smart_self' ? 'Smart verified' : 'Admin marked'}</p></div>
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {String(record.date).slice(0, 10)} · {record.status}
                      {record.checkInAt ? ' · In ' + time(record.checkInAt) : ''}
                      {record.checkOutAt ? ' · Out ' + time(record.checkOutAt) : ''}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffAttendance;
