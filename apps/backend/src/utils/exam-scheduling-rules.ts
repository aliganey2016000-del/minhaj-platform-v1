import School from '../models/school.model';

export interface ExamShiftRule {
  name: string;
  startTime: string;
  endTime: string;
}

export interface ExamSchedulingRules {
  preventClassOverlap: boolean;
  allowSharedRooms: boolean;
  roomCapacityCheck: boolean;
  maxExamsPerClassPerDay: number;
  minimumGapMinutes: number;
  durationValidation: boolean;
  examShiftCount: number;
  examShifts: ExamShiftRule[];
}

export const DEFAULT_EXAM_SHIFTS: ExamShiftRule[] = [
  { name: 'Shift 1', startTime: '08:00', endTime: '10:00' },
  { name: 'Shift 2', startTime: '10:30', endTime: '12:30' },
  { name: 'Shift 3', startTime: '13:30', endTime: '15:30' },
  { name: 'Shift 4', startTime: '16:00', endTime: '18:00' },
];

export const DEFAULT_EXAM_SCHEDULING_RULES: ExamSchedulingRules = {
  preventClassOverlap: true,
  allowSharedRooms: true,
  roomCapacityCheck: true,
  maxExamsPerClassPerDay: 1,
  minimumGapMinutes: 30,
  durationValidation: true,
  examShiftCount: 2,
  examShifts: DEFAULT_EXAM_SHIFTS.slice(0, 2).map((shift) => ({ ...shift })),
};

const isValidClockTime = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\\d{2}:\\d{2}$/.test(value)) return false;
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

  return {
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
  };
}

export async function getExamSchedulingRulesForSchool(schoolId: unknown): Promise<ExamSchedulingRules> {
  if (!schoolId) return { ...DEFAULT_EXAM_SCHEDULING_RULES };
  const school = await School.findById(schoolId).select('examSchedulingRules').lean() as any;
  return normalizeExamSchedulingRules(school?.examSchedulingRules);
}
