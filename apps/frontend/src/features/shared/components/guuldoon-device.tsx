import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';

export function GuuldoonDevice() {
  const { user } = useAuth();
  const [state, setState] = useState<{ verified: boolean; registered: boolean; blockedUntil?: string } | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/guuldoon/devices');
      setState(data.data);
    } catch {
      setError('Xogta qalabka lama soo rari karin.');
    }
  };

  useEffect(() => { void load(); }, []);

  const verifyCurrentBrowser = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.post('/guuldoon/devices/verify-password', { password });
      setPassword('');
      setMessage('Qalabkan waa la xaqiijiyey. Qalabkii hore Guuldoon waa laga joojiyey.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xaqiijintu ma dhammaan. Mar kale isku day.');
    } finally {
      await load();
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-6">
      <ShieldCheck className="text-emerald-700" size={36} />
      <h2 className="text-xl font-bold">Qalabkayga Guuldoon</h2>
      <p className="text-sm">
        Hal browser oo la xaqiijiyey ayaa adeegsan kara Guuldoon. Ku xaqiiji browser-kan isla user-ka iyo password-ka aad ku gashay account-kaaga.
        Qalab cusub marka la xaqiijiyo, kii hore waa laga joojinayaa.
      </p>

      {!state && !error && <p role="status">Loading...</p>}

      {state?.blockedUntil ? (
        <p role="alert">
          Guuldoon waa xanniban yahay ilaa {new Date(state.blockedUntil).toLocaleString()}. Saddex browser ayaa la xaqiijiyey 24 saac gudahood.
        </p>
      ) : (
        <>
          <p className="font-semibold text-emerald-700">
            {state?.verified ? 'Qalabkan waa la xaqiijiyey' : state?.registered ? 'Qalab kale ayaa hadda la oggol yahay' : 'Qalab lama xaqiijin'}
          </p>

          {!state?.verified && (
            <form className="grid max-w-xl gap-4 sm:grid-cols-2" onSubmit={verifyCurrentBrowser}>
              <label className="text-sm font-semibold">
                User
                <input
                  value={user?.email || ''}
                  readOnly
                  aria-readonly="true"
                  autoComplete="username"
                  className="mt-1 block w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-3 text-[var(--color-text-secondary)] outline-none"
                />
              </label>
              <label className="text-sm font-semibold">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  placeholder="Geli password-kaaga"
                  className="mt-1 block w-full rounded-xl border border-[var(--color-border-default)] bg-transparent p-3 outline-none focus:border-emerald-600"
                />
              </label>
              <button
                disabled={busy || !state || !password}
                className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2 sm:w-fit"
              >
                {busy ? 'Sug...' : 'Xaqiiji qalabkan'}
              </button>
            </form>
          )}
        </>
      )}

      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-[var(--color-text-secondary)]">
        Password-kaaga lama kaydinayo page-kan. Saddex browser oo kala duwan oo la xaqiijiyo 24 saac gudahood waxay keenayaan xannibaad 24 saac ah.
      </p>
    </section>
  );
}
