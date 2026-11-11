import School from '../models/school.model';

export interface ExamShiftRule {
  name: string;
  startTime: string;
  endTime: string;
}

export interface DepartmentShiftAssignment {
  departmentId: string;
  shiftIndexes: number[];
}

export interface ClassShiftAssignment {
  classId: string;
  shiftIndexes: number[];
}

export interface ExamSchedulingRules {
  departmentShiftAssignments: DepartmentShiftAssignment[];
  classShiftAssignments: ClassShiftAssignment[];
  preventClassOverlap: boolean;
  allowSharedRooms: boolean;
  roomCapacityCheck: boolean;
  maxExamsPerClassPerDay: number;
  minimumGapMinutes: number;
  durationValidation: boolean;
  examShiftCount: number;
  examShifts: ExamShiftRule[];
  allowedExamDays: number[];
}

export const DEFAULT_EXAM_SHIFTS: ExamShiftRule[] = [
  { name: 'Shift 1', startTime: '08:00', endTime: '10:00' },
  { name: 'Shift 2', startTime: '10:30', endTime: '12:30' },
  { name: 'Shift 3', startTime: '13:30', endTime: '15:30' },
  { name: 'Shift 4', startTime: '16:00', endTime: '18:00' },
];

export const DEFAULT_EXAM_SCHEDULING_RULES: ExamSchedulingRules = {
  departmentShiftAssignments: [],
  classShiftAssignments: [],
  preventClassOverlap: true,
  allowSharedRooms: true,
  roomCapacityCheck: true,
  maxExamsPerClassPerDay: 1,
  minimumGapMinutes: 30,
  durationValidation: true,
  examShiftCount: 2,
  examShifts: DEFAULT_EXAM_SHIFTS.slice(0, 2).map((shift) => ({ ...shift })),
  // JavaScript UTC weekday numbers: 0=Sunday ... 6=Saturday.
  // Default keeps existing behaviour: exams may be scheduled on any day until
  // an institution explicitly restricts the allowed days in Scheduling Rules.
  allowedExamDays: [0, 1, 2, 3, 4, 5, 6],
};

const isValidClockTime = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

export function normalizeExamSchedulingRules(value: any): ExamSchedulingRules {
  const examShiftCount = Number.isFinite(Number(value?.examShiftCount))
    ? Math.min(4, Math.max(1, Math.trunc(Number(value.examShiftCount))))
    : DEFAULT_EXAM_SCHEDULING_RULES.examShiftCount;

  const incomingShifts = Array.isArray(value?.examShifts) ? value.examShifts : [];
  const examShifts = Array.from({ length: examShiftCount }, (_, index) => {
    const incoming = incomingShifts[index] || {};
    const fallback = DEFAULT_EXAM_SHIFTS[index] || {
      name: `Shift ${index + 1}`,
      startTime: '08:00',
      endTime: '10:00',
    };
    return {
      name: typeof incoming.name === 'string' && incoming.name.trim()
        ? incoming.name.trim().slice(0, 40)
        : fallback.name,
      startTime: isValidClockTime(incoming.startTime) ? incoming.startTime : fallback.startTime,
      endTime: isValidClockTime(incoming.endTime) ? incoming.endTime : fallback.endTime,
    };
  });

  const normalizedAllowedExamDays: number[] = Array.isArray(value?.allowedExamDays)
    ? value.allowedExamDays
        .map((day: unknown): number => Number(day))
        .filter((day: number): boolean => Number.isInteger(day) && day >= 0 && day <= 6)
    : [...DEFAULT_EXAM_SCHEDULING_RULES.allowedExamDays];

  const allowedExamDays: number[] = Array.from(new Set<number>(normalizedAllowedExamDays))
    .sort((a: number, b: number) => a - b);

  const classShiftAssignments = Array.isArray(value?.classShiftAssignments)
    ? value.classShiftAssignments
        .filter((item: any) => item && typeof item.classId === 'string' && item.classId.trim())
        .map((item: any) => ({
          classId: item.classId.trim().slice(0, 64),
          shiftIndexes: Array.from(new Set<number>(
            (Array.isArray(item.shiftIndexes) ? item.shiftIndexes : [])
              .map((index: unknown) => Number(index))
              .filter((index: number) => Number.isInteger(index) && index >= 0 && index < examShiftCount)
          )).sort((a, b) => a - b),
        }))
    : [];

  const departmentShiftAssignments = Array.isArray(value?.departmentShiftAssignments)
    ? value.departmentShiftAssignments
        .filter((item: any) => item && typeof item.departmentId === 'string' && item.departmentId.trim())
        .map((item: any) => ({
          departmentId: item.departmentId.trim().slice(0, 64),
          shiftIndexes: Array.from(new Set<number>(
            (Array.isArray(item.shiftIndexes) ? item.shiftIndexes : [])
              .map((index: unknown) => Number(index))
              .filter((index: number) => Number.isInteger(index) && index >= 0 && index < examShiftCount)
          )).sort((a, b) => a - b),
        }))
    : [];

  return {
    departmentShiftAssignments,
    classShiftAssignments,
    preventClassOverlap: typeof value?.preventClassOverlap === 'boolean'
      ? value.preventClassOverlap
      : DEFAULT_EXAM_SCHEDULING_RULES.preventClassOverlap,
    allowSharedRooms: typeof value?.allowSharedRooms === 'boolean'
      ? value.allowSharedRooms
      : DEFAULT_EXAM_SCHEDULING_RULES.allowSharedRooms,
    roomCapacityCheck: typeof value?.roomCapacityCheck === 'boolean'
      ? value.roomCapacityCheck
      : DEFAULT_EXAM_SCHEDULING_RULES.roomCapacityCheck,
    maxExamsPerClassPerDay: Number.isFinite(Number(value?.maxExamsPerClassPerDay))
      ? Math.min(10, Math.max(1, Math.trunc(Number(value.maxExamsPerClassPerDay))))
      : DEFAULT_EXAM_SCHEDULING_RULES.maxExamsPerClassPerDay,
    minimumGapMinutes: Number.isFinite(Number(value?.minimumGapMinutes))
      ? Math.min(1440, Math.max(0, Math.trunc(Number(value.minimumGapMinutes))))
      : DEFAULT_EXAM_SCHEDULING_RULES.minimumGapMinutes,
    durationValidation: typeof value?.durationValidation === 'boolean'
      ? value.durationValidation
      : DEFAULT_EXAM_SCHEDULING_RULES.durationValidation,
    examShiftCount,
    examShifts,
    allowedExamDays,
  };
}

export async function getExamSchedulingRulesForSchool(schoolId: unknown): Promise<ExamSchedulingRules> {
  if (!schoolId) return { ...DEFAULT_EXAM_SCHEDULING_RULES };
  const school = await School.findById(schoolId).select('examSchedulingRules').lean() as any;
  return normalizeExamSchedulingRules(school?.examSchedulingRules);
}

export interface ClassShiftResolution {
  /** Shift indexes (into rules.examShifts) this class may sit exams in. */
  allowed: number[];
  /** Set when Department Shift Assignment is configured but this class cannot use it. */
  error?: string;
}

/**
 * Resolve a class's exam shifts. Class-level assignments take precedence;
 * older department-level assignments remain supported as a backward-compatible
 * default for classes without an explicit class assignment.
 */
export function resolveClassShiftIndexes(
  rules: ExamSchedulingRules,
  cls: { _id?: unknown; title?: string; section?: string; department?: unknown } | null | undefined,
): ClassShiftResolution {
  const all = rules.examShifts.map((_shift, index) => index);
  const classId = String(cls?._id || '');
  const label = `${cls?.title || classId || 'Unknown'}${cls?.section ? ` - ${cls.section}` : ''}`;

  if (classId && rules.classShiftAssignments.length) {
    const classAssignment = rules.classShiftAssignments.find((item) => String(item.classId) === classId);
    if (classAssignment) {
      // An empty/invalid class assignment is not allowed to reduce capacity
      // or silently remove the class from planning; use every shift safely.
      if (!classAssignment.shiftIndexes.length) return { allowed: all };
      return { allowed: [...classAssignment.shiftIndexes] };
    }
  }

  if (!rules.departmentShiftAssignments.length) return { allowed: all };

  const rawDepartment = cls?.department as any;
  const departmentId = String(rawDepartment?._id || rawDepartment || '');
  if (!departmentId) {
    return {
      allowed: [],
      error: `Class "${label}" has no department, but Department Shift Assignment is configured. Assign the class to a department in Classes.`,
    };
  }

  const assignment = rules.departmentShiftAssignments.find((item) => String(item.departmentId) === departmentId);
  if (!assignment) {
    return {
      allowed: [],
      error: `The department of class "${label}" has no exam shifts in Department Shift Assignment. Select its shifts in Scheduling Rules.`,
    };
  }
  if (!assignment.shiftIndexes.length) {
    return {
      allowed: [],
      error: `The department of class "${label}" has no allowed exam shifts. Select its shifts in Scheduling Rules.`,
    };
  }
  return { allowed: [...assignment.shiftIndexes] };
}

/** Human-readable list of shift names for an error message, e.g. "Shift 3, Shift 4". */
export function describeShiftIndexes(rules: ExamSchedulingRules, indexes: number[]): string {
  return indexes.map((index) => rules.examShifts[index]?.name || `Shift ${index + 1}`).join(', ');
}
