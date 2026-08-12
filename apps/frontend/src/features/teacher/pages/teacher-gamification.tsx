import { useEffect, useState } from 'react';
import { Award, Trophy, Zap } from 'lucide-react';
import api from '../../../lib/axios';

interface Leader { studentId: string; name: string; xp: number; level: number; badges: string[]; streak: number; }

export function TeacherGamification() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [totalXP, setTotalXP] = useState(0);
  const [participants, setParticipants] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => { (async () => {
    try { const { data } = await api.get('/teacher-portal/dashboard/gamification'); setLeaders(data.data?.topStudents || []); setTotalXP(data.data?.totalClassXP || 0); setParticipants(data.data?.participantCount || 0); }
    catch (err: any) { setError(err.response?.data?.message || 'Failed to load class gamification'); }
  })(); }, []);

  return <div className="mx-auto max-w-4xl p-4 md:p-6 lg:p-8">
    <h1 className="text-2xl font-extrabold text-[var(--color-text-primary)]">Class Gamification</h1>
    <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Celebrate engagement across students enrolled in your courses.</p>
    <div className="mt-6 grid grid-cols-2 gap-4"><div className="rounded-2xl bg-amber-50 p-5 text-amber-900"><Zap className="h-5 w-5" /><p className="mt-3 text-2xl font-extrabold">{totalXP.toLocaleString()}</p><p className="text-xs">Class XP</p></div><div className="rounded-2xl bg-emerald-50 p-5 text-emerald-900"><Trophy className="h-5 w-5" /><p className="mt-3 text-2xl font-extrabold">{participants}</p><p className="text-xs">Students participating</p></div></div>
    {error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]"><div className="border-b border-[var(--color-border-subtle)] px-5 py-4 text-sm font-bold">Leaderboard</div>{leaders.map((leader, index) => <div key={leader.studentId} className="flex items-center gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4 last:border-0"><span className="w-6 text-center font-bold text-amber-600">{index + 1}</span><div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700">{leader.name.charAt(0)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{leader.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">Level {leader.level} · {leader.streak} day streak</p></div><div className="text-right"><p className="text-sm font-bold text-amber-700">{leader.xp.toLocaleString()} XP</p><p className="flex justify-end gap-1 text-xs"><Award className="h-3.5 w-3.5" />{leader.badges.length} badges</p></div></div>)}{!error && leaders.length === 0 && <p className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No gamification activity yet.</p>}</div>
  </div>;
}

export default TeacherGamification;
