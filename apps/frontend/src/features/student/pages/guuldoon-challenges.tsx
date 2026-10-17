import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../../../lib/axios';
import { GuuldoonChallengeList, type Challenge } from '../components/guuldoon-challenge-list';

/** Student: every open challenge set by a teacher or the platform. */
export function GuuldoonChallenges() {
  const [rows, setRows] = useState<Challenge[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/guuldoon-challenges/mine/list').then(({ data }) => setRows(data.data as Challenge[])).catch((err) => setError(err.response?.data?.message || 'Tartanada lama soo rari karin.'));
  }, []);
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-24 sm:p-6">
      <header><p className="text-sm font-semibold text-emerald-600">Guulgaar</p><h1 className="mt-1 text-2xl font-black">Tartanada</h1></header>
      {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-500">{error}</p>}
      {!rows && !error && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-emerald-500" size={30} /></div>}
      {rows && <GuuldoonChallengeList challenges={rows} empty="Hadda tartan furan ma jiro. Marka macallinkaagu furo, halkan ayuu ka soo muuqanayaa." />}
    </main>
  );
}
