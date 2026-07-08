/**
 * Course Management — Admin CRUD
 * Lists all courses from API, with create/edit/delete capabilities
 */

import { useEffect, useState, useCallback } from 'react';
import api from '../../../lib/axios';

interface Course {
  _id: string;
  title: { en: string; so: string; ar: string };
  slug: string;
  category: string;
  level: string;
  duration: number;
  fee: number;
  status: string;
  enrolledStudents: number;
  maxStudents: number;
  startDate?: string;
  createdAt: string;
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ titleEn: '', category: 'quran', level: 'beginner', duration: 8, fee: 0, maxStudents: 50 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/courses', {
        title: { en: form.titleEn, so: '', ar: '' },
        description: { en: '', so: '', ar: '' },
        category: form.category,
        level: form.level,
        duration: Number(form.duration),
        fee: Number(form.fee),
        teacher: null, // Will need a real teacher ID in production
        maxStudents: Number(form.maxStudents),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create course');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--color-surface-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">➕ Create Course</h2>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input className="w-full rounded-xl border px-4 py-2.5 text-sm" placeholder="Course Title (English)" value={form.titleEn} onChange={e => setForm({...form, titleEn: e.target.value})} required />
          <select className="w-full rounded-xl border px-4 py-2.5 text-sm" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
            {['quran','fiqh','aqeedah','seerah','arabic','tajweed','hadith','akhlaq'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="w-full rounded-xl border px-4 py-2.5 text-sm" value={form.level} onChange={e => setForm({...form, level: e.target.value})}>
            {['beginner','intermediate','advanced'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <input className="rounded-xl border px-4 py-2.5 text-sm" type="number" placeholder="Weeks" value={form.duration} onChange={e => setForm({...form, duration: Number(e.target.value)})} />
            <input className="rounded-xl border px-4 py-2.5 text-sm" type="number" placeholder="Fee ($)" value={form.fee} onChange={e => setForm({...form, fee: Number(e.target.value)})} />
            <input className="rounded-xl border px-4 py-2.5 text-sm" type="number" placeholder="Capacity" value={form.maxStudents} onChange={e => setForm({...form, maxStudents: Number(e.target.value)})} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border px-4 py-2.5 text-sm">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60">{loading ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CoursesManage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const fetchCourses = useCallback(async () => {
    try {
      const { data } = await api.get('/courses/admin');
      setCourses(data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this course?')) return;
    try {
      await api.delete(`/courses/${id}`);
      setCourses(prev => prev.filter(c => c._id !== id));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-3 border-t-primary-600" /></div>;
  if (error) return <div className="text-center py-20"><p className="text-red-500 mb-4">{error}</p><button onClick={fetchCourses} className="rounded-xl bg-primary-600 px-5 py-2 text-sm text-white">Retry</button></div>;

  return (
    <div className="p-6 lg:p-10 pt-20 lg:pt-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">📚 Manage Courses</h1>
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">+ Add Course</button>
        </div>

        <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] overflow-hidden shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-secondary)] border-b">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Course</th>
                <th className="text-left px-5 py-3 font-semibold hidden sm:table-cell">Category</th>
                <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Level</th>
                <th className="text-center px-5 py-3 font-semibold hidden lg:table-cell">Students</th>
                <th className="text-center px-5 py-3 font-semibold">Status</th>
                <th className="text-center px-5 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-[var(--color-text-tertiary)]">No courses yet. Click "+ Add Course" to create one.</td></tr>
              ) : (
                courses.map(course => (
                  <tr key={course._id} className="border-b hover:bg-[var(--color-surface-secondary)] transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold">{course.title.en}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">{course.duration} weeks {course.fee > 0 ? `— $${course.fee}` : '— Free'}</p>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell"><span className="rounded-full bg-primary-100 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">{course.category}</span></td>
                    <td className="px-5 py-4 hidden md:table-cell capitalize">{course.level}</td>
                    <td className="px-5 py-4 text-center hidden lg:table-cell">{course.enrolledStudents}/{course.maxStudents}</td>
                    <td className="px-5 py-4 text-center"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${course.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : course.status === 'draft' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-gray-100 text-gray-600'}`}>{course.status}</span></td>
                    <td className="px-5 py-4 text-center">
                      <button onClick={() => handleDelete(course._id)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={fetchCourses} />}
    </div>
  );
}

export default CoursesManage;