import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, CheckSquare, Users, Zap } from 'lucide-react';
import { AcademicYearSelect } from '../../shared/components/academic-year-select';

export type PlanRoomRow = {
  classId: string;
  roomIds: string[];
};

export type RoomPlanItem = {
  classId: string;
  roomIds: string[];
};

export type AutoDefaults = {
  academicYear: string;
  examType: string;
  classIds: string[];
  roomIds: string[];
  roomPlan: RoomPlanItem[];
};

type ClassItem = {
  _id: string;
  title: string;
  section?: string;
  department?: { _id: string; name: string } | string;
  status?: string;
};

type Room = {
  _id: string;
  name: string;
  building?: string;
  capacity: number;
};

type Props = {
  classes: ClassItem[];
  rooms: Room[];
  studentCounts: Record<string, number>;
  year: string;
  type: string;
  planRows: PlanRoomRow[];
  setYear: (value: string) => void;
  setType: (value: string) => void;
  setPlanRows: (value: PlanRoomRow[]) => void;
  onGenerate: (defaults: AutoDefaults) => void;
};

const card = 'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-card';
const input = 'w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20';

const classNameOf = (c: ClassItem) => [c.title, c.section].filter(Boolean).join(' ');
const departmentNameOf = (c: ClassItem) => typeof c.department === 'string' ? c.department : c.department?.name || '';

export function PlanRoomsPanel({
  classes,
  rooms,
  studentCounts,
  year,
  type,
  planRows,
  setYear,
  setType,
  setPlanRows,
  onGenerate,
}: Props) {
  const [section, setSection] = useState<'all' | 'primary' | 'middle' | 'secondary'>('all');
  const [localError, setLocalError] = useState('');

  const activeClasses = useMemo(
    () => classes
      .filter(c => c.status === 'active')
      .slice()
      .sort((a, b) => classNameOf(a).localeCompare(classNameOf(b), undefined, { numeric: true })),
    [classes],
  );

  const sortedRooms = useMemo(
    () => rooms
      .slice()
      .sort((a, b) => (a.building || '').localeCompare(b.building || '') || a.name.localeCompare(b.name, undefined, { numeric: true })),
    [rooms],
  );

  const sectionOf = (c: ClassItem) => {
    const label = (departmentNameOf(c) + ' ' + c.title).toLowerCase();
    if (label.includes('primary')) return 'primary';
    if (label.includes('middle')) return 'middle';
    if (label.includes('secondary')) return 'secondary';
    return 'all';
  };

  const visibleClasses = activeClasses.filter(c => section === 'all' || sectionOf(c) === section);
  const rowOf = (classId: string) => planRows.find(r => r.classId === classId) || { classId, roomIds: [] };
  const roomById = new Map(sortedRooms.map(r => [r._id, r]));
  const totalRoomCapacity = sortedRooms.reduce((sum, r) => sum + (Number(r.capacity) || 0), 0);
  const activeStudentTotal = activeClasses.reduce((sum, c) => sum + (studentCounts[c._id] || 0), 0);
  const usedRoomIds = Array.from(new Set(planRows.flatMap(r => r.roomIds)));
  const selectedCapacity = usedRoomIds.reduce((sum, id) => sum + (Number(roomById.get(id)?.capacity) || 0), 0);

  const updateRooms = (classId: string, roomIds: string[]) => {
    setLocalError('');
    setPlanRows(planRows.map(r => r.classId === classId ? { ...r, roomIds } : r));
  };

  const setRoomCount = (classId: string, count: number) => {
    const current = rowOf(classId).roomIds.filter(id => roomById.has(id));
    if (count <= current.length) {
      updateRooms(classId, current.slice(0, count));
      return;
    }
    const next = [...current];
    for (const room of sortedRooms) {
      if (next.length >= count) break;
      if (!next.includes(room._id)) next.push(room._id);
    }
    updateRooms(classId, next);
  };

  const toggleRoom = (classId: string, roomId: string) => {
    const current = rowOf(classId).roomIds;
    updateRooms(
      classId,
      current.includes(roomId) ? current.filter(id => id !== roomId) : [...current, roomId],
    );
  };

  const autoSuggest = () => {
    if (!sortedRooms.length) {
      setLocalError('Add at least one Room before planning.');
      return;
    }
    let cursor = 0;
    const next = activeClasses.map(cls => {
      const students = studentCounts[cls._id] || 0;
      if (students <= 0) return { classId: cls._id, roomIds: [] };
      const selected: string[] = [];
      let capacity = 0;
      for (let i = 0; i < sortedRooms.length && capacity < students; i += 1) {
        const room = sortedRooms[(cursor + i) % sortedRooms.length];
        selected.push(room._id);
        capacity += Number(room.capacity) || 0;
      }
      cursor = (cursor + Math.max(1, selected.length)) % sortedRooms.length;
      return { classId: cls._id, roomIds: selected };
    });
    setPlanRows(next);
    setLocalError('');
  };

  const generate = () => {
    if (!year || !type) {
      setLocalError('Select Academic Year and Exam Type first.');
      return;
    }
    const rows = activeClasses
      .map(cls => ({ cls, row: rowOf(cls._id), students: studentCounts[cls._id] || 0 }))
      .filter(item => item.students > 0);

    const missing = rows.filter(({ row }) => row.roomIds.length === 0);
    if (missing.length) {
      setLocalError('Choose Rooms for ' + missing[0].cls.title + (missing.length > 1 ? ' and ' + (missing.length - 1) + ' more class(es).' : '.'));
      return;
    }

    const insufficient = rows.find(({ row, students }) =>
      row.roomIds.reduce((sum, id) => sum + (Number(roomById.get(id)?.capacity) || 0), 0) < students
    );
    if (insufficient) {
      setLocalError(classNameOf(insufficient.cls) + ' needs more room capacity.');
      return;
    }

    const classIds = rows.map(({ cls }) => cls._id);
    const roomIds = Array.from(new Set(rows.flatMap(({ row }) => row.roomIds)));
    const roomPlan = rows.map(({ cls, row }) => ({ classId: cls._id, roomIds: row.roomIds }));

    onGenerate({ academicYear: year, examType: type, classIds, roomIds, roomPlan });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className={card + ' p-4 sm:p-5'}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
            <label>
              <span className="mb-2 block text-sm font-semibold">Academic Year</span>
              <AcademicYearSelect value={year} onChange={setYear} required />
            </label>
            <label>
              <span className="mb-2 block text-sm font-semibold">Exam Type</span>
              <select className={input} value={type} onChange={e => setType(e.target.value)}>
                <option value="">Select exam type...</option>
                <option value="mid">Mid Exam</option>
                <option value="final">Final</option>
              </select>
            </label>
            <div>
              <p className="mb-2 text-sm font-semibold">Section</p>
              <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--color-surface-secondary)] p-1">
                {([
                  ['all', 'All'],
                  ['primary', 'Primary'],
                  ['middle', 'Middle'],
                  ['secondary', 'Secondary'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSection(value)}
                    className={'rounded-lg px-3 py-2 text-xs font-semibold transition ' + (section === value ? 'bg-primary-600 text-white shadow-sm' : 'hover:bg-[var(--color-surface-primary)]')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={card + ' border-primary-100 bg-primary-50/40 p-4 sm:p-5 dark:border-primary-900/40 dark:bg-primary-950/10'}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary-100 p-2.5 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Available Rooms (This Organization)</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <span className="text-3xl font-bold">{sortedRooms.length}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{totalRoomCapacity} total capacity</span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Only rooms belonging to the current organization are used.</p>
            </div>
          </div>
        </div>
      </div>

      {localError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          <AlertTriangle size={17} />
          <span>{localError}</span>
        </div>
      )}

      <div className={card + ' overflow-hidden'}>
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-lg font-bold">Plan Rooms per Class</h2>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Choose how many rooms each class may use, then preview the Smart Allocation.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={autoSuggest} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface-secondary)]">
              <Zap size={16} />
              Auto Suggest
            </button>
            <button type="button" onClick={generate} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">
              <CheckCircle2 size={16} />
              Generate Allocation
            </button>
          </div>
        </div>

        {visibleClasses.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">No active classes found for this section.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-[var(--color-surface-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Class</th>
                  <th className="px-4 py-3 text-left">Students</th>
                  <th className="px-4 py-3 text-left">No. of Rooms</th>
                  <th className="px-4 py-3 text-left">Selected Rooms</th>
                  <th className="px-4 py-3 text-left">Total Capacity</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleClasses.map((cls, index) => {
                  const row = rowOf(cls._id);
                  const students = studentCounts[cls._id] || 0;
                  const totalCapacity = row.roomIds.reduce((sum, id) => sum + (Number(roomById.get(id)?.capacity) || 0), 0);
                  const enough = students === 0 || totalCapacity >= students;
                  return (
                    <tr key={cls._id} className="border-t align-top">
                      <td className="px-4 py-4 text-[var(--color-text-tertiary)]">{index + 1}</td>
                      <td className="px-4 py-4">
                        <p className="font-semibold">{classNameOf(cls)}</p>
                        {departmentNameOf(cls) && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{departmentNameOf(cls)}</p>}
                      </td>
                      <td className="px-4 py-4 font-semibold">{students}</td>
                      <td className="px-4 py-4">
                        <select
                          className="w-24 rounded-lg border bg-[var(--color-surface-primary)] px-2.5 py-2"
                          value={row.roomIds.length}
                          onChange={e => setRoomCount(cls._id, Number(e.target.value))}
                        >
                          {Array.from({ length: sortedRooms.length + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <details className="relative">
                          <summary className="flex min-h-10 min-w-[280px] cursor-pointer list-none flex-wrap items-center gap-1.5 rounded-xl border bg-[var(--color-surface-primary)] px-3 py-2 [&::-webkit-details-marker]:hidden">
                            {row.roomIds.length === 0 ? (
                              <span className="text-[var(--color-text-tertiary)]">Choose rooms...</span>
                            ) : row.roomIds.map(id => {
                              const room = roomById.get(id);
                              return room ? <span key={id} className="rounded-lg bg-[var(--color-surface-secondary)] px-2 py-1 text-xs font-semibold">{room.name} / {room.capacity}</span> : null;
                            })}
                          </summary>
                          <div className="absolute left-0 top-12 z-40 w-[300px] max-w-[80vw] rounded-xl border bg-[var(--color-surface-primary)] p-2 shadow-xl">
                            {sortedRooms.length === 0 ? (
                              <p className="p-2 text-xs text-[var(--color-text-tertiary)]">No rooms available.</p>
                            ) : sortedRooms.map(room => (
                              <label key={room._id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-[var(--color-surface-secondary)]">
                                <input type="checkbox" checked={row.roomIds.includes(room._id)} onChange={() => toggleRoom(cls._id, room._id)} className="h-4 w-4" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">{room.name}</span>
                                  <span className="block text-xs text-[var(--color-text-tertiary)]">{room.building || 'Main'} / {room.capacity} seats</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </details>
                      </td>
                      <td className="px-4 py-4 font-semibold">{totalCapacity}</td>
                      <td className="px-4 py-4">
                        {enough ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 size={13} />
                            Enough
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            <AlertTriangle size={13} />
                            Need {students - totalCapacity}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className={card + ' p-4 sm:p-5'}>
          <h3 className="font-bold">Rooms Overview (This Organization)</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Total Rooms', sortedRooms.length, Building2],
              ['Rooms Selected', usedRoomIds.length, CheckCircle2],
              ['Total Capacity', totalRoomCapacity, Users],
              ['Selected Capacity', selectedCapacity, CheckSquare],
            ].map(([label, value, Icon]: any) => (
              <div key={label} className="rounded-xl bg-[var(--color-surface-secondary)] p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-[var(--color-surface-primary)] p-2"><Icon size={17} /></div>
                  <div>
                    <p className="text-xs text-[var(--color-text-tertiary)]">{label}</p>
                    <p className="text-xl font-bold">{value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={card + ' p-4 sm:p-5'}>
          <h3 className="font-bold">Allocation Summary</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Active Students</span><b>{activeStudentTotal}</b></div>
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Active Classes</span><b>{activeClasses.length}</b></div>
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Rooms Selected</span><b>{usedRoomIds.length}</b></div>
            <div className="flex justify-between gap-3 border-t pt-3"><span className="text-[var(--color-text-tertiary)]">Selected Capacity</span><b>{selectedCapacity}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlanRoomsPanel;
