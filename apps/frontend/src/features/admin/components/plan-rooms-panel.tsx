import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Plus, Trash2, Users, Zap } from 'lucide-react';
import { AcademicYearSelect } from '../../shared/components/academic-year-select';

export type PlanAllocation = {
  classId: string;
  quota: number;
};

export type PlanRoomRow = {
  roomId: string;
  allocations: PlanAllocation[];
};

export type RoomPlanItem = {
  classId: string;
  roomIds: string[];
  quotas: Array<{ roomId: string; count: number }>;
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
  gradeLevel?: number;
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

const numericGrade = (c: ClassItem) => {
  if (Number.isFinite(Number(c.gradeLevel))) return Number(c.gradeLevel);
  const match = String(c.title || '').match(/\d+/);
  return match ? Number(match[0]) : null;
};

const gradeKeyOf = (c: ClassItem) => {
  const grade = numericGrade(c);
  return grade !== null ? 'grade-' + grade : String(c.title || c._id).trim().toLowerCase();
};

const gradeLabelOf = (c: ClassItem) => {
  const grade = numericGrade(c);
  return grade !== null ? 'Grade ' + grade : c.title;
};

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
  const [localError, setLocalError] = useState('');

  const activeClasses = useMemo(
    () => classes
      .filter(c => c.status === 'active' && (studentCounts[c._id] || 0) > 0)
      .slice()
      .sort((a, b) => {
        const ga = numericGrade(a);
        const gb = numericGrade(b);
        if (ga !== null && gb !== null && ga !== gb) return ga - gb;
        return classNameOf(a).localeCompare(classNameOf(b), undefined, { numeric: true });
      }),
    [classes, studentCounts],
  );

  const sortedRooms = useMemo(
    () => rooms
      .slice()
      .sort((a, b) => (a.building || '').localeCompare(b.building || '') || a.name.localeCompare(b.name, undefined, { numeric: true })),
    [rooms],
  );

  const classById = useMemo(() => new Map(activeClasses.map(c => [c._id, c])), [activeClasses]);
  const roomById = useMemo(() => new Map(sortedRooms.map(r => [r._id, r])), [sortedRooms]);
  const rowOf = (roomId: string) => planRows.find(row => row.roomId === roomId) || { roomId, allocations: [] };

  const totalRoomCapacity = sortedRooms.reduce((sum, room) => sum + (Number(room.capacity) || 0), 0);
  const activeStudentTotal = activeClasses.reduce((sum, cls) => sum + (studentCounts[cls._id] || 0), 0);

  const assignedByClass = useMemo(() => {
    const totals: Record<string, number> = {};
    planRows.forEach(row => row.allocations.forEach(allocation => {
      totals[allocation.classId] = (totals[allocation.classId] || 0) + Math.max(0, Number(allocation.quota) || 0);
    }));
    return totals;
  }, [planRows]);

  const assignedTotal = Object.values(assignedByClass).reduce((sum, value) => sum + value, 0);
  const usedRoomCount = planRows.filter(row => row.allocations.some(a => Number(a.quota) > 0)).length;
  const usedCapacity = planRows.reduce((sum, row) => {
    const room = roomById.get(row.roomId);
    return row.allocations.some(a => Number(a.quota) > 0) ? sum + (Number(room?.capacity) || 0) : sum;
  }, 0);

  const updateRow = (roomId: string, allocations: PlanAllocation[]) => {
    setLocalError('');
    setPlanRows(sortedRooms.map(room => (
      room._id === roomId
        ? { roomId, allocations }
        : rowOf(room._id)
    )));
  };

  const updateAllocation = (roomId: string, index: number, patch: Partial<PlanAllocation>) => {
    const row = rowOf(roomId);
    updateRow(roomId, row.allocations.map((allocation, i) => i === index ? { ...allocation, ...patch } : allocation));
  };

  const removeAllocation = (roomId: string, index: number) => {
    const row = rowOf(roomId);
    updateRow(roomId, row.allocations.filter((_, i) => i !== index));
  };

  const addAllocation = (roomId: string) => {
    const row = rowOf(roomId);
    if (row.allocations.length >= 3) return;
    const used = new Set(row.allocations.map(a => a.classId));
    const nextClass = activeClasses.find(cls => !used.has(cls._id));
    if (!nextClass) return;
    updateRow(roomId, [...row.allocations, { classId: nextClass._id, quota: 1 }]);
  };

  const generateSmartPlan = () => {
    setLocalError('');
    if (!sortedRooms.length) {
      setLocalError('Add at least one Room before generating the plan.');
      return;
    }
    if (!activeClasses.length) {
      setLocalError('No active students were found in the active classes.');
      return;
    }
    if (totalRoomCapacity < activeStudentTotal) {
      setLocalError('Room capacity is short by ' + (activeStudentTotal - totalRoomCapacity) + ' seats. Increase capacity or add another room.');
      return;
    }

    type Candidate = {
      classId: string;
      gradeKey: string;
      gradeNumber: number | null;
      remaining: number;
    };

    const candidates: Candidate[] = activeClasses.map(cls => ({
      classId: cls._id,
      gradeKey: gradeKeyOf(cls),
      gradeNumber: numericGrade(cls),
      remaining: studentCounts[cls._id] || 0,
    }));

    const nextRows: PlanRoomRow[] = sortedRooms.map(room => ({ roomId: room._id, allocations: [] }));
    let totalRemaining = activeStudentTotal;

    const roomsNeeded: Room[] = [];
    let plannedCapacity = 0;
    for (const room of sortedRooms) {
      roomsNeeded.push(room);
      plannedCapacity += Number(room.capacity) || 0;
      if (plannedCapacity >= activeStudentTotal) break;
    }

    const distanceScore = (candidate: Candidate, selected: Candidate[]) => {
      if (!selected.length) return 0;
      if (candidate.gradeNumber === null || selected.some(item => item.gradeNumber === null)) return 0;
      return Math.min(...selected.map(item => Math.abs(Number(candidate.gradeNumber) - Number(item.gradeNumber))));
    };

    const addSeat = (row: PlanRoomRow, candidate: Candidate) => {
      const existing = row.allocations.find(allocation => allocation.classId === candidate.classId);
      if (existing) existing.quota += 1;
      else row.allocations.push({ classId: candidate.classId, quota: 1 });
      candidate.remaining -= 1;
      totalRemaining -= 1;
    };

    for (let roomIndex = 0; roomIndex < roomsNeeded.length; roomIndex += 1) {
      if (totalRemaining <= 0) break;

      const room = roomsNeeded[roomIndex];
      const row = nextRows.find(item => item.roomId === room._id)!;
      let seats = Math.min(Number(room.capacity) || 0, totalRemaining);
      if (seats <= 0) continue;

      const roomsRemaining = Math.max(1, roomsNeeded.length - roomIndex);
      const selected: Candidate[] = [];
      const selectedGrades = new Set<string>();

      while (selected.length < 3) {
        const options = candidates
          .filter(candidate => candidate.remaining > 0 && !selectedGrades.has(candidate.gradeKey))
          .sort((a, b) =>
            distanceScore(b, selected) - distanceScore(a, selected)
            || (b.remaining / roomsRemaining) - (a.remaining / roomsRemaining)
            || b.remaining - a.remaining
            || a.classId.localeCompare(b.classId)
          );
        const candidate = options[0];
        if (!candidate) break;
        selected.push(candidate);
        selectedGrades.add(candidate.gradeKey);
      }

      if (!selected.length) break;

      const before = new Map(selected.map(candidate => [candidate.classId, candidate.remaining]));

      // Give each selected grade at least one seat first so a room does not
      // accidentally become single-grade when a mixed plan is possible.
      for (const candidate of selected) {
        if (seats <= 0 || candidate.remaining <= 0) break;
        addSeat(row, candidate);
        seats -= 1;
      }

      // Spread each grade across the rooms that are still needed instead of
      // exhausting a small grade in the first room.
      let progress = true;
      while (seats > 0 && progress) {
        progress = false;
        for (const candidate of selected) {
          if (seats <= 0 || candidate.remaining <= 0) continue;
          const original = before.get(candidate.classId) || 0;
          const fairTarget = Math.max(1, Math.ceil(original / roomsRemaining));
          const alreadyHere = row.allocations.find(a => a.classId === candidate.classId)?.quota || 0;
          if (alreadyHere >= fairTarget) continue;
          addSeat(row, candidate);
          seats -= 1;
          progress = true;
        }
      }

      // Fill remaining seats primarily from large grades, but reserve one
      // student for future rooms where possible so later rooms stay mixed too.
      while (seats > 0) {
        const options = selected
          .filter(candidate => candidate.remaining > 0)
          .map(candidate => ({
            candidate,
            spareNow: candidate.remaining - Math.min(candidate.remaining, Math.max(0, roomsRemaining - 1)),
          }))
          .filter(item => item.spareNow > 0)
          .sort((a, b) => b.spareNow - a.spareNow || b.candidate.remaining - a.candidate.remaining);

        const next = options[0]?.candidate;
        if (!next) break;
        addSeat(row, next);
        seats -= 1;
      }
    }

    if (totalRemaining > 0) {
      setLocalError('The automatic plan could not place ' + totalRemaining + ' students. Please review room capacities.');
      return;
    }

    setPlanRows(nextRows);
  };

  const validatePlan = () => {
    if (!year || !type) return 'Select Academic Year and Exam Type first.';

    for (const row of planRows) {
      const room = roomById.get(row.roomId);
      const used = row.allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quota) || 0), 0);
      if (used > (Number(room?.capacity) || 0)) {
        return (room?.name || 'A room') + ' is over capacity by ' + (used - (Number(room?.capacity) || 0)) + '.';
      }

      const positive = row.allocations.filter(a => Number(a.quota) > 0);
      const duplicateClasses = new Set<string>();
      for (const allocation of positive) {
        if (!classById.has(allocation.classId)) return 'A room contains an invalid or inactive class.';
        if (duplicateClasses.has(allocation.classId)) return 'The same class cannot appear twice in one room.';
        duplicateClasses.add(allocation.classId);
      }

      const distinctGrades = new Set(positive.map(a => {
        const cls = classById.get(a.classId);
        return cls ? gradeKeyOf(cls) : '';
      }).filter(Boolean));

      if (positive.length > 0 && activeClasses.length > 1 && distinctGrades.size < 2) {
        return (room?.name || 'A room') + ' must contain at least 2 different grades.';
      }
    }

    for (const cls of activeClasses) {
      const expected = studentCounts[cls._id] || 0;
      const assigned = assignedByClass[cls._id] || 0;
      if (assigned !== expected) {
        const difference = expected - assigned;
        return classNameOf(cls) + (difference > 0
          ? ' still has ' + difference + ' unassigned student(s).'
          : ' is over-assigned by ' + Math.abs(difference) + ' student(s).');
      }
    }

    return '';
  };

  const confirmPlan = () => {
    const validationError = validatePlan();
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    const classMap = new Map<string, RoomPlanItem>();
    planRows.forEach(row => {
      row.allocations
        .filter(allocation => Number(allocation.quota) > 0)
        .forEach(allocation => {
          const existing = classMap.get(allocation.classId) || {
            classId: allocation.classId,
            roomIds: [],
            quotas: [],
          };
          if (!existing.roomIds.includes(row.roomId)) existing.roomIds.push(row.roomId);
          existing.quotas.push({ roomId: row.roomId, count: Math.max(0, Number(allocation.quota) || 0) });
          classMap.set(allocation.classId, existing);
        });
    });

    const roomPlan = Array.from(classMap.values());
    const roomIds = Array.from(new Set(roomPlan.flatMap(item => item.roomIds)));
    const classIds = roomPlan.map(item => item.classId);

    onGenerate({
      academicYear: year,
      examType: type,
      classIds,
      roomIds,
      roomPlan,
    });
  };

  const classSummary = activeClasses.map(cls => {
    const expected = studentCounts[cls._id] || 0;
    const assigned = assignedByClass[cls._id] || 0;
    return {
      cls,
      expected,
      assigned,
      remaining: expected - assigned,
    };
  });

  const currentPlanError = planRows.some(row => {
    const room = roomById.get(row.roomId);
    const used = row.allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quota) || 0), 0);
    return used > (Number(room?.capacity) || 0);
  });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className={card + ' p-4 sm:p-5'}>
          <div className="grid gap-4 md:grid-cols-2">
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
          </div>
        </div>

        <div className={card + ' border-primary-100 bg-primary-50/40 p-4 sm:p-5 dark:border-primary-900/40 dark:bg-primary-950/10'}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary-100 p-2.5 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              <Building2 size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Available Rooms</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <span className="text-3xl font-bold">{sortedRooms.length}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{totalRoomCapacity} seats</span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{activeStudentTotal} active students to place.</p>
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
            <h2 className="text-lg font-bold">Smart Mixed-Grade Room Plan</h2>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">Generate the mix, edit any Grade / Class or quota, then confirm the exact plan.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={generateSmartPlan} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white">
              <Zap size={16} />
              Generate Smart Mixed Plan
            </button>
            <button
              type="button"
              onClick={confirmPlan}
              disabled={!planRows.some(row => row.allocations.length > 0) || currentPlanError}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={16} />
              Confirm Plan
            </button>
          </div>
        </div>

        {sortedRooms.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-text-tertiary)]">No rooms are available. Add rooms through Class Management first.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-[var(--color-surface-secondary)]">
                <tr>
                  <th className="px-4 py-3 text-left">Room</th>
                  <th className="px-4 py-3 text-left">Capacity</th>
                  <th className="px-4 py-3 text-left">Grade / Class &amp; Quota</th>
                  <th className="px-4 py-3 text-left">Used</th>
                  <th className="px-4 py-3 text-left">Available</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedRooms.map(room => {
                  const row = rowOf(room._id);
                  const positiveAllocations = row.allocations.filter(allocation => Number(allocation.quota) > 0);
                  const used = positiveAllocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quota) || 0), 0);
                  const available = Number(room.capacity) - used;
                  const distinctGrades = new Set(positiveAllocations.map(allocation => {
                    const cls = classById.get(allocation.classId);
                    return cls ? gradeKeyOf(cls) : '';
                  }).filter(Boolean));

                  let statusLabel = 'Unused';
                  let statusClass = 'bg-slate-100 text-slate-600';
                  if (used > Number(room.capacity)) {
                    statusLabel = 'Over Capacity';
                    statusClass = 'bg-red-100 text-red-700';
                  } else if (used > 0 && distinctGrades.size < 2 && activeClasses.length > 1) {
                    statusLabel = 'Single Grade';
                    statusClass = 'bg-amber-100 text-amber-700';
                  } else if (used > 0 && available > 0) {
                    statusLabel = available + ' Space Left · ' + distinctGrades.size + ' Grades';
                    statusClass = 'bg-blue-100 text-blue-700';
                  } else if (used > 0) {
                    statusLabel = 'Full · ' + distinctGrades.size + ' Grades';
                    statusClass = 'bg-emerald-100 text-emerald-700';
                  }

                  return (
                    <tr key={room._id} className="border-t align-top">
                      <td className="px-4 py-4">
                        <p className="font-bold">{room.name}</p>
                        <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{room.building || 'Main'}</p>
                      </td>
                      <td className="px-4 py-4 text-lg font-bold">{room.capacity}</td>
                      <td className="px-4 py-4">
                        <div className="min-w-[430px] overflow-hidden rounded-xl border">
                          <div className="grid grid-cols-[1fr_110px_40px] bg-[var(--color-surface-secondary)] px-2 py-2 text-[11px] font-bold uppercase text-[var(--color-text-tertiary)]">
                            <span>Grade / Class</span>
                            <span>Quota</span>
                            <span />
                          </div>
                          {row.allocations.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-[var(--color-text-tertiary)]">No grade assigned to this room.</div>
                          ) : row.allocations.map((allocation, index) => {
                            const selectedClass = classById.get(allocation.classId);
                            return (
                              <div key={room._id + '-' + index} className="grid grid-cols-[1fr_110px_40px] items-center gap-2 border-t p-2">
                                <select
                                  value={allocation.classId}
                                  onChange={e => updateAllocation(room._id, index, { classId: e.target.value })}
                                  className="min-w-0 rounded-lg border bg-[var(--color-surface-primary)] px-2.5 py-2 text-sm"
                                >
                                  {activeClasses.map(cls => (
                                    <option key={cls._id} value={cls._id}>
                                      {gradeLabelOf(cls)} · {classNameOf(cls)} · {studentCounts[cls._id] || 0} students
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min={1}
                                  max={Math.max(1, studentCounts[allocation.classId] || 1)}
                                  value={allocation.quota}
                                  onChange={e => updateAllocation(room._id, index, { quota: Math.max(0, Number(e.target.value) || 0) })}
                                  className="w-full rounded-lg border bg-[var(--color-surface-primary)] px-2.5 py-2 text-center font-bold"
                                  aria-label={(selectedClass ? classNameOf(selectedClass) : 'Class') + ' quota'}
                                />
                                <button type="button" onClick={() => removeAllocation(room._id, index)} className="rounded-lg border p-2 text-red-600" title="Remove from room">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            );
                          })}
                          {row.allocations.length < 3 && activeClasses.length > row.allocations.length && (
                            <button type="button" onClick={() => addAllocation(room._id)} className="flex w-full items-center justify-center gap-1.5 border-t px-3 py-2 text-xs font-semibold text-primary-600 hover:bg-[var(--color-surface-secondary)]">
                              <Plus size={14} />
                              Add Grade / Class
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-lg font-bold">{used}</td>
                      <td className={'px-4 py-4 text-lg font-bold ' + (available < 0 ? 'text-red-600' : 'text-emerald-600')}>
                        {available}
                      </td>
                      <td className="px-4 py-4">
                        <span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-bold ' + statusClass}>{statusLabel}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className={card + ' p-4 sm:p-5'}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">Grade / Class Check</h3>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Every active student must be included exactly once in the plan.</p>
            </div>
            <Users size={18} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {classSummary.map(item => (
              <div key={item.cls._id} className="rounded-xl bg-[var(--color-surface-secondary)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{classNameOf(item.cls)}</p>
                  <span className={'text-xs font-bold ' + (item.remaining === 0 ? 'text-emerald-600' : item.remaining > 0 ? 'text-amber-600' : 'text-red-600')}>
                    {item.assigned}/{item.expected}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  {item.remaining === 0 ? 'Complete' : item.remaining > 0 ? item.remaining + ' remaining' : Math.abs(item.remaining) + ' over-assigned'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className={card + ' p-4 sm:p-5'}>
          <h3 className="font-bold">Plan Summary</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Active Students</span><b>{activeStudentTotal}</b></div>
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Assigned in Plan</span><b>{assignedTotal}</b></div>
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Rooms Used</span><b>{usedRoomCount}</b></div>
            <div className="flex justify-between gap-3"><span className="text-[var(--color-text-tertiary)]">Used-Room Capacity</span><b>{usedCapacity}</b></div>
            <div className="flex justify-between gap-3 border-t pt-3">
              <span className="text-[var(--color-text-tertiary)]">Unassigned</span>
              <b className={activeStudentTotal - assignedTotal === 0 ? 'text-emerald-600' : 'text-amber-600'}>{activeStudentTotal - assignedTotal}</b>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-3 text-xs text-primary-800 dark:border-primary-900/40 dark:bg-primary-950/20 dark:text-primary-200">
        Smart plan prefers 3 different grade numbers per room. If that is not possible, it uses 2. A single-grade room is flagged before confirmation.
      </div>

      {activeClasses.some(cls => departmentNameOf(cls)) && (
        <p className="text-xs text-[var(--color-text-tertiary)]">Department labels remain visible in Class Management; room mixing here is based on Grade number, not Primary/Secondary department.</p>
      )}
    </div>
  );
}

export default PlanRoomsPanel;
