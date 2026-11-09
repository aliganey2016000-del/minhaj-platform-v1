/**
 * Shift-aware room capacity for exam seating.
 *
 * With Department Shift Assignment, departments sit their papers in different
 * exam shifts (e.g. Primary in Shift 1-2, Secondary in Shift 3-4). Students who
 * never sit at the same time can share the same rooms and seats, so a room's
 * capacity is checked per shift: the load of a room in a shift is the number of
 * its students whose class sits in that shift. Departments whose shifts overlap
 * are counted together in the shared shift, so they can never be double-booked.
 *
 * Without Department Shift Assignment every class sits in every shift, which
 * reduces to the old rule: one seat per student across the whole room.
 */
import { ExamSchedulingRules, resolveClassShiftIndexes } from './exam-scheduling-rules';

/** Exam shift indexes a class sits in. Unconfigured or invalid classes are treated as sitting in every shift (the safe, never-overbooking choice). */
export function classShiftIndexes(
  rules: ExamSchedulingRules,
  cls: { _id?: unknown; title?: string; section?: string; department?: unknown } | null | undefined,
): number[] {
  const all = rules.examShifts.map((_shift, index) => index);
  if (!all.length) return [0];
  const resolved = resolveClassShiftIndexes(rules, cls);
  return resolved.error || !resolved.allowed.length ? all : resolved.allowed;
}

/** Stable key for a set of shift indexes, e.g. [2, 3] -> "2,3". */
export const shiftSetKey = (shifts: number[]) => shifts.slice().sort((a, b) => a - b).join(',');

/** Per-room, per-shift student counts. */
export class ShiftRoomLoad {
  private readonly loads = new Map<string, Map<number, number>>();

  add(roomId: string, shifts: number[], count = 1): void {
    const id = String(roomId);
    const perShift = this.loads.get(id) || new Map<number, number>();
    for (const shift of shifts) perShift.set(shift, (perShift.get(shift) || 0) + count);
    this.loads.set(id, perShift);
  }

  /** Busiest of the given shifts in this room — what a class sitting in `shifts` would share the room with. */
  loadFor(roomId: string, shifts: number[]): number {
    const perShift = this.loads.get(String(roomId));
    if (!perShift) return 0;
    return shifts.reduce((max, shift) => Math.max(max, perShift.get(shift) || 0), 0);
  }

  /** Busiest shift in this room — the number of seats the room must really have. */
  peak(roomId: string): number {
    const perShift = this.loads.get(String(roomId));
    if (!perShift) return 0;
    return Math.max(0, ...perShift.values());
  }

  clone(): ShiftRoomLoad {
    const copy = new ShiftRoomLoad();
    for (const [roomId, perShift] of this.loads) copy.loads.set(roomId, new Map(perShift));
    return copy;
  }
}

/** Seats needed school-wide: the number of students sitting in the busiest shift. */
export function peakShiftDemand(groups: Array<{ shifts: number[]; count: number }>): number {
  const perShift = new Map<number, number>();
  for (const group of groups) {
    for (const shift of group.shifts) perShift.set(shift, (perShift.get(shift) || 0) + group.count);
  }
  return Math.max(0, ...perShift.values());
}

/**
 * Shift-aware load of saved master-seating rows. `filter` scopes the rows
 * (school / academic year / exam type / room); each row's student class is
 * resolved to the exam shifts it sits in.
 */
export async function savedSeatingShiftLoad(
  rules: ExamSchedulingRules,
  filter: Record<string, unknown>,
): Promise<ShiftRoomLoad> {
  const { default: ExamSeatingPlan } = await import('../models/exam-seating-plan.model');
  const rows = await ExamSeatingPlan.find(filter)
    .select('room student')
    .populate({ path: 'student', select: 'class', populate: { path: 'class', select: 'title section department' } })
    .lean() as any[];
  const load = new ShiftRoomLoad();
  for (const row of rows) {
    load.add(String(row.room), classShiftIndexes(rules, row.student?.class || null), 1);
  }
  return load;
}
