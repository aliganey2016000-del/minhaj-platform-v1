import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, FileJson, GraduationCap, Plus, Save, Settings2, Tags, UploadCloud } from 'lucide-react';
import api from '../../../lib/axios';
import { GuuldoonUnmatchedAnswers } from '../components/guuldoon-unmatched-answers';

type Chapter = { id: string; title: string; order: number; status: string; lessons: number };
type Exam = {
  _id: string;
  year: number;
  durationMin: number;
  totalMarks: number;
  answerKeyStatus: 'verified' | 'pending';
  published: boolean;
  source?: string;
};
type Config = {
  passTarget: number;
  targetExamDate?: string | null;
  chapterWeights: { chapterId: string; examWeight: number }[];
  glossary: { termSo: string; termEn: string; termAr: string }[];
};

export function GuuldoonBuilder() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<any>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [config, setConfig] = useState<Config>({ passTarget: 70, targetExamDate: null, chapterWeights: [], glossary: [] });
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [glossaryText, setGlossaryText] = useState('');
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [questionsJson, setQuestionsJson] = useState('[]');
  const [newExam, setNewExam] = useState({ year: 2025, durationMin: 120, totalMarks: 100, answerKeyStatus: 'pending' as 'verified' | 'pending', source: '', published: false });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/guuldoon/admin/courses/${courseId}/config`);
      const payload = data.data;
      setCourse(payload.course);
      setChapters(payload.chapters || []);
      setExams(payload.exams || []);
      const nextConfig = payload.config || { passTarget: 70, targetExamDate: null, chapterWeights: [], glossary: [] };
      setConfig(nextConfig);
      setWeights(Object.fromEntries((nextConfig.chapterWeights || []).map((row: any) => [row.chapterId, Number(row.examWeight)])));
      setGlossaryText(JSON.stringify(nextConfig.glossary || [], null, 2));
      if (payload.exams?.[0]?._id) setSelectedExam(current => current || payload.exams[0]._id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Guuldoon Builder lama soo rari karin.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { void load(); }, [load]);

  const totalWeight = useMemo(() => chapters.reduce((sum, chapter) => sum + Number(weights[chapter.id] || 0), 0), [chapters, weights]);

  const saveConfig = async () => {
    if (!courseId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      let glossary: Config['glossary'] = [];
      try { glossary = JSON.parse(glossaryText || '[]'); } catch { throw new Error('Glossary JSON ma saxna.'); }
      await api.put(`/guuldoon/admin/courses/${courseId}/config`, {
        passTarget: config.passTarget,
        targetExamDate: config.targetExamDate || null,
        chapterWeights: chapters.map(chapter => ({ chapterId: chapter.id, examWeight: Number(weights[chapter.id] || 0) })),
        glossary,
      });
      setMessage('Guuldoon settings waa la keydiyey.');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const createExam = async () => {
    if (!courseId) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/guuldoon/admin/courses/${courseId}/exams`, newExam);
      setSelectedExam(data.data._id);
      setMessage(`Imtixaanka ${newExam.year} waa la abuuray.`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Imtixaanka lama abuuri karin.');
    } finally {
      setSaving(false);
    }
  };

  const toggleExam = async (exam: Exam, field: 'published' | 'answerKeyStatus') => {
    setError('');
    try {
      await api.patch(`/guuldoon/admin/exams/${exam._id}`, field === 'published'
        ? { published: !exam.published }
        : { answerKeyStatus: exam.answerKeyStatus === 'verified' ? 'pending' : 'verified' });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Exam update failed');
    }
  };

  const importQuestions = async () => {
    if (!selectedExam) {
      setError('Marka hore dooro sanad imtixaan.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const questions = JSON.parse(questionsJson);
      if (!Array.isArray(questions)) throw new Error('JSON-ku waa inuu noqdaa array su’aalo ah.');
      const { data } = await api.post(`/guuldoon/admin/exams/${selectedExam}/questions/bulk`, { questions });
      setMessage(`${data.data.imported} su'aalood ayaa la import-gareeyey.`);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Question import failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500/20 border-t-primary-500" /></div>;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/admin/global-courses')} className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-tertiary)]"><ArrowLeft size={15} /> Guuldoon Courses</button>
          <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Guuldoon Builder · Grade {course?.globalGrade}</p>
          <h1 className="mt-1 text-2xl font-black">{course?.title?.en || 'Course'}</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Question-first exam preparation: chapters, historical weights, past papers, answer verification and glossary.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate(`/admin/global-courses/${courseId}/import`)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"><UploadCloud size={17} /> Import Full Course</button>
          <button onClick={() => navigate(`/admin/courses/${courseId}/builder`)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-default)] px-4 py-2.5 text-sm font-bold"><BookOpen size={17} /> Chapters & Lessons</button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{message}</div>}

      <section className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
          <div className="flex items-center gap-2"><Settings2 className="text-emerald-600" size={20} /><h2 className="font-black">Course Settings</h2></div>
          <label className="mt-4 block text-xs font-bold">Pass Meter Target
            <input type="number" min="0" max="100" value={config.passTarget} onChange={e => setConfig(current => ({ ...current, passTarget: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" />
          </label>
          <label className="mt-3 block text-xs font-bold">Target Exam Date
            <input type="date" value={config.targetExamDate ? String(config.targetExamDate).slice(0, 10) : ''} onChange={e => setConfig(current => ({ ...current, targetExamDate: e.target.value || null }))} className="mt-1 w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2.5 text-sm" />
          </label>
          <div className="mt-4 rounded-xl bg-[var(--color-surface-tertiary)] p-3 text-xs"><strong>Rule:</strong> Pass Meter = chapter mastery × exam weight. Question tags ayaa miisaanka automatic ka caawinaya haddii manual weights aan la dejin.</div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Tags className="text-emerald-600" size={20} /><h2 className="font-black">Chapter Exam Weights</h2></div><span className={`rounded-full px-3 py-1 text-xs font-black ${Math.abs(totalWeight - 100) <= .5 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>{totalWeight.toFixed(1)}%</span></div>
          <div className="mt-4 space-y-2">{chapters.length === 0 ? <p className="text-sm text-[var(--color-text-tertiary)]">Marka hore chapters ku samee Course Builder-ka.</p> : chapters.map((chapter, index) => (
            <div key={chapter.id} className="grid grid-cols-[1fr_100px] items-center gap-3 rounded-xl border border-[var(--color-border-subtle)] p-3">
              <div><p className="text-sm font-bold">{index + 1}. {chapter.title}</p><p className="text-[11px] text-[var(--color-text-tertiary)]">{chapter.lessons} lessons · {chapter.status}</p></div>
              <label className="text-xs font-bold"><span className="sr-only">Weight</span><div className="relative"><input type="number" min="0" max="100" step=".1" value={weights[chapter.id] ?? 0} onChange={e => setWeights(current => ({ ...current, [chapter.id]: Number(e.target.value) }))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-transparent px-3 py-2 pr-7 text-sm" /><span className="absolute right-2 top-2.5 text-xs">%</span></div></label>
            </div>
          ))}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
        <div className="flex items-center gap-2"><GraduationCap className="text-emerald-600" size={20} /><h2 className="font-black">Past Exams / Safarka Wakhtiga</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-6">
          <input type="number" value={newExam.year} onChange={e => setNewExam(current => ({ ...current, year: Number(e.target.value) }))} placeholder="Year" className="rounded-xl border bg-transparent px-3 py-2 text-sm" />
          <input type="number" value={newExam.durationMin} onChange={e => setNewExam(current => ({ ...current, durationMin: Number(e.target.value) }))} placeholder="Minutes" className="rounded-xl border bg-transparent px-3 py-2 text-sm" />
          <input type="number" value={newExam.totalMarks} onChange={e => setNewExam(current => ({ ...current, totalMarks: Number(e.target.value) }))} placeholder="Marks" className="rounded-xl border bg-transparent px-3 py-2 text-sm" />
          <select value={newExam.answerKeyStatus} onChange={e => setNewExam(current => ({ ...current, answerKeyStatus: e.target.value as 'verified' | 'pending' }))} className="rounded-xl border bg-transparent px-3 py-2 text-sm"><option value="pending">Pending key</option><option value="verified">Verified key</option></select>
          <input value={newExam.source} onChange={e => setNewExam(current => ({ ...current, source: e.target.value }))} placeholder="Source" className="rounded-xl border bg-transparent px-3 py-2 text-sm" />
          <button disabled={saving} onClick={() => void createExam()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white"><Plus size={16} /> Add</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{exams.map(exam => (
          <article key={exam._id} className={`rounded-xl border p-4 ${selectedExam === exam._id ? 'border-emerald-500 bg-emerald-500/5' : 'border-[var(--color-border-subtle)]'}`}>
            <button onClick={() => setSelectedExam(exam._id)} className="w-full text-left"><div className="flex items-center justify-between"><strong className="text-2xl">{exam.year}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${exam.published ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10'}`}>{exam.published ? 'Published' : 'Draft'}</span></div><p className="mt-2 text-xs">{exam.durationMin} min · {exam.totalMarks} marks</p></button>
            <div className="mt-3 flex gap-2"><button onClick={() => void toggleExam(exam, 'published')} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold">{exam.published ? 'Unpublish' : 'Publish'}</button><button onClick={() => void toggleExam(exam, 'answerKeyStatus')} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${exam.answerKeyStatus === 'verified' ? 'text-emerald-600' : 'text-amber-600'}`}>{exam.answerKeyStatus}</button></div>
          </article>
        ))}</div>
      </section>

      <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><FileJson className="text-emerald-600" size={20} /><h2 className="font-black">Question Bank · JSON Bulk Import</h2></div><select value={selectedExam} onChange={e => setSelectedExam(e.target.value)} className="rounded-xl border bg-transparent px-3 py-2 text-sm"><option value="">Dooro sanad</option>{exams.map(exam => <option key={exam._id} value={exam._id}>{exam.year}</option>)}</select></div>
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Su'aal kasta waa inuu leeyahay <code>chapterId</code> iyo <code>topicTags</code>. Verified answer wuxuu u baahan yahay <code>answer</code>. Import-ku wuxuu update-gareeyaa question number hore u jiray halkii duplicate laga abuuri lahaa.</p>
        <textarea value={questionsJson} onChange={e => setQuestionsJson(e.target.value)} rows={12} spellCheck={false} className="mt-4 w-full rounded-xl border border-[var(--color-border-default)] bg-slate-950 p-4 font-mono text-xs text-slate-100 outline-none" />
        <div className="mt-3 flex flex-wrap gap-2"><button disabled={saving || !selectedExam} onClick={() => void importQuestions()} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Import / Update Questions</button><button onClick={() => setQuestionsJson(JSON.stringify([{ number: 1, type: 'mcq', textSo: 'Su’aasha...', options: ['A', 'B', 'C', 'D'], marks: 2, chapterId: chapters[0]?.id || 'CHAPTER_ID', topicTags: ['topic'], answer: 0, answerStatus: 'verified', explainerText: 'Sharaxaad kooban', bookRef: { pageFrom: 10, pageTo: 12 } }], null, 2))} className="rounded-xl border px-4 py-2.5 text-sm font-bold">Load Example</button></div>
      </section>

      {courseId && <GuuldoonUnmatchedAnswers courseId={courseId} />}

      <section className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-5">
        <div className="flex items-center gap-2"><BookOpen className="text-emerald-600" size={20} /><h2 className="font-black">Glossary · Soomaali / English / العربية</h2></div>
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">JSON array ahaan geli erayada farsamo. Ardaygu wuxuu taaban karaa erayga si uu saddexda luqadood u arko.</p>
        <textarea value={glossaryText} onChange={e => setGlossaryText(e.target.value)} rows={8} spellCheck={false} className="mt-4 w-full rounded-xl border border-[var(--color-border-default)] bg-slate-950 p-4 font-mono text-xs text-slate-100 outline-none" />
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button disabled={saving || (chapters.length > 0 && Math.abs(totalWeight - 100) > .5)} onClick={() => void saveConfig()} className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-black text-white shadow-xl disabled:opacity-50"><Save size={17} /> {saving ? 'Saving...' : 'Save Guuldoon Settings'}</button>
      </div>
    </div>
  );
}
