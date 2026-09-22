import School from '../models/school.model';

export interface ExamSchedulingRules {
  preventClassOverlap: boolean;
  allowSharedRooms: boolean;
  roomCapacityCheck: boolean;
  maxExamsPerClassPerDay: number;
  minimumGapMinutes: number;
  durationValidation: boolean;
}

export const DEFAULT_EXAM_SCHEDULING_RULES: ExamSchedulingRules = {
  preventClassOverlap: true,
  allowSharedRooms: true,
  roomCapacityCheck: true,
  maxExamsPerClassPerDay: 1,
  minimumGapMinutes: 30,
  durationValidation: true,
};

export function normalizeExamSchedulingRules(value: any): ExamSchedulingRules {
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
  };
}

export async function getExamSchedulingRulesForSchool(schoolId: unknown): Promise<ExamSchedulingRules> {
  if (!schoolId) return { ...DEFAULT_EXAM_SCHEDULING_RULES };
  const school = await School.findById(schoolId).select('examSchedulingRules').lean() as any;
  return normalizeExamSchedulingRules(school?.examSchedulingRules);
}
