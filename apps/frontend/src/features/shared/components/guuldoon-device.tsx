import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  Eye,
  EyeOff,
  Globe2,
  LockKeyhole,
  Repeat2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserRound,
  RefreshCw,
} from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

type DeviceState = {
  verified: boolean;
  registered: boolean;
  activatedAt?: string;
  blockedUntil?: string;
};

function currentDeviceInfo() {
  if (typeof navigator === 'undefined') return { browser: 'Browser', system: 'Device' };

  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Google Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Mozilla Firefox';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';

  let system = 'Device';
  if (/Windows NT 10\.0/.test(ua)) system = 'Windows 10 / 11';
  else if (/Windows/.test(ua)) system = 'Windows';
  else if (/Android/.test(ua)) system = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) system = 'iPhone / iPad';
  else if (/Mac OS X/.test(ua)) system = 'macOS';
  else if (/Linux/.test(ua)) system = 'Linux';

  return { browser, system };
}

export function GuuldoonDevice() {
  const { user } = useAuth();
  const [state, setState] = useState<DeviceState | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const device = useMemo(() => currentDeviceInfo(), []);
  const loadSequence = useRef(0);
  const submittingRef = useRef(false);

  const load = async () => {
    const sequence = ++loadSequence.current;
    try {
      const { data } = await api.get('/guuldoon/devices', {
        params: { _state: Date.now() },
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (sequence === loadSequence.current) setState(data.data);
    } catch {
      if (sequence === loadSequence.current) setError('Xogta qalabka lama soo rari karin.');
    }
  };

  useEffect(() => { void load(); }, []);

  const verifyCurrentBrowser = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.post('/guuldoon/devices/verify-password', { password });
      // Invalidate any older state request before showing the successful state.
      loadSequence.current += 1;
      setState(current => ({
        ...(current || { verified: false, registered: false }),
        verified: true,
        registered: true,
        activatedAt: new Date().toISOString(),
        blockedUntil: undefined,
      }));
      setPassword('');
      setMessage('Qalabkan waa la xaqiijiyey. Qalabkii hore Guuldoon waa laga joojiyey.');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xaqiijintu ma dhammaan. Mar kale isku day.');
      await load();
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const blocked = !!state?.blockedUntil;
  const verified = !!state?.verified && !blocked;
  const tone: 'ok' | 'todo' | 'blocked' = blocked ? 'blocked' : verified ? 'ok' : 'todo';

  const toneStyle = {
    ok: {
      bg: 'from-[#07352f] via-[#0b4a3f] to-[#082a2a] shadow-[0_24px_60px_rgba(4,54,48,.28)]',
      accent: 'text-emerald-300',
      ring: 'border-[#0b4a3f]',
      dot: 'bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,.18)]',
      badge: 'bg-emerald-300 text-emerald-950',
    },
    todo: {
      bg: 'from-[#3b2808] via-[#5a3a0c] to-[#2f1f08] shadow-[0_24px_60px_rgba(90,58,12,.3)]',
      accent: 'text-amber-300',
      ring: 'border-[#5a3a0c]',
      dot: 'bg-amber-300 shadow-[0_0_0_4px_rgba(252,211,77,.18)]',
      badge: 'bg-amber-300 text-amber-950',
    },
    blocked: {
      bg: 'from-[#3b0d12] via-[#5a1218] to-[#2a0a0e] shadow-[0_24px_60px_rgba(90,18,24,.3)]',
      accent: 'text-red-300',
      ring: 'border-[#5a1218]',
      dot: 'bg-red-300 shadow-[0_0_0_4px_rgba(252,165,165,.18)]',
      badge: 'bg-red-300 text-red-950',
    },
  }[tone];

  const title = tone === 'ok' ? 'Qalabkan waa la xaqiijiyey' : tone === 'blocked' ? 'Guuldoon waa xanniban yahay' : 'Xaqiiji qalabkan';
  const statusText =
    tone === 'ok'
      ? 'Guuldoon waa furan yahay'
      : tone === 'blocked'
        ? 'Xannibaad ku-meel-gaar ah'
        : state?.registered
          ? 'Qalab kale ayaa la xaqiijiyey'
          : 'Weli lama xaqiijin';
  const tag = tone === 'todo' ? 'Tallaabo muhiim ah' : 'Qalab rasmi ah';
  const StatusIcon = tone === 'ok' ? Check : CircleAlert;

  const rules: { big: string; text: string; icon: typeof Smartphone; tile: string; num: string }[] = [
    { big: '1', text: 'Qalab keliya ayaa Guuldoon u furan.', icon: Smartphone, tile: 'bg-emerald-500/12 text-emerald-500', num: 'text-emerald-500' },
    { big: '↻', text: 'Qalab cusub oo la xaqiijiyo wuxuu saaraa kii hore.', icon: Repeat2, tile: 'bg-blue-500/12 text-blue-500', num: 'text-blue-500' },
    { big: '3', text: '3 browser oo kala duwan 24 saac gudahood = xannibaad 24 saac ah.', icon: Clock3, tile: 'bg-amber-500/15 text-amber-500', num: 'text-amber-500' },
    { big: '5', text: '5 password oo khaldan 15 daqiiqo gudahood = 15 daqiiqo xannibaad.', icon: LockKeyhole, tile: 'bg-rose-500/12 text-rose-500', num: 'text-rose-500' },
  ];

  const activated = state?.activatedAt ? new Date(state.activatedAt).toLocaleDateString() : '—';

  return (
    <section className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1.1fr_.9fr] lg:items-start">
      <div className={`relative overflow-hidden rounded-[28px] bg-gradient-to-br text-white ${toneStyle.bg}`}>
        <div className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-full border-[34px] border-white/[.04]" aria-hidden="true" />
        <div className="pointer-events-none absolute right-6 top-6 h-32 w-32 rounded-full bg-white/[.05] blur-2xl" aria-hidden="true" />

        <div className="relative p-5 sm:p-6">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[.16em] text-white/55">{tag}</p>
          <div className="mt-4 flex items-center gap-4">
            <span className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border border-white/15 bg-white/[.08] ${toneStyle.accent}`}>
              <Smartphone size={32} strokeWidth={1.7} />
              <span className={`absolute -bottom-1.5 -right-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full border-[3px] ${toneStyle.ring} ${toneStyle.badge}`}>
                <StatusIcon size={14} strokeWidth={3} />
              </span>
            </span>
            <div className="min-w-0">
              <h2 className="text-balance text-xl font-extrabold leading-tight">{title}</h2>
              <span className={`mt-2 inline-flex items-center gap-2 text-[12.5px] font-bold ${toneStyle.accent}`}>
                <span className={`h-2 w-2 rounded-full ${toneStyle.dot}`} />
                {statusText}
              </span>
            </div>
          </div>
        </div>

        <div className="relative h-0" aria-hidden="true">
          <div className="mx-6 border-t-2 border-dashed border-white/20" />
          <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[var(--color-page-background)]" />
          <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-[var(--color-page-background)]" />
        </div>

        <div className="relative p-5 sm:p-6">
          {tone === 'blocked' && (
            <div role="alert">
              <p className="text-sm leading-6 text-white/75">
                Saddex browser ayaa la xaqiijiyey 24 saac gudahood. Xannibaaddu waxay dhammaanaysaa{' '}
                <strong className="text-white">{new Date(state!.blockedUntil!).toLocaleString()}</strong>.
              </p>
            </div>
          )}

          {tone === 'ok' && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
              {[
                { label: 'Browser', value: device.browser, icon: Globe2 },
                { label: 'Qalab', value: device.system, icon: Smartphone },
                { label: 'Taariikh', value: activated, icon: CalendarDays },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[.12em] text-white/50">
                    <Icon size={12} /> {label}
                  </p>
                  <p className="mt-1.5 break-words text-sm font-bold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          )}

          {tone === 'todo' && (
            <form className="space-y-3.5" onSubmit={verifyCurrentBrowser}>
              <p className="text-[13.5px] leading-6 text-white/75">
                Geli password-ka account-kaaga si browser-kan ({device.browser} · {device.system}) loogu aqoonsado qalabkaaga rasmiga ah.
              </p>

              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-xs font-bold text-white/70">
                  <UserRound size={14} /> Username / User ID
                </span>
                <div className="relative">
                  <input
                    value={user?.email || ''}
                    readOnly
                    aria-readonly="true"
                    autoComplete="username"
                    className="block w-full rounded-2xl border border-white/15 bg-black/20 px-4 py-3.5 pr-11 text-sm text-white/70 outline-none"
                  />
                  <LockKeyhole size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40" />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-xs font-bold text-white/70">
                  <LockKeyhole size={14} /> Password
                </span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    maxLength={256}
                    placeholder="Geli password-kaaga"
                    className="block w-full rounded-2xl border border-white/20 bg-black/20 px-4 py-3.5 pr-12 text-sm text-white outline-none placeholder:text-white/40 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? 'Qari password-ka' : 'Muuji password-ka'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <button
                disabled={busy || !state || !password}
                className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 py-3.5 text-sm font-extrabold text-amber-950 shadow-lg shadow-black/20 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <RefreshCw className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                {busy ? 'Waa la xaqiijinayaa...' : 'Xaqiiji qalabkan'}
                {!busy && <ArrowRight className="transition-transform group-hover:translate-x-1" size={17} />}
              </button>

              <p className="flex items-center justify-center gap-2 text-center text-xs text-white/50">
                <LockKeyhole size={12} /> Password-kaaga lama kaydinayo page-kan.
              </p>
            </form>
          )}

          {message && <p role="status" className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-200">{message}</p>}
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/30 bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-base font-extrabold text-[var(--color-text-primary)]">Xeerarka qalabka</h3>
          <span className="text-xs text-[var(--color-text-tertiary)]">{rules.length} xeer</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {rules.map(rule => {
            const Icon = rule.icon;
            return (
              <div key={rule.big} className="grid content-start gap-2 rounded-[22px] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4">
                <div className="flex items-center justify-between">
                  <span className={`text-4xl font-extrabold leading-none tracking-tight tabular-nums ${rule.num}`}>{rule.big}</span>
                  <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-xl ${rule.tile}`}>
                    <Icon size={17} />
                  </span>
                </div>
                <p className="text-[13px] leading-[1.45] text-[var(--color-text-secondary)]">{rule.text}</p>
              </div>
            );
          })}
        </div>
        <p className="text-center text-[13px] text-[var(--color-text-tertiary)]">Caawimaad? La xiriir maamulka school-kaaga.</p>
      </div>
    </section>
  );
}
