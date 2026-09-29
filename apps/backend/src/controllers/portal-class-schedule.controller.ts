import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ClassSchedule from '../models/class-schedule.model';
import ApiResponse from '../utils/api-response';
import { ForbiddenError, NotFoundError } from '../utils/api-error';
import { getOwnTeacherRecord, resolveViewableOrgId } from '../utils/tenant-scope';
import { isLiveEligibleSchedule } from '../utils/schedule-live-eligibility';

/**
 * Student-facing weekly timetable. Keep this endpoint deliberately narrow:
 * the caller can only resolve the Student record attached to their own user,
 * then only currently valid active schedules for that current class are
 * returned. Historical rows remain stored for admin/audit purposes, but a
 * later class/course/teacher deactivation must not leak into the live portal.
 */
export const getMySchedules = async (req: Request, res: Response): Promise<Response> => {
  const Student = mongoose.model('Student');
  const student: any = await Student.findOne({ user: req.user!.userId }).select('class school').lean();
  if (!student) throw new NotFoundError('Student record');

  const schedules = await ClassSchedule.find({
    school: student.school,
    class: student.class,
    isActive: true,
  })
    .populate('class', 'title section status')
    .populate('course', 'title isLive status')
    .populate({
      path: 'teacher',
      select: 'profile status',
      populate: { path: 'profile', select: 'firstName lastName' },
    })
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  return ApiResponse.success(res, schedules.filter(isLiveEligibleSchedule));
};

/**
 * Teacher-facing timetable. Populating shiftMode here is important: the
 * teacher portal must display the class's configured shift instead of
 * guessing Morning/Afternoon/Evening from the clock time. Organization scope
 * comes from the authenticated JWT, not a client-controlled query value or a
 * potentially stale legacy Teacher.school field.
 */
export const getMyScheduleAsTeacher = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await getOwnTeacherRecord(req);
  if (!teacher) throw new NotFoundError('Teacher record');
  const schoolId = resolveViewableOrgId(req);
  if (!schoolId) throw new ForbiddenError('Your account is not assigned to an organization.');

  const schedules = await ClassSchedule.find({
    school: schoolId,
    teacher: teacher._id,
    isActive: true,
  })
    .populate('school', 'name')
    .populate({
      path: 'class',
      select: 'title section department shiftMode room status',
      populate: { path: 'department', select: 'name' },
    })
    .populate('course', 'title status')
    .populate({ path: 'teacher', select: 'status' })
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  const liveSchedules = schedules.filter(isLiveEligibleSchedule);
  const classIds = Array.from(new Set(
    liveSchedules
      .map((schedule: any) => String(schedule.class?._id || schedule.class || ''))
      .filter(Boolean),
  ));

  // Teacher timetable student totals come from the students currently
  // registered in the Class itself. Course enrollment is intentionally not
  // required: a student belongs to the lesson because they are an ACTIVE
  // student of that scheduled class.
  const countsByClass = new Map<string, number>();
  if (classIds.length > 0) {
    const Student = mongoose.model('Student');
    const classObjectIds = classIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const scopedSchoolId = mongoose.Types.ObjectId.isValid(String(schoolId))
      ? new mongoose.Types.ObjectId(String(schoolId))
      : schoolId;

    const rows = await Student.aggregate([
      {
        $match: {
          school: scopedSchoolId,
          class: { $in: classObjectIds },
          status: 'active',
        },
      },
      { $group: { _id: '$class', count: { $sum: 1 } } },
    ]);

    rows.forEach((row: any) => countsByClass.set(String(row._id), Number(row.count) || 0));
  }

  const result = liveSchedules.map((schedule: any) => ({
    ...schedule,
    studentCount: countsByClass.get(String(schedule.class?._id || schedule.class || '')) || 0,
  }));

  return ApiResponse.success(res, result);
};
