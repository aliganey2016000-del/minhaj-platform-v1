import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { GlobalSubscriptions } from '../components/global-subscriptions';
import { GlobalCoursesPage } from './global-courses-page';

type Page = 'overview' | 'courses' | 'performance' | 'subscriptions' | 'devices' | 'settings';
const allowedPages: Record<string, Page[]> = {
  admin: ['overview', 'courses', 'performance', 'subscriptions', 'devices', 'settings'],
  org_admin: ['overview', 'courses', 'performance', 'subscriptions'],
  teacher: ['courses', 'performance'],
  student: ['courses', 'performance', 'subscriptions', 'devices'],
};
type Performance = { _id: string; student?: { studentId: string; profile?: { firstName: string; lastName: string } }; course?: { title?: { en: string }; globalGrade: number }; completedLessons: number; completedQuizzes: number; completedAssignments: number; totalItems: number; status: string };

/** Role and tenant visibility guard shared by every Guuldoon page. */
export function GuuldoonPage({ page }: { page: Page }) {
  const { user, isLoading } = useAuth();
  const { pathname } = useLocation();
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied' | 'error'>('loading');
  const role = user?.role || '';
  useEffect(() => {
    let cancelled = false;
    setAccess('loading');
    if (!user || !allowedPages[user.role]?.includes(page)) { setAccess('denied'); return; }
    if (user.role === 'admin') { setAccess('allowed'); return; }
    const portal = user.role === 'org_admin' ? 'admin' : user.role;
    api.get('/sidebar-settings/mine', { params: { portal } }).then(({ data }) => {
      const visibility: Record<string, boolean> = {};
      for (const item of data.data?.items || []) visibility[item.key] = item.visible;
      if (!cancelled) setAccess(visibility['group:guuldoon'] === false || visibility[pathname.replace(/^\//, '')] === false ? 'denied' : 'allowed');
    }).catch(() => { if (!cancelled) setAccess('error'); });
    return () => { cancelled = true; };
  }, [user, page, pathname]);
  if (isLoading || access === 'loading') return <p className="p-6">Loading Guuldoon...</p>;
  if (!user) return <Navigate to="/auth/login" replace />;
  if (access === 'denied') return <p role="alert" className="p-6">You do not have access to this Guuldoon page.</p>;
  if (access === 'error') return <p role="alert" className="p-6">Unable to verify Guuldoon access. Please reload to try again.</p>;
  if (page === 'courses') return <GlobalCoursesPage />;
  const title = page === 'overview' ? 'Overview' : page === 'performance' ? role === 'student' ? 'My Progress' : role === 'teacher' ? 'My Students’ Performance' : 'Student Performance' : page === 'subscriptions' ? role === 'student' ? 'My Subscription' : role === 'org_admin' ? 'Subscriptions' : 'Subscriptions & Payments' : page === 'devices' ? role === 'student' ? 'My Device' : 'Devices & Access' : 'Settings';
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header><p className="text-sm font-semibold text-primary-600">Guuldoon</p><h1 className="mt-1 text-2xl font-bold">{title}</h1><p className="mt-2 text-sm text-[var(--color-text-secondary)]">Diyaarinta Imtixaanka Shahaadiga · Grade 8 & 12</p></header>
    {page === 'subscriptions' && <GlobalSubscriptions />}
    {page === 'overview' && <Overview />}
    {page === 'performance' && <PerformancePanel showStudents={role !== 'student'} />}
    {page === 'devices' && <section className="rounded-2xl border bg-[var(--color-surface-primary)] p-6"><h2 className="text-lg font-semibold">Device verification is not enabled yet</h2><p className="mt-3 text-sm">The next phase will add OTP verification, one active device and secure device transfers for Guuldoon. School login and services will stay independent.</p><p className="mt-3 text-sm">No device is currently registered for Guuldoon. Paid learning access remains closed until device verification is ready.</p></section>}
    {page === 'settings' && <section className="rounded-2xl border bg-[var(--color-surface-primary)] p-6"><h2 className="text-lg font-semibold">Current subscription policy</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt>Annual price</dt><dd className="font-semibold">$5 USD per student, per grade</dd></div><div><dt>Validity</dt><dd className="font-semibold">365 days from verified payment</dd></div><div><dt>Payment verification</dt><dd>Manual · Super Admin only</dd></div><div><dt>Device authorization</dt><dd>Not enabled yet</dd></div></dl><p className="mt-4 text-sm">Courses use the existing Course Builder. School fees and school access are managed separately.</p></section>}
  </main>;
}
function Overview() {
  const [data, setData] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; api.get('/guuldoon/overview').then(({ data }) => { if (live) setData(data.data); }).catch(() => { if (live) setError('Unable to load overview.'); }); return () => { live = false; }; }, []);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p>Loading overview...</p>;
  return <><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Published Courses', 'publishedCourses'], ['Active Subscribers', 'activeSubscribers'], ['Verified Payments (USD)', 'verifiedPaymentsUsd'], ['Pending Payments', 'pendingPayments']].map(([label, key]) => <article key={key} className="rounded-2xl border bg-[var(--color-surface-primary)] p-5"><p className="text-sm">{label}</p><p className="mt-3 text-3xl font-bold">{key === 'verifiedPaymentsUsd' ? '$' : ''}{data[key]}</p></article>)}</section><p className="text-xs text-[var(--color-text-tertiary)]">Verified payments show gross receipts, including payments for subsequently revoked subscriptions.</p></>;
}
function PerformancePanel({ showStudents }: { showStudents: boolean }) {
  const [rows, setRows] = useState<Performance[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; setLoading(true); setError(''); api.get('/guuldoon/performance', { params: { page } }).then(({ data }) => { if (live) { setRows(data.data || []); setHasNext(data.meta?.hasNextPage || false); } }).catch(() => { if (live) setError('Unable to load performance.'); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [page]);
  if (loading) return <p>Loading performance...</p>;
  if (error) return <p role="alert">{error}</p>;
  return <>{rows.length === 0 ? <section className="rounded-2xl border bg-[var(--color-surface-primary)] p-6"><h2 className="font-semibold">No Guuldoon learning records yet</h2><p className="mt-2 text-sm">Progress will appear after students begin Guuldoon lessons. School-course performance is tracked separately.</p></section> : <section className="space-y-3">{rows.map(row => <article key={row._id} className="rounded-xl border bg-[var(--color-surface-primary)] p-4">{showStudents && <p className="font-semibold">{row.student?.profile?.firstName} {row.student?.profile?.lastName} · {row.student?.studentId}</p>}<p>{row.course?.title?.en} · Grade {row.course?.globalGrade}</p><p className="mt-2 text-sm">Lessons: {row.completedLessons} · Quizzes: {row.completedQuizzes} · Assignments: {row.completedAssignments}</p><p className="mt-2 text-sm">{row.totalItems > 0 ? `${Math.min(100, Math.round((row.completedLessons + row.completedQuizzes + row.completedAssignments) / row.totalItems * 100))}% complete` : 'Completion total unavailable'}</p><p className="mt-2 text-sm">Status: {row.status === 'completed' ? 'Completed' : 'In progress'}</p></article>)}</section>}<div className="flex gap-3"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={!hasNext} onClick={() => setPage(page + 1)}>Next</button></div></>;
}
