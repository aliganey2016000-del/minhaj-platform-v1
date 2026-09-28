import School from '../models/school.model';

export type RoomPlanPriorityMode = 'balanced_security' | 'maximum_mixing' | 'maximum_room_usage';

export interface ExamRoomPlanSettings {
  maxClassPortion: number;
  minSplitPortion: number;
  preferredGradesPerRoom: number;
  minimumGradesPerRoom: number;
  maxSameGradeSharePercent: number;
  preferredGradeDistance: number;
  targetRoomOccupancyPercent: number;
  occupancyBalanceTolerance: number;
  smallClassThreshold: number;
  keepSmallClassesTogether: boolean;
  splitBalanceEqual: boolean;
  useMinimumRooms: boolean;
  minimumStudentsPerUsedRoom: number;
  reserveSeatsPerRoom: number;
  studentsPerInvigilator: number;
  maxInvigilatorsPerRoom: number;
  avoidSameClassSectionsTogether: boolean;
  avoidRepeatGradeMix: boolean;
  autoRepairInvalidPlan: boolean;
  priorityMode: RoomPlanPriorityMode;
}

export const DEFAULT_EXAM_ROOM_PLAN_SETTINGS: ExamRoomPlanSettings = {
  maxClassPortion: 50,
  minSplitPortion: 15,
  preferredGradesPerRoom: 3,
  minimumGradesPerRoom: 2,
  maxSameGradeSharePercent: 45,
  preferredGradeDistance: 2,
  targetRoomOccupancyPercent: 90,
  occupancyBalanceTolerance: 5,
  smallClassThreshold: 15,
  keepSmallClassesTogether: true,
  splitBalanceEqual: true,
  useMinimumRooms: true,
  minimumStudentsPerUsedRoom: 20,
  reserveSeatsPerRoom: 2,
  studentsPerInvigilator: 30,
  maxInvigilatorsPerRoom: 2,
  avoidSameClassSectionsTogether: true,
  avoidRepeatGradeMix: true,
  autoRepairInvalidPlan: true,
  priorityMode: 'balanced_security',
};

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};

const bool = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export function normalizeExamRoomPlanSettings(value: any): ExamRoomPlanSettings {
  const maxClassPortion = clampInt(
    value?.maxClassPortion,
    15,
    200,
    DEFAULT_EXAM_ROOM_PLAN_SETTINGS.maxClassPortion,
  );
  const minSplitPortion = Math.min(
    maxClassPortion,
    clampInt(
      value?.minSplitPortion,
      1,
      100,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.minSplitPortion,
    ),
  );
  const preferredGradesPerRoom = clampInt(
    value?.preferredGradesPerRoom,
    2,
    3,
    DEFAULT_EXAM_ROOM_PLAN_SETTINGS.preferredGradesPerRoom,
  );
  const minimumGradesPerRoom = Math.min(
    preferredGradesPerRoom,
    clampInt(
      value?.minimumGradesPerRoom,
      1,
      3,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.minimumGradesPerRoom,
    ),
  );

  const priorityMode: RoomPlanPriorityMode = [
    'balanced_security',
    'maximum_mixing',
    'maximum_room_usage',
  ].includes(String(value?.priorityMode))
    ? value.priorityMode
    : DEFAULT_EXAM_ROOM_PLAN_SETTINGS.priorityMode;

  return {
    maxClassPortion,
    minSplitPortion,
    preferredGradesPerRoom,
    minimumGradesPerRoom,
    maxSameGradeSharePercent: clampInt(
      value?.maxSameGradeSharePercent,
      25,
      100,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.maxSameGradeSharePercent,
    ),
    preferredGradeDistance: clampInt(
      value?.preferredGradeDistance,
      0,
      12,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.preferredGradeDistance,
    ),
    targetRoomOccupancyPercent: clampInt(
      value?.targetRoomOccupancyPercent,
      50,
      100,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.targetRoomOccupancyPercent,
    ),
    occupancyBalanceTolerance: clampInt(
      value?.occupancyBalanceTolerance,
      0,
      50,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.occupancyBalanceTolerance,
    ),
    smallClassThreshold: clampInt(
      value?.smallClassThreshold,
      1,
      Math.min(50, maxClassPortion),
      Math.min(DEFAULT_EXAM_ROOM_PLAN_SETTINGS.smallClassThreshold, maxClassPortion),
    ),
    keepSmallClassesTogether: bool(
      value?.keepSmallClassesTogether,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.keepSmallClassesTogether,
    ),
    splitBalanceEqual: bool(
      value?.splitBalanceEqual,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.splitBalanceEqual,
    ),
    useMinimumRooms: bool(
      value?.useMinimumRooms,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.useMinimumRooms,
    ),
    minimumStudentsPerUsedRoom: clampInt(
      value?.minimumStudentsPerUsedRoom,
      1,
      100,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.minimumStudentsPerUsedRoom,
    ),
    reserveSeatsPerRoom: clampInt(
      value?.reserveSeatsPerRoom,
      0,
      50,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.reserveSeatsPerRoom,
    ),
    studentsPerInvigilator: clampInt(
      value?.studentsPerInvigilator,
      1,
      100,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.studentsPerInvigilator,
    ),
    maxInvigilatorsPerRoom: clampInt(
      value?.maxInvigilatorsPerRoom,
      1,
      10,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.maxInvigilatorsPerRoom,
    ),
    avoidSameClassSectionsTogether: bool(
      value?.avoidSameClassSectionsTogether,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.avoidSameClassSectionsTogether,
    ),
    avoidRepeatGradeMix: bool(
      value?.avoidRepeatGradeMix,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.avoidRepeatGradeMix,
    ),
    autoRepairInvalidPlan: bool(
      value?.autoRepairInvalidPlan,
      DEFAULT_EXAM_ROOM_PLAN_SETTINGS.autoRepairInvalidPlan,
    ),
    priorityMode,
  };
}

export function getEffectiveRoomCapacity(
  physicalCapacity: unknown,
  settings: ExamRoomPlanSettings,
): number {
  const physical = Math.max(0, Math.trunc(Number(physicalCapacity) || 0));
  if (physical <= 0) return 0;
  const afterReserve = Math.max(1, physical - Math.min(settings.reserveSeatsPerRoom, Math.max(0, physical - 1)));
  const invigilatorCapacity = Math.max(1, settings.studentsPerInvigilator * settings.maxInvigilatorsPerRoom);
  return Math.max(1, Math.min(afterReserve, invigilatorCapacity));
}

export async function getExamRoomPlanSettingsForSchool(schoolId: unknown): Promise<ExamRoomPlanSettings> {
  if (!schoolId) return { ...DEFAULT_EXAM_ROOM_PLAN_SETTINGS };
  const school = await School.findById(schoolId).select('examRoomPlanSettings').lean() as any;
  return normalizeExamRoomPlanSettings(school?.examRoomPlanSettings);
}
