import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import api from '../../../lib/axios';
export function GuuldoonDevice() {
  const [state, setState] = useState<{ verified: boolean; registered: boolean; blockedUntil?: string } | null>(null);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = async () => { try { const { data } = await api.get('/guuldoon/devices'); setState(data.data); } catch { setError('Xogta qalabka lama soo rari karin.'); } };
  useEffect(() => { void load(); }, []);
  const action = async (verify: boolean) => {
    setBusy(true); setError(''); setMessage('');
    try { await api.post(`/guuldoon/devices/${verify ? 'verify' : 'request'}`, verify ? { code } : {}); if (verify) { setCode(''); setSent(false); setMessage('Qalabkan waa la xaqiijiyey. Qalabkii hore Guuldoon waa laga joojiyey.'); } else { setSent(true); setMessage('Code lix lambar ah ayaa loo diray email-kaaga. Wuxuu dhacayaa 10 daqiiqo kadib.'); } }
    catch (err: any) { setError(err.response?.data?.message || 'Xaqiijintu ma dhammaan. Mar kale isku day.'); }
    finally { await load(); setBusy(false); }
  };
  return <section className="space-y-4 rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-6"><ShieldCheck className="text-emerald-700" size={36} /><h2 className="text-xl font-bold">Qalabkayga Guuldoon</h2><p className="text-sm">Hal browser oo la xaqiijiyey ayaa adeegsan kara Guuldoon. Qalab cusub marka la xaqiijiyo, kii hore waa laga joojinayaa. Adeegyada school-ka way sii shaqaynayaan.</p>{!state && !error && <p role="status">Loading...</p>}{state?.blockedUntil ? <p role="alert">Guuldoon waa xanniban yahay ilaa {new Date(state.blockedUntil).toLocaleString()}. Saddex qalab ayaa la xaqiijiyey 24 saac gudahood.</p> : <><p className="font-semibold text-emerald-700">{state?.verified ? 'Qalabkan waa la xaqiijiyey' : state?.registered ? 'Qalab kale ayaa hadda la oggol yahay' : 'Qalab lama xaqiijin'}</p>{!state?.verified && <><button disabled={busy || !state} onClick={() => void action(false)} className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Sug...' : sent ? 'Mar kale dir code' : 'Dir code xaqiijin'}</button>{sent && <form className="flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); void action(true); }}><input aria-label="Code xaqiijin" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} placeholder="000000" className="w-40 rounded-xl border bg-transparent p-3 tracking-widest" /><button disabled={busy || code.length !== 6} className="rounded-xl bg-emerald-800 px-5 py-3 text-white disabled:opacity-50">Xaqiiji</button></form>}</>}</>}{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<p className="text-xs text-[var(--color-text-secondary)]">Ha la wadaagin code-ka. Saddex browser oo kala duwan oo la xaqiijiyo 24 saac gudahood waxay keenayaan xannibaad 24 saac ah. Cashirrada lacagta leh waxaa la furayaa marxaladda xigta.</p></section>;
}
