import { useMemo } from 'react';

export type ImportedRoomAssignment = {
  _id: string;
  room?: { _id: string; name: string; building?: string; capacity?: number };
  student?: {
    studentId?: string;
    profile?: { firstName?: string; lastName?: string };
    department?: string;
    className?: string;
    shift?: string;
  };
};

type Props = {
  tab: 'plan' | 'room' | 'class';
  assignments: ImportedRoomAssignment[];
  rooms: Array<{ _id: string; name: string; building?: string; capacity: number }>;
  classTotals?: Record<string, number>;
};

const classLabel = (row: ImportedRoomAssignment) => row.student?.className?.trim() || 'Unclassified';
const departmentLabel = (row: ImportedRoomAssignment) => row.student?.department?.trim() || 'Unassigned department';
const shiftLabels = (raw?: string) => {
  const value = String(raw || '').trim();
  if (!value) return ['Unspecified shift'];
  return value.split(/[;,|]/).map(item => item.trim()).filter(Boolean).map(item =>
    /^\d+$/.test(item) ? 'Shift ' + item : /^shift\s*/i.test(item) ? item.replace(/^shift\s*/i, 'Shift ') : item
  );
};

export function ImportedRoomPlanReports({ tab, assignments, rooms, classTotals = {} }: Props) {
  const roomRows = useMemo(() => rooms.map(room => {
    const rows = assignments.filter(item => item.room?._id === room._id);
    const byShift = new Map<string, number>();
    const byClass = new Map<string, number>();
    rows.forEach(row => {
      shiftLabels(row.student?.shift).forEach(shift => byShift.set(shift, (byShift.get(shift) || 0) + 1));
      const label = classLabel(row);
      byClass.set(label, (byClass.get(label) || 0) + 1);
    });
    const peak = Math.max(0, ...byShift.values());
    return { room, rows, byShift, byClass, peak, free: Number(room.capacity || 0) - peak };
  }).filter(item => item.rows.length > 0), [assignments, rooms]);

  const allShifts = useMemo(() => Array.from(new Set(
    assignments.flatMap(row => shiftLabels(row.student?.shift))
  )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [assignments]);

  const classRows = useMemo(() => {
    const map = new Map<string, { department: string; shifts: Set<string>; rooms: Map<string, number>; rows: ImportedRoomAssignment[] }>();
    assignments.forEach(row => {
      const label = classLabel(row);
      const item = map.get(label) || { department: departmentLabel(row), shifts: new Set<string>(), rooms: new Map<string, number>(), rows: [] };
      shiftLabels(row.student?.shift).forEach(shift => item.shifts.add(shift));
      const roomName = row.room?.name || 'Room not found';
      item.rooms.set(roomName, (item.rooms.get(roomName) || 0) + 1);
      item.rows.push(row);
      map.set(label, item);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([name, value]) => ({ name, ...value }));
  }, [assignments]);

  if (tab === 'plan') return (
    <div className="overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div><p className="font-bold">Imported Room Plan</p><p className="text-xs text-[var(--color-text-tertiary)]">{assignments.length} imported student assignments · occupancy uses peak simultaneous shift</p></div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{roomRows.length} rooms used</span>
      </div>
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-[var(--color-surface-secondary)]"><tr>
          <th className="px-4 py-3 text-left">Room</th><th className="px-4 py-3 text-left">Capacity</th>
          {allShifts.map(shift => <th key={shift} className="px-4 py-3 text-left">{shift}</th>)}
          <th className="px-4 py-3 text-left">Seats Needed</th><th className="px-4 py-3 text-left">Seat Balance</th>
        </tr></thead>
        <tbody>{roomRows.map(({ room, byShift, peak, free, byClass }) => (
          <tr key={room._id} className="border-t align-top">
            <td className="px-4 py-3"><p className="font-bold">{room.name}</p><p className="text-xs text-[var(--color-text-tertiary)]">{room.building || 'Main'}</p><p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">{Array.from(byClass.entries()).map(([name,count]) => name + ': ' + count).join(' · ')}</p></td>
            <td className="px-4 py-3 font-bold">{room.capacity}</td>
            {allShifts.map(shift => <td key={shift} className="px-4 py-3">{byShift.get(shift) || '—'}</td>)}
            <td className="px-4 py-3 font-bold">{peak}</td>
            <td className="px-4 py-3">{free > 0 ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{free} Free</span> : free === 0 ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">Full</span> : <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{Math.abs(free)} Over</span>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );

  if (tab === 'room') return (
    <div className="overflow-x-auto">
      <div className="border-b px-4 py-3"><p className="font-bold">Imported Room Resolution</p><p className="text-xs text-[var(--color-text-tertiary)]">Room → shift → department/class → assigned students</p></div>
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-[var(--color-surface-secondary)]"><tr><th className="px-4 py-3 text-left">Room</th><th className="px-4 py-3 text-left">Shift</th><th className="px-4 py-3 text-left">Department</th><th className="px-4 py-3 text-left">Class</th><th className="px-4 py-3 text-left">Students</th><th className="px-4 py-3 text-left">Student IDs</th></tr></thead>
        <tbody>{roomRows.flatMap(({room,rows}) => {
          const groups = new Map<string, ImportedRoomAssignment[]>();
          rows.forEach(row => shiftLabels(row.student?.shift).forEach(shift => {
            const key = [shift, departmentLabel(row), classLabel(row)].join('::');
            const group = groups.get(key) || [];
            if (!group.some(item => item._id === row._id)) group.push(row);
            groups.set(key, group);
          }));
          return Array.from(groups.entries()).map(([key,group]) => {
            const [shift,department,cls] = key.split('::');
            return <tr key={room._id + key} className="border-t"><td className="px-4 py-3 font-bold">{room.name}</td><td className="px-4 py-3">{shift}</td><td className="px-4 py-3">{department}</td><td className="px-4 py-3">{cls}</td><td className="px-4 py-3 font-bold">{group.length}</td><td className="px-4 py-3 text-xs">{group.map(item => item.student?.studentId || '—').join(', ')}</td></tr>;
          });
        })}</tbody>
      </table>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <div className="border-b px-4 py-3"><p className="font-bold">Imported Class Resolution</p><p className="text-xs text-[var(--color-text-tertiary)]">Class → shift → room distribution</p></div>
      <table className="w-full min-w-[850px] text-sm">
        <thead className="bg-[var(--color-surface-secondary)]"><tr><th className="px-4 py-3 text-left">Department</th><th className="px-4 py-3 text-left">Class</th><th className="px-4 py-3 text-left">Shift(s)</th><th className="px-4 py-3 text-left">Assigned / Total</th><th className="px-4 py-3 text-left">Room Allocation</th></tr></thead>
        <tbody>{classRows.map(item => <tr key={item.name} className="border-t align-top"><td className="px-4 py-3">{item.department}</td><td className="px-4 py-3 font-bold">{item.name}</td><td className="px-4 py-3">{Array.from(item.shifts).join(', ')}</td><td className="px-4 py-3 font-bold">{item.rows.length}/{Math.max(item.rows.length, Number(classTotals[item.name]) || 0)}</td><td className="px-4 py-3">{Array.from(item.rooms.entries()).map(([room,count]) => <span key={room} className="mr-2 mb-1 inline-flex rounded-lg bg-[var(--color-surface-secondary)] px-2.5 py-1 text-xs font-semibold">{room}: {count}</span>)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
