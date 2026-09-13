import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, RotateCcw, X } from 'lucide-react';
import api from '../../../../lib/axios';
import { useAuth } from '../../../../store/auth-context';
import { resolveInstitutionType } from '../../../../lib/institution-type';

type Decision = 'promote' | 'repeat' | 'graduate';

type ReviewStudent = {
  _id: string;
  studentId: string;
  name: string;
  defaultAction: Decision;
};

type ReviewGroup = {
  classId: string;
  title: string;
  section?: string;
  gradeLevel: number;
  isFinal: boolean;
  targetGradeLevel?: number | null;
  targetTitle?: string;
  students: ReviewStudent[];
};

type ReviewPayload = {
  sourceAcademicYear: string;
  targetAcademicYear: string;
  groups: ReviewGroup[];
};

type ReviewResult = {
  sourceAcademicYear: string;
  targetAcademicYear: string;
  studentsPromoted: number;
  studentsRepeated: number;
  studentsGraduated: number;
  classesCompleted: number;
  targetsCreated: number;
  repeatClassesCreated: number;
  intakesOpened: number;
};

const dataOf = <T,>(response: any): T => response?.data?.data ?? response?.data ?? response;
const errOf = (error: any) => error?.response?.data?.message || error?.message || 'Something went wrong.';

function PromotionWorkflow({ onClose }: { onClose: () => void }) {
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.get('/classes/promotion-review').then((response) => {
      if (!active) return;
      const payload = dataOf<ReviewPayload>(response);
      setReview(payload);
      const initial: Record<string, Decision> = {};
      for (const group of payload.groups || []) {
        for (const student of group.students || []) initial[student._id] = student.defaultAction;
      }
      setDecisions(initial);
    }).catch((e) => active && setError(errOf(e))).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const summary = useMemo(() => {
    const values = Object.values(decisions);
    return {
      promote: values.filter((x) => x === 'promote').length,
      repeat: values.filter((x) => x === 'repeat').length,
      graduate: values.filter((x) => x === 'graduate').length,
    };
  }, [decisions]);

  const resetDefaults = () => {
    if (!review) return;
    const next: Record<string, Decision> = {};
    for (const group of review.groups) for (const student of group.students) next[student._id] = student.defaultAction;
    setDecisions(next);
  };

  const execute = async () => {
    if (!review || running) return;
    const total = summary.promote + summary.repeat + summary.graduate;
    if (!total) return;
    if (!window.confirm(`Confirm year-end promotion?\n\nPromote: ${summary.promote}\nRepeat: ${summary.repeat}\nGraduate: ${summary.graduate}\n\nThis will close the source classes and move students into ${review.targetAcademicYear}.`)) return;
    setRunning(true);
    setError('');
    try {
      const response = await api.post('/classes/promote-reviewed', {
        targetAcademicYear: review.targetAcademicYear,
        decisions: Object.entries(decisions).map(([studentId, action]) => ({ studentId, action })),
      });
      setResult(dataOf<ReviewResult>(response));
    } catch (e) {
      setError(errOf(e));
    } finally {
      setRunning(false);
    }
  };

  return <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
    <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl dark:bg-slate-950">
      <div className="flex items-start justify-between border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
        <div><h2 className="flex items-center gap-2 text-lg font-bold"><GraduationCap size={20}/> Promote Students</h2><p className="mt-1 text-xs text-slate-500">Review only the exceptions. Everyone is pre-selected with the normal action.</p></div>
        <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18}/></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? <div className="py-16 text-center text-sm text-slate-500">Preparing students...</div> : result ? <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30"><div className="text-lg font-bold text-emerald-800 dark:text-emerald-200">Promotion completed successfully</div><div className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">{result.sourceAcademicYear} → {result.targetAcademicYear}</div></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Promoted" value={result.studentsPromoted}/><Stat label="Repeated" value={result.studentsRepeated}/><Stat label="Graduated" value={result.studentsGraduated}/><Stat label="Classes closed" value={result.classesCompleted}/></div>
          <div className="rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800">Prepared automatically: <b>{result.targetsCreated}</b> next-grade class(es), <b>{result.repeatClassesCreated}</b> repeat class(es), and <b>{result.intakesOpened}</b> new intake class(es).</div>
        </div> : review ? <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="text-xs font-semibold uppercase text-slate-500">Academic year</div><div className="mt-1 text-xl font-bold">{review.sourceAcademicYear} → {review.targetAcademicYear}</div>
            <div className="mt-4 grid grid-cols-3 gap-2"><Stat label="Promote" value={summary.promote}/><Stat label="Repeat" value={summary.repeat}/><Stat label="Graduate" value={summary.graduate}/></div>
            <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-500"><b>Repeat</b> means the student stays in the same grade but moves into the new academic year.</p><button onClick={resetDefaults} className="flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs"><RotateCcw size={13}/> Reset</button></div>
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

          <div className="space-y-3">{review.groups.map((group, index) => <details key={group.classId} open={index === 0} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <summary className="cursor-pointer list-none px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900"><div className="flex items-center justify-between gap-3"><div><div className="font-semibold">{group.title}{group.section ? ` · ${group.section}` : ''}</div><div className="mt-0.5 text-xs text-slate-500">Grade {group.gradeLevel} → {group.isFinal ? 'Graduate' : `Grade ${group.targetGradeLevel}`}</div></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold dark:bg-slate-800">{group.students.length} students</span></div></summary>
            <div className="border-t border-slate-100 dark:border-slate-800">{group.students.length ? group.students.map((student) => <div key={student._id} className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"><div><div className="text-sm font-medium">{student.name || student.studentId}</div><div className="text-xs text-slate-500">{student.studentId}</div></div><select value={decisions[student._id] || student.defaultAction} onChange={(e) => setDecisions((x) => ({ ...x, [student._id]: e.target.value as Decision }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">{group.isFinal ? <><option value="graduate">Graduate</option><option value="repeat">Repeat grade</option></> : <><option value="promote">Promote</option><option value="repeat">Repeat grade</option></>}</select></div>) : <div className="px-4 py-5 text-sm text-slate-500">No active students in this class.</div>}</div>
          </details>)}{!review.groups.length && <div className="rounded-xl border border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800">No active classes are ready for year-end promotion.</div>}</div>
        </div> : <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || 'Could not prepare promotion.'}</div>}
      </div>

      <div className="flex gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:justify-end sm:px-6 dark:border-slate-800 dark:bg-slate-950">{result ? <button onClick={onClose} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white sm:w-auto dark:bg-white dark:text-slate-900">Done</button> : <><button onClick={onClose} className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold sm:flex-none">Cancel</button><button onClick={() => void execute()} disabled={!review?.groups.length || running} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none">{running ? 'Promoting...' : 'Confirm Promotion'}</button></>}</div>
    </div>
  </div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-950"><div className="text-xl font-bold">{value}</div><div className="text-[11px] text-slate-500">{label}</div></div>;
}

export function SchoolPromotionLauncher() {
  const { user } = useAuth();
  const [isSchool, setIsSchool] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.organizationId) return;
    let active = true;
    void api.get(`/schools/${user.organizationId}`).then((response) => {
      const org = dataOf<any>(response);
      if (active) setIsSchool(resolveInstitutionType(org) === 'school');
    }).catch(() => { if (active) setIsSchool(false); });
    return () => { active = false; };
  }, [user?.organizationId]);

  if (!isSchool) return null;
  return <>{!open && <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-xl hover:bg-emerald-700"><GraduationCap size={18}/> Promote Students</button>}{open && <PromotionWorkflow onClose={() => { setOpen(false); window.location.reload(); }}/>}</>;
}
