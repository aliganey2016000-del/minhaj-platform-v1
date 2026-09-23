import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, Clock3, Search, Trash2, UserRoundCheck, Users } from 'lucide-react';
import api from '../../../../lib/axios';

type Teacher = {
  _id: string;
  teacherId?: string;
  profile?: { firstName?: string; lastName?: string };
  user?: { email?: string };
};

type Session = {
  _id: string;
  class?: { _id?: string; title?: string; section?: string };
  className: string;
  course?: { title?: { en?: string }; courseCode?: string };
  teacher?: Teacher | null;
  teacherName: string;
  regularTeacherName?: string;
  startTime: string;
  endTime: string;
  isSubstitute?: boolean;
};

type Assignment = {
  _id: string;
  reason?: string;
  teacher?: Teacher;
  schedule?: {
    _id?: string;
    class?: { _id?: string; title?: string; section?: string };
    course?: { title?: { en?: string }; courseCode?: string };
    startTime?: string;
    endTime?: string;
  };
};

function localDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function subject(session?: Session) {
  return session?.course?.title?.en || session?.course?.courseCode || 'Subject';
}

function teacherName(teacher?: Teacher) {
  const name = `${teacher?.profile?.firstName || ''} ${teacher?.profile?.lastName || ''}`.trim();
  return name || teacher?.user?.email || teacher?.teacherId || 'Teacher';
}

function assignmentClass(row: Assignment) {
  const cls = row.schedule?.class;
  return cls ? `${cls.title || ''}${cls.section ? ` (${cls.section})` : ''}` : '—';
}

function assignmentSubject(row: Assignment) {
  return row.schedule?.course?.title?.en || row.schedule?.course?.courseCode || 'Subject';
}

function overlaps(aStart?: string, aEnd?: string, bStart?: string, bEnd?: string) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function SchoolSubstitutesPanel() {
  const [date, setDate] = useState(localDate());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [schedule, setSchedule] = useState('');
  const [teacher, setTeacher] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherPickerOpen, setTeacherPickerOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadTeachers = useCallback(async () => {
    setTeachersLoading(true);
    try {
      const response = await api.get('/teachers', { params: { status: 'active', limit: 500 } });
      setTeachers(response.data?.data || []);
    } catch {
      setTeachers([]);
    } finally {
      setTeachersLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [sessionResponse, substituteResponse] = await Promise.all([
        api.get('/attendance/school/sessions', { params: { date } }),
        api.get('/attendance/school/substitutes', { params: { date } }),
      ]);
      const nextSessions: Session[] = sessionResponse.data?.data?.sessions || [];
      setSessions(nextSessions);
      setAssignments(substituteResponse.data?.data || []);
      setSelectedClassId((current) =>
        current && nextSessions.some((row) => String(row.class?._id || '') === current) ? current : ''
      );
      setSchedule((current) =>
        current && nextSessions.some((row) => row._id === current) ? current : ''
      );
    } catch (e: any) {
      setSessions([]);
      setAssignments([]);
      setError(e?.response?.data?.message || 'Could not load substitute coverage.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadTeachers();
  }, [loadTeachers]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeSlots = useMemo(() => {
    const map = new Map<string, { startTime: string; endTime: string }>();
    sessions.forEach((row) => {
      const key = `${row.startTime}|${row.endTime}`;
      if (!map.has(key)) map.set(key, { startTime: row.startTime, endTime: row.endTime });
    });
    return [...map.values()].sort((a, b) =>
      a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
    );
  }, [sessions]);

  const periodNumberFor = useCallback((startTime?: string, endTime?: string) => {
    const index = timeSlots.findIndex((slot) => slot.startTime === startTime && slot.endTime === endTime);
    return index >= 0 ? index + 1 : null;
  }, [timeSlots]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((row) => {
      const id = String(row.class?._id || '');
      if (!id) return;
      map.set(id, row.className);
    });
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [sessions]);

  const periodOptions = useMemo(() =>
    sessions
      .filter((row) => String(row.class?._id || '') === selectedClassId)
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)),
  [selectedClassId, sessions]);

  const selected = useMemo(
    () => sessions.find((row) => row._id === schedule),
    [sessions, schedule],
  );

  const teacherOptions = useMemo(() => {
    if (!selected) return [];

    const regularTeacherId = String(selected.teacher?._id || '');
    return teachers
      .map((row) => {
        const id = String(row._id || '');
        let conflict = '';

        if (regularTeacherId && id === regularTeacherId) {
          conflict = 'Regular teacher';
        } else {
          const regularConflict = sessions.find((session) =>
            String(session.teacher?._id || '') === id
            && session._id !== selected._id
            && overlaps(session.startTime, session.endTime, selected.startTime, selected.endTime)
          );
          if (regularConflict) {
            conflict = `Has ${regularConflict.className} · ${subject(regularConflict)} ${regularConflict.startTime}–${regularConflict.endTime}`;
          }

          if (!conflict) {
            const substituteConflict = assignments.find((assignment) =>
              String(assignment.teacher?._id || '') === id
              && String(assignment.schedule?._id || '') !== selected._id
              && overlaps(
                assignment.schedule?.startTime,
                assignment.schedule?.endTime,
                selected.startTime,
                selected.endTime,
              )
            );
            if (substituteConflict) {
              conflict = `Covering ${assignmentClass(substituteConflict)} ${substituteConflict.schedule?.startTime || ''}–${substituteConflict.schedule?.endTime || ''}`;
            }
          }
        }

        return {
          teacher: row,
          name: teacherName(row),
          conflict,
          available: !conflict,
        };
      })
      .sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
  }, [assignments, selected, sessions, teachers]);

  const visibleTeacherOptions = useMemo(() => {
    const query = teacherSearch.trim().toLowerCase();
    const filtered = query
      ? teacherOptions.filter((item) => {
          const email = item.teacher.user?.email || '';
          const teacherId = item.teacher.teacherId || '';
          return `${item.name} ${email} ${teacherId}`.toLowerCase().includes(query);
        })
      : teacherOptions;
    return filtered.slice(0, 20);
  }, [teacherOptions, teacherSearch]);

  const selectedTeacher = useMemo(
    () => teachers.find((row) => String(row._id) === teacher),
    [teacher, teachers],
  );

  const handleDateChange = (value: string) => {
    setDate(value);
    setSelectedClassId('');
    setSchedule('');
    setTeacher('');
    setTeacherSearch('');
    setReason('');
    setMessage('');
    setError('');
  };

  const handleClassChange = (value: string) => {
    setSelectedClassId(value);
    setSchedule('');
    setTeacher('');
    setTeacherSearch('');
    setReason('');
    setMessage('');
    setError('');
  };

  const handleScheduleChange = (value: string) => {
    setSchedule(value);
    setTeacher('');
    setTeacherSearch('');
    setReason('');
    setMessage('');
    setError('');
  };

  const chooseTeacher = (row: Teacher) => {
    setTeacher(String(row._id));
    setTeacherSearch(teacherName(row));
    setTeacherPickerOpen(false);
    setError('');
  };

  const assign = async () => {
    if (!selectedClassId) {
      setError('Choose a Grade / Class first.');
      return;
    }
    if (!schedule) {
      setError('Choose a Period first.');
      return;
    }
    if (!teacher) {
      setError('Choose an available substitute teacher.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    try {
      await api.post('/attendance/school/substitutes', {
        date,
        schedule,
        teacher,
        reason: reason.trim(),
      });
      setMessage('Substitute teacher assigned successfully.');
      setTeacher('');
      setTeacherSearch('');
      setReason('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not assign substitute teacher.');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this substitute assignment?')) return;
    setLoading(true);
    setError('');
    try {
      await api.delete(`/attendance/school/substitutes/${id}`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not remove substitute assignment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
      <div className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-4 shadow-card">
        <div className="mb-4">
          <p className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]">
            <UserRoundCheck className="h-5 w-5" />
            Assign Substitute Teacher
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            Choose Date → Grade / Class → Period. The subject and regular teacher are filled automatically.
          </p>
        </div>

        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
        {message && <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}

        <div className="space-y-3">
          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"
            />
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Grade / Class</span>
            <select
              value={selectedClassId}
              onChange={(e) => handleClassChange(e.target.value)}
              disabled={loading || classOptions.length === 0}
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm disabled:opacity-60"
            >
              <option value="">{loading ? 'Loading classes...' : 'Select grade / class...'}</option>
              {classOptions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </select>
          </label>

          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Period</span>
            <select
              value={schedule}
              onChange={(e) => handleScheduleChange(e.target.value)}
              disabled={!selectedClassId || periodOptions.length === 0}
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm disabled:opacity-60"
            >
              <option value="">
                {!selectedClassId ? 'Select grade / class first...' : periodOptions.length ? 'Select period...' : 'No periods for this class'}
              </option>
              {periodOptions.map((row) => {
                const period = periodNumberFor(row.startTime, row.endTime);
                return (
                  <option key={row._id} value={row._id}>
                    {period ? `Period ${period} · ` : ''}{row.startTime}–{row.endTime}
                  </option>
                );
              })}
            </select>
          </label>

          {selected && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Subject</p>
                <p className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">{subject(selected)}</p>
              </div>
              <div className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Regular Teacher</p>
                <p className="mt-1 text-sm font-bold text-[var(--color-text-primary)]">{selected.regularTeacherName || selected.teacherName}</p>
              </div>
            </div>
          )}

          <div className="relative">
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">Substitute Teacher</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                value={teacherSearch}
                onFocus={() => selected && setTeacherPickerOpen(true)}
                onBlur={() => window.setTimeout(() => setTeacherPickerOpen(false), 160)}
                onChange={(e) => {
                  setTeacherSearch(e.target.value);
                  setTeacher('');
                  setTeacherPickerOpen(true);
                }}
                disabled={!selected || teachersLoading}
                placeholder={!selected ? 'Choose a period first...' : teachersLoading ? 'Loading teachers...' : 'Search teacher name, ID or email...'}
                className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] py-2.5 pl-10 pr-9 text-sm disabled:opacity-60"
              />
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
            </div>

            {teacherPickerOpen && selected && (
              <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1.5 shadow-xl">
                {visibleTeacherOptions.length === 0 ? (
                  <div className="px-3 py-5 text-center text-xs text-[var(--color-text-tertiary)]">No teachers match your search.</div>
                ) : visibleTeacherOptions.map((item) => (
                  <button
                    key={item.teacher._id}
                    type="button"
                    disabled={!item.available}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => item.available && chooseTeacher(item.teacher)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${item.available
                      ? 'hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
                      : 'cursor-not-allowed opacity-50'}`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.available
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)]'}`}>
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{item.name}</p>
                      <p className="truncate text-[11px] text-[var(--color-text-tertiary)]">
                        {item.teacher.teacherId || item.teacher.user?.email || 'Teacher'}
                      </p>
                    </div>
                    {item.available ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> Available
                      </span>
                    ) : (
                      <span className="max-w-32 text-right text-[10px] font-semibold leading-4 text-red-600">{item.conflict}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {selectedTeacher && (
              <p className="mt-1.5 text-[11px] font-semibold text-emerald-600">
                Selected: {teacherName(selectedTeacher)}
              </p>
            )}
          </div>

          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">
              Reason <span className="font-normal text-[var(--color-text-tertiary)]">(optional)</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Regular teacher on leave"
              className="w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2.5 text-sm"
            />
          </label>

          <button
            type="button"
            onClick={assign}
            disabled={loading || !selectedClassId || !schedule || !teacher}
            className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Assign Substitute'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card">
        <div className="border-b border-[var(--color-border-default)] p-4">
          <p className="flex items-center gap-2 font-bold text-[var(--color-text-primary)]">
            <CalendarClock className="h-5 w-5" />
            Coverage for {date}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            Assigned substitutes receive attendance access only for these dated sessions.
          </p>
        </div>

        {loading && assignments.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">Loading coverage...</div>
        ) : assignments.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--color-text-tertiary)]">No substitute assignments for this date.</div>
        ) : (
          <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">
            {assignments.map((row) => {
              const period = periodNumberFor(row.schedule?.startTime, row.schedule?.endTime);
              return (
                <div key={row._id} className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-[var(--color-text-primary)]">{assignmentClass(row)}</p>
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Assigned ✓</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-primary-600">{assignmentSubject(row)}</p>
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
                        <Clock3 className="h-3.5 w-3.5" />
                        {period ? `Period ${period} · ` : ''}{row.schedule?.startTime}–{row.schedule?.endTime}
                      </p>
                      <div className="mt-3 rounded-xl bg-[var(--color-surface-primary)] p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">Substitute</p>
                        <p className="mt-1 text-sm font-bold text-emerald-600">{teacherName(row.teacher)}</p>
                        {row.reason && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{row.reason}</p>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(row._id)}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                      title="Remove substitute"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default SchoolSubstitutesPanel;
