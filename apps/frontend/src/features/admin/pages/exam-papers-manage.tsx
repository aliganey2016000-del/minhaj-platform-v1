/**
 * Papers & Approval — Admin/Teacher
 * Admin proofreading/moderation/approval for exam papers. This page is
 * just the list — clicking an exam opens its full-page review
 * (ExamPaperReviewPage), same pattern as the Course Builder's exam item
 * opening ExamPaperEditPage. Question authoring itself is the shared
 * ExamPaperEditor, embedded in both of those full pages.
 *
 * Super admin (role 'admin') scopes down to one Organization first, then
 * sees that org's exams as a tabbed list (All/Pending/Approved/Rejected) —
 * same "pick an org, then work within it" pattern as users-manage.tsx.
 * Org admin is auto-scoped to their own organization, no picker shown.
 *
 * List can be viewed as a Table or as Cards (with the course thumbnail) —
 * same underlying data either way, same shape as Exam Scheduling.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/auth-context';
import { BackButton } from '../../shared/components/back-button';

interface School { _id: string; name: string; status?: string; }
interface ExamBrief {
  _id: string;
  title: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  status: string;
  autoSchedule?: boolean;
  course?: {
    _id: string;
    title: { en: string };
    thumbnail?: string;
    teacher?: { profile?: { firstName?: string; lastName?: string } };
    class?: { title?: string; section?: string; department?: { name?: string } };
    school?: { name?: string };
  };
  school?: { name?: string };
  paperStatus: 'draft' | 'submitted' | 'approved' | 'rejected' | null;
}

type TabKey = 'all' | 'pending' | 'approved' | 'rejected';
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '📄' },
  { key: 'pending', label: 'Pending', icon: '⏳' },
  { key: 'approved', label: 'Approved', icon: '✅' },
  { key: 'rejected', label: 'Rejected', icon: '❌' },
];

type ViewMode = 'card' | 'table';

// ---------------------------------------------------------------------------
// Field helpers — the same course→teacher/class/department/org chain the
// backend now populates in one query (exam.controller.ts getAll).
// ---------------------------------------------------------------------------
function teacherName(e: ExamBrief): string {
  const p = e.course?.teacher?.profile;
  const name = [p?.firstName, p?.lastName].filter(Boolean).join(' ');
  return name || '—';
}
function orgName(e: ExamBrief): string {
  return e.school?.name || e.course?.school?.name || '—';
}
function departmentName(e: ExamBrief): string {
  return e.course?.class?.department?.name || '—';
}
function className(e: ExamBrief): string {
  const cls = e.course?.class;
  if (!cls?.title) return '—';
  return cls.section ? `${cls.title} - ${cls.section}` : cls.title;
}
function formatDate(d?: string): string {
  if (!d) return '🤖 Auto';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatTime(e: ExamBrief): string {
  return e.startTime && e.endTime ? `${e.startTime} – ${e.endTime}` : '—';
}

function PaperStatusBadge({ status }: { status: ExamBrief['paperStatus'] }) {
  const c: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  const label = status === 'submitted' ? 'pending' : status || 'no paper';
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize flex-shrink-0 ${c[status || ''] || 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>{label}</span>;
}

// Deterministic gradient + emoji per course, so cards without a thumbnail
// still look intentional instead of showing a broken image or blank box.
const PLACEHOLDER_GRADIENTS = [
  'from-emerald-400 to-teal-600',
  'from-violet-400 to-indigo-600',
  'from-amber-400 to-orange-600',
  'from-rose-400 to-pink-600',
  'from-sky-400 to-blue-600',
];
function placeholderGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_GRADIENTS[hash % PLACEHOLDER_GRADIENTS.length];
}

function ExamThumbnail({ e }: { e: ExamBrief }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden">
      {e.course?.thumbnail ? (
        <img src={e.course.thumbnail} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className={`h-full w-full bg-gradient-to-br ${placeholderGradient(e.course?._id || e._id)} flex items-center justify-center text-6xl`}>
          🎓
        </div>
      )}
      {/* Bottom gradient so the status badge and title always read clearly over any photo */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="absolute top-3 end-3">
        <PaperStatusBadge status={e.paperStatus} />
      </div>
      <p className="absolute bottom-2.5 start-3.5 end-3.5 text-sm font-bold text-white truncate drop-shadow">{e.title}</p>
    </div>
  );
}

export function ExamPapersManage() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = currentUser?.role === 'admin';
  const isOrgAdmin = currentUser?.role === 'org_admin';

  const [schools, setSchools] = useState<School[]>([]);
  const [selectedOrg, setSelectedOrg] = useState('');
  const [myOrgName, setMyOrgName] = useState('');

  const [exams, setExams] = useState<ExamBrief[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>('all');
  const [view, setView] = useState<ViewMode>('card');
  const [error, setError] = useState('');

  // Load the organization list (super admin) or the org_admin's own org.
  useEffect(() => {
    if (isSuperAdmin) {
      (async () => {
        try {
          const { data } = await api.get('/schools', { params: { limit: '100' } });
          setSchools((data.data || []).filter((s: School) => s.status === 'active'));
        } catch { /* non-fatal */ }
      })();
      return;
    }
    if (isOrgAdmin && currentUser?.organizationId) {
      setSelectedOrg(currentUser.organizationId);
      (async () => {
        try {
          const { data } = await api.get(`/schools/${currentUser.organizationId}`);
          if (data.data?.name) setMyOrgName(data.data.name);
        } catch { /* non-fatal */ }
      })();
    }
  }, [isSuperAdmin, isOrgAdmin, currentUser?.organizationId]);

  const fetchExams = useCallback(async () => {
    if (!selectedOrg) { setExams([]); return; }
    setExamsLoading(true);
    setError('');
    try {
      const { data } = await api.get('/exams', { params: { school: selectedOrg, limit: 200 } });
      setExams(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load exams');
    } finally {
      setExamsLoading(false);
    }
  }, [selectedOrg]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const counts = {
    all: exams.length,
    pending: exams.filter((e) => e.paperStatus === 'submitted').length,
    approved: exams.filter((e) => e.paperStatus === 'approved').length,
    rejected: exams.filter((e) => e.paperStatus === 'rejected').length,
  };
  const visibleExams = exams.filter((e) => {
    if (tab === 'all') return true;
    if (tab === 'pending') return e.paperStatus === 'submitted';
    return e.paperStatus === tab;
  });

  const openExam = (id: string) => navigate(`/admin/exams/${id}/paper/review`);

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <BackButton fallback="/admin/exams" />
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-text-primary)] mt-1">📄 Papers & Approval</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Review exam papers submitted by instructors and approve or reject them</p>
        </div>

        {/* Organization scope + Card/Table toggle — one horizontal row even on narrow screens */}
        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto pb-1">
          {isSuperAdmin ? (
            <select
              value={selectedOrg}
              onChange={(e) => { setSelectedOrg(e.target.value); setTab('all'); }}
              className="flex-shrink-0 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm max-w-[55%] sm:max-w-xs"
            >
              <option value="">Choose an organization...</option>
              {schools.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          ) : isOrgAdmin && myOrgName ? (
            <div className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-xs sm:text-sm whitespace-nowrap">
              <span className="text-[var(--color-text-tertiary)]">Org:</span>
              <span className="font-semibold text-[var(--color-text-primary)]">{myOrgName}</span>
            </div>
          ) : <div />}

          {/* Card / Table toggle */}
          <div className="flex-shrink-0 inline-flex rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 ms-auto">
            <button
              onClick={() => setView('card')}
              className={`rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${view === 'card' ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
            >
              🗂️ Cards
            </button>
            <button
              onClick={() => setView('table')}
              className={`rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${view === 'table' ? 'bg-primary-600 text-white' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'}`}
            >
              📋 Table
            </button>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {!selectedOrg && isSuperAdmin && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">👆 Select an organization above to see its exam papers</p></div>
        )}

        {selectedOrg && (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    tab === t.key
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]'
                  }`}
                >
                  <span>{t.icon}</span> {t.label}
                  <span className={`rounded-full px-1.5 text-[11px] ${tab === t.key ? 'bg-white/20' : 'bg-[var(--color-surface-tertiary)]'}`}>{counts[t.key]}</span>
                </button>
              ))}
            </div>

            {/* Exam list */}
            {examsLoading ? (
              <div className="flex justify-center py-10"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-primary-600" /></div>
            ) : visibleExams.length === 0 ? (
              <div className="text-center py-12 text-[var(--color-text-tertiary)] border border-dashed border-[var(--color-border-default)] rounded-xl">
                <p>No exams in this category.</p>
              </div>
            ) : view === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleExams.map((e) => (
                  <button
                    key={e._id}
                    onClick={() => openExam(e._id)}
                    className="text-left rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all"
                  >
                    <ExamThumbnail e={e} />
                    <div className="p-4 space-y-2">
                      <p className="text-xs text-[var(--color-text-secondary)] truncate">📘 {e.course?.title?.en || '—'}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)] truncate">🧑‍🏫 {teacherName(e)}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)] truncate">🏫 {orgName(e)} · {departmentName(e)} · {className(e)}</p>
                      <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] pt-1 border-t border-[var(--color-border-subtle)] mt-2">
                        <span>📅 {formatDate(e.examDate)}</span>
                        <span>·</span>
                        <span>🕐 {formatTime(e)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border-default)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--color-surface-tertiary)] text-left text-xs font-semibold text-[var(--color-text-secondary)]">
                      <th className="px-4 py-3">Exam</th>
                      <th className="px-4 py-3">Course</th>
                      <th className="px-4 py-3">Teacher</th>
                      <th className="px-4 py-3">Organization</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Class</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {visibleExams.map((e) => (
                      <tr
                        key={e._id}
                        onClick={() => openExam(e._id)}
                        className="cursor-pointer bg-[var(--color-surface-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-[var(--color-text-primary)] whitespace-nowrap">{e.title}</td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">{e.course?.title?.en || '—'}</td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">{teacherName(e)}</td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">{orgName(e)}</td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">{departmentName(e)}</td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">{className(e)}</td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">{formatDate(e.examDate)}</td>
                        <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">{formatTime(e)}</td>
                        <td className="px-4 py-3 whitespace-nowrap"><PaperStatusBadge status={e.paperStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExamPapersManage;
