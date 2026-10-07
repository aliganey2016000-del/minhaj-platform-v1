import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  HelpCircle,
  Laptop,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserRound,
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
        verified: true,
        registered: true,
        activatedAt: new Date().toISOString(),
        blockedUntil: undefined,
        ...current,
        verified: true,
        registered: true,
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

  return (
    <section className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.06fr_.94fr]">
        <div className="relative overflow-hidden rounded-[28px] border border-emerald-500/20 bg-gradient-to-br from-emerald-950/35 via-[var(--color-surface-primary)] to-[var(--color-surface-primary)] p-5 shadow-[0_24px_70px_-45px_rgba(16,185,129,.55)] sm:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="relative">
            <div className="mb-6 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 text-emerald-400">
                <ShieldCheck size={27} strokeWidth={1.8} />
              </div>
              <div>
                <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[.16em] text-emerald-400">
                  Tallaabo muhiim ah
                </span>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight">Xaqiiji qalabkan</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
                  Si aad u isticmaasho Guuldoon, geli password-ka account-kaaga si browser-kan loogu aqoonsado qalabkaaga rasmiga ah.
                </p>
              </div>
            </div>

            {blocked ? (
              <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5">
                <div className="flex gap-3">
                  <CircleAlert className="mt-0.5 shrink-0 text-red-400" size={22} />
                  <div>
                    <p className="font-bold text-red-300">Guuldoon si ku-meel-gaar ah ayaa loo xannibay</p>
                    <p className="mt-1 text-sm leading-6 text-red-200/80">
                      Saddex browser ayaa la xaqiijiyey 24 saac gudahood. Xannibaaddu waxay dhammaanaysaa {new Date(state!.blockedUntil!).toLocaleString()}.
                    </p>
                  </div>
                </div>
              </div>
            ) : state?.verified ? (
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-5">
                <div className="flex items-center gap-3">
                  <CircleCheck className="shrink-0 text-emerald-400" size={25} />
                  <div>
                    <p className="font-extrabold text-emerald-300">Qalabkan waa la xaqiijiyey</p>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Waxaad hadda browser-kan uga isticmaali kartaa Guuldoon.</p>
                  </div>
                </div>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={verifyCurrentBrowser}>
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <UserRound size={16} className="text-[var(--color-text-tertiary)]" />
                    Username / User ID
                  </span>
                  <div className="relative">
                    <input
                      value={user?.email || ''}
                      readOnly
                      aria-readonly="true"
                      autoComplete="username"
                      className="block w-full rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-4 py-3.5 pr-11 text-sm text-[var(--color-text-secondary)] outline-none"
                    />
                    <LockKeyhole size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <LockKeyhole size={16} className="text-[var(--color-text-tertiary)]" />
                    Password
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
                      className="block w-full rounded-2xl border border-[var(--color-border-default)] bg-transparent px-4 py-3.5 pr-12 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      aria-label={showPassword ? 'Qari password-ka' : 'Muuji password-ka'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[var(--color-text-tertiary)] transition hover:bg-white/5 hover:text-[var(--color-text-primary)]"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <button
                  disabled={busy || !state || !password}
                  className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3.5 text-sm font-extrabold text-slate-950 shadow-[0_16px_40px_-24px_rgba(16,185,129,.9)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_-22px_rgba(16,185,129,.95)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {busy ? <RefreshCw className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                  {busy ? 'Waa la xaqiijinayaa...' : 'Xaqiiji qalabkan'}
                  {!busy && <ArrowRight className="transition-transform group-hover:translate-x-1" size={17} />}
                </button>

                <p className="flex items-center justify-center gap-2 text-center text-xs text-[var(--color-text-tertiary)]">
                  <LockKeyhole size={13} />
                  Password-kaaga lama kaydinayo page-kan.
                </p>
              </form>
            )}

            {message && <p role="status" className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{message}</p>}
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <HelpCircle size={20} />
              </div>
              <div>
                <h3 className="font-bold">U baahan tahay caawimaad?</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">Haddii aad dhibaato qabto, la xiriir maamulka school-kaaga.</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 sm:p-7">
            <div className="pointer-events-none absolute inset-x-8 top-12 h-36 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="relative mx-auto mb-7 flex h-40 max-w-sm items-center justify-center">
              <div className="absolute h-28 w-56 rounded-[50%] border border-emerald-500/20" />
              <div className="absolute h-20 w-40 rounded-[50%] border border-blue-500/15" />
              <div className="relative flex h-24 w-36 items-center justify-center rounded-2xl border border-blue-400/30 bg-gradient-to-br from-slate-800 to-slate-950 shadow-[0_0_45px_rgba(34,197,94,.18)]">
                <Laptop className="text-blue-300" size={72} strokeWidth={1.2} />
                <ShieldCheck className="absolute text-emerald-400" size={31} />
              </div>
              <div className="absolute left-[12%] top-[18%] flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/20">
                <LockKeyhole size={19} />
              </div>
              <div className="absolute right-[9%] top-[24%] flex h-11 w-11 items-center justify-center rounded-full bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/20">
                <Laptop size={19} />
              </div>
            </div>

            <h3 className="text-lg font-extrabold">Maxaa dhacaya marka la xaqiijiyo?</h3>
            <div className="mt-5 space-y-4">
              {[
                ['success', 'Browser-kan ayaa noqda qalabkaaga Guuldoon ee la xaqiijiyey.'],
                ['transfer', 'Haddii aad xaqiijiso browser cusub, kii hore Guuldoon waa laga saarayaa.'],
                ['warning', '3 browser oo kala duwan 24 saac gudahood waxay keenayaan xannibaad 24 saac ah.'],
                ['danger', '5 password oo khaldan 15 daqiiqo gudahood waxay joojinayaan isku-dayga 15 daqiiqo.'],
              ].map(([kind, text]) => (
                <div key={kind} className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    kind === 'success'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : kind === 'transfer'
                        ? 'bg-blue-500/15 text-blue-400'
                        : kind === 'warning'
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-red-500/15 text-red-400'
                  }`}>
                    {kind === 'success' ? <CircleCheck size={16} /> : kind === 'transfer' ? <RefreshCw size={15} /> : kind === 'warning' ? <ShieldCheck size={15} /> : <LockKeyhole size={15} />}
                  </span>
                  <p className="text-sm leading-6 text-[var(--color-text-secondary)]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Laptop size={21} />
          </div>
          <div>
            <h3 className="font-extrabold">Qalabka hadda la isticmaalo</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">Macluumaad ku saabsan browser-ka aad hadda ku jirto.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
          <div className="grid gap-3 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-[var(--color-text-tertiary)]">Browser</p>
              <p className="mt-1 text-sm font-bold">{device.browser}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-tertiary)]">Qalab</p>
              <p className="mt-1 text-sm font-bold">{device.system}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-tertiary)]">Xaqiijinta</p>
              <p className={`mt-1 text-sm font-bold ${state?.verified ? 'text-emerald-400' : state?.registered ? 'text-amber-400' : 'text-red-400'}`}>
                {state?.verified ? 'La xaqiijiyey' : state?.registered ? 'Qalab kale ayaa la xaqiijiyey' : 'Wali lama xaqiijin'}
              </p>
              {state?.verified && state.activatedAt && (
                <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">{new Date(state.activatedAt).toLocaleString()}</p>
              )}
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${
            state?.verified
              ? 'border-emerald-500/25 bg-emerald-500/10'
              : blocked
                ? 'border-red-500/25 bg-red-500/10'
                : state?.registered
                  ? 'border-amber-500/25 bg-amber-500/10'
                  : 'border-red-500/25 bg-red-500/10'
          }`}>
            <div className="flex items-start gap-3">
              {state?.verified
                ? <CircleCheck className="mt-0.5 shrink-0 text-emerald-400" size={22} />
                : <CircleAlert className="mt-0.5 shrink-0 text-red-400" size={22} />}
              <div>
                <p className={`font-bold ${state?.verified ? 'text-emerald-300' : 'text-red-300'}`}>
                  {state?.verified ? 'Qalabkan waa diyaar' : blocked ? 'Guuldoon waa xanniban yahay' : 'Qalabkan wali lama xaqiijin'}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                  {state?.verified
                    ? 'Browser-kan ayaa hadda loo oggol yahay inuu isticmaalo Guuldoon.'
                    : blocked
                      ? 'Sug inta xannibaaddu ka dhammaanayso ka hor xaqiijin kale.'
                      : 'Geli password-kaaga kore si browser-kan loogu oggolaado Guuldoon.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
