import { Request, Response } from 'express';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import {
  DEFAULT_EXAM_ROOM_PLAN_SETTINGS,
  normalizeExamRoomPlanSettings,
} from '../utils/exam-room-plan-settings';

const objectIdPattern = /^[a-f\d]{24}$/i;

function roomPlanSchoolId(req: Request): string {
  const ownOrg = req.user?.role === 'org_admin'
    ? String((req.user as any)?.organizationId?._id || (req.user as any)?.organizationId || '')
    : '';
  const requested = String(req.body?.school || req.query?.school || '');
  const schoolId = ownOrg || requested;

  if (!objectIdPattern.test(schoolId)) {
    throw new BadRequestError('A valid Organization is required');
  }
  return schoolId;
}

export const getSettings = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = roomPlanSchoolId(req);
  const school = await School.findById(schoolId).select('name examRoomPlanSettings').lean() as any;
  if (!school) throw new NotFoundError('Organization');

  return ApiResponse.success(res, {
    school: { _id: school._id, name: school.name },
    settings: normalizeExamRoomPlanSettings(school.examRoomPlanSettings),
    defaults: DEFAULT_EXAM_ROOM_PLAN_SETTINGS,
  });
};

export const updateSettings = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = roomPlanSchoolId(req);
  const school = await School.findById(schoolId);
  if (!school) throw new NotFoundError('Organization');

  const current = normalizeExamRoomPlanSettings((school as any).examRoomPlanSettings);
  const incoming = req.body?.settings || {};
  const next = normalizeExamRoomPlanSettings({ ...current, ...incoming });

  if (next.minSplitPortion > next.maxClassPortion) {
    throw new BadRequestError('Minimum Split Portion cannot exceed Max Class Portion');
  }
  if (next.minimumGradesPerRoom > next.preferredGradesPerRoom) {
    throw new BadRequestError('Minimum Grades per Room cannot exceed Preferred Grades per Room');
  }

  (school as any).examRoomPlanSettings = next;
  await school.save();

  return ApiResponse.success(res, {
    school: { _id: school._id, name: school.name },
    settings: next,
    defaults: DEFAULT_EXAM_ROOM_PLAN_SETTINGS,
  }, 'Room Plan settings saved');
};
