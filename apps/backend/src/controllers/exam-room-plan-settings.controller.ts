import { Request, Response } from 'express';
import School from '../models/school.model';
import Student from '../models/student.model';
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


export const getPlanningStudents = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = roomPlanSchoolId(req);
  const rawClassIds = String(req.query?.classIds || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const classIds = rawClassIds.filter((id) => objectIdPattern.test(id));

  const filter: Record<string, unknown> = {
    school: schoolId,
    status: 'active',
  };
  if (classIds.length) filter.class = { $in: classIds };

  const students = await Student.find(filter)
    .select('_id studentId profile class')
    .populate('profile', 'firstName lastName')
    .populate('class', 'title section gradeLevel')
    .sort({ studentId: 1 })
    .lean() as any[];

  return ApiResponse.success(res, students.map((student) => ({
    _id: String(student._id),
    studentId: String(student.studentId || ''),
    name: [student.profile?.firstName, student.profile?.lastName].filter(Boolean).join(' ').trim(),
    classId: String(student.class?._id || student.class || ''),
    className: [student.class?.title, student.class?.section].filter(Boolean).join(' ').trim(),
    gradeLevel: Number.isFinite(Number(student.class?.gradeLevel)) ? Number(student.class.gradeLevel) : null,
  })));
};
