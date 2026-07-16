/**
 * Class Schedules Management — Admin
 *
 * CRUD for class scheduling. Links organization, class, course, teacher,
 * day of week (Saturday–Friday), and start/end times.
 *
 * Also shows a live "time-locked" status indicator per schedule row:
 *   🟢 Active now   🟠 Scheduled (different time today)   ⚪ Not today
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface SchoolBrief { _id: string; name: string; }
interface ClassBrief { _id: string; title: string; section: string; }
interface CourseBrief { _id: string; title: { en: string }; }
interface TeacherBrief { _id: string; name?: string; profile?: { firstName: string; lastName: string }; }
interface Schedule {
  _id: string;
  school: SchoolBrief;
  class: ClassBrief;
  course: CourseBrief;
  teacher: TeacherBrief;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}
interface ScheduleStatus { isScheduled: boolean; isWithinWindow: boolean; schedule: { dayName: string; startTime: string; endTime: string } | null; }

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SchedulesManage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [classes, setClasses] = useState<ClassBrief[]>([]);
  const [courses, setCourses] = useState<CourseBrief[]>([]);
  const [teachers, setTeachers] = useState<TeacherBrief[]>([]);

  const [formSchool, setFormSchool] = useState('');
  const [formClass, setFormClass] = useState('');
  const [formCourse, setFormCourse] = useState('');
  const [formTeacher, setFormTeacher] = useState('');
  const [formDay, setFormDay] = useState(0);
  const [formStart, setFormStart] = useState('08:00');
  const [formEnd, setFormEnd] = useState('09:30');
  const [formActive, setFormActive] = useState(true);

  const [statuses, setStatuses] = useState<Record<string, ScheduleStatus>>({});
  const [saving, setSaving] = useState(false);

  // ── Fetch schedules ──
  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/class-schedules');
      const items = data.data || [];
      setSchedules(items);
      // Fetch status for each course
      const map: Record<string, ScheduleStatus> = {};
      await Promise.all(
        items.map(async (s: Schedule) => {
          try {
            const r = await api.get(`/class-schedules/status/${s.course._id}`);
            map[s.course._id] = r.data.data;
          } catch { map[s.course._id] = { isScheduled: false, isWithinWindow: false, schedule: null }; }
        })
      );
      setStatuses((prev) => ({ ...prev, ...map }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load reference data ──
  useEffect(() => {
    fetchSchedules();
    (async () => {
      try {
        const [sRes, cRes, coRes, tRes] = await Promise.all([
          api.get('/schools'),
          api.get('/classes'),
          api.get('/courses'),
          api.get('/teachers'),
        ]);
        setSchools(sRes.data.data || []);
        setClasses(cRes.data.data || []);
        setCourses(coRes.data.data || []);
        setTeachers(tRes.data.data || []);
      } catch {}
    })();
  }, [fetchSchedules]);

  // ── Submit form ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        school: formSchool,
        class: formClass,
        course: formCourse,
        teacher: formTeacher,
        dayOfWeek: formDay,
        startTime: formStart,
        endTime: formEnd,
        isActive: formActive,
      };
      if (editId) {
        await api.put(`/class-schedules/${editId}`, payload);
        setMessage('Schedule updated');
      } else {
        await api.post('/class-schedules', payload);
        setMessage('Schedule created');
      }
      resetForm();
      fetchSchedules();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormSchool(''); setFormClass(''); setFormCourse('');
    setFormTeacher(''); setFormDay(0); setFormStart('08:00');
    setFormEnd('09:30'); setFormActive(true); setEditId(null); setShowForm(false);
  };

  const handleEdit = (s: Schedule) => {
    setFormSchool(s.school._id);
    setFormClass(s.class._id);
    setFormCourse(s.course._id);
    setFormTeacher(s.teacher._id);
    setFormDay(s.dayOfWeek);
    setFormStart(s.startTime);
    setFormEnd(s.endTime);
    setFormActive(s.isActive);
    setEditId(s._id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this schedule?')) return;
    try {
      await api.delete(`/class-schedules/${id}`);
      fetchSchedules();
      setMessage('Schedule deleted');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Delete failed');
    }
  };

  const teacherLabel = (t: TeacherBrief) => t.profile ? `${t.profile.firstName} ${t.profile.lastName}` : (t as any).name || t._id;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">🕐 Class Schedules</h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">Manage class time slots for attendance tracking</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Schedule'}
          </button>
        </div>

        {message && <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-700">{message}</div>}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-600">{error}</div>}

        {/* ── Form ── */}
        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-6 shadow-card space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Organization</label>
                <select value={formSchool} onChange={(e) => setFormSchool(e.target.value)} required className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {schools.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Class</label>
                <select value={formClass} onChange={(e) => setFormClass(e.target.value)} required className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {classes.map((c) => <option key={c._id} value={c._id}>{c.title} {c.section}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Course</label>
                <select value={formCourse} onChange={(e) => setFormCourse(e.target.value)} required className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {courses.map((c) => <option key={c._id} value={c._id}>{c.title.en}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Teacher</label>
                <select value={formTeacher} onChange={(e) => setFormTeacher(e.target.value)} required className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {teachers.map((t: any) => <option key={t._id} value={t._id}>{teacherLabel(t)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Day of Week</label>
                <select value={formDay} onChange={(e) => setFormDay(Number(e.target.value))} className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm">
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">Start Time</label>
                  <input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)} required className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1 block">End Time</label>
                  <input type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} required className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} id="active-check" className="h-4 w-4" />
                <label htmlFor="active-check" className="text-sm text-[var(--color-text-secondary)]">Active</label>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button>
              <button type="button" onClick={resetForm} className="rounded-xl border border-[var(--color-border-default)] px-5 py-2.5 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]">Cancel</button>
            </div>
          </form>
        )}

        {/* ── Schedules Table ── */}
        {loading && <div className="flex justify-center py-10"><div className="h-10 w-10 animate-spin rounded-full border-3 border-[var(--color-border-default)] border-t-primary-600" /></div>}

        {!loading && schedules.length === 0 && !showForm && (
          <div className="text-center py-16 text-[var(--color-text-tertiary)]"><p className="text-lg">No schedules yet. Create your first schedule above.</p></div>
        )}

        {!loading && schedules.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface-secondary)] text-left text-xs font-semibold text-[var(--color-text-tertiary)] uppercase">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Day</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Teacher</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {schedules.map((s) => {
                    const status = statuses[s.course._id];
                    const inWindow = status?.isWithinWindow;
                    const today = new Date().getDay() === s.dayOfWeek;
                    return (
                      <tr key={s._id} className="hover:bg-[var(--color-surface-secondary)] transition-colors">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            inWindow ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                            today ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                            'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                          }`}>
                            {inWindow ? '🟢' : today ? '🟠' : '⚪'}
                            {inWindow ? ' Active now' : today ? ' Today' : ' Off'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">{s.course.title.en}</td>
                        <td className="px-4 py-3">{DAYS[s.dayOfWeek]}</td>
                        <td className="px-4 py-3">{s.startTime} – {s.endTime}</td>
                        <td className="px-4 py-3">{teacherLabel(s.teacher)}</td>
                        <td className="px-4 py-3">{s.class.title} {s.class.section}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleEdit(s)} className="text-primary-600 hover:underline text-xs font-medium mr-3">Edit</button>
                          <button onClick={() => handleDelete(s._id)} className="text-red-500 hover:underline text-xs font-medium">Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SchedulesManage;