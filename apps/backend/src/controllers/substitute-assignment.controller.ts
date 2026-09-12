import mongoose from 'mongoose';
import { Request, Response } from 'express';
import SubstituteAssignment from '../models/substitute-assignment.model';
import ClassSchedule from '../models/class-schedule.model';
import Teacher from '../models/teacher.model';
import User from '../models/user.model';
import School, { resolveInstitutionType } from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { resolveViewableOrgId } from '../utils/tenant-scope';

function dateOnly(raw: unknown): Date {
  const value = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestError('Date must use YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new BadRequestError('A valid date is required.');
  date.setHours(0, 0, 0, 0);
  return date;
}

async function schoolContext(req: Request) {
  const id = resolveViewableOrgId(req, req.query.school ?? req.body?.school);
  if (!id || !mongoose.isValidObjectId(id)) throw new BadRequestError('School is required.');
  const school: any = await School.findById(id).select('_id institutionType organizationType').lean();
  if (!school) throw new NotFoundError('School');
  if (resolveInstitutionType(school) !== 'school') throw new BadRequestError('Substitute attendance assignments are available only for schools.');
  return String(school._id);
}

async function resolveTeacher(schoolId: string, raw: unknown) {
  const value = String(raw || '').trim();
  if (!value) throw new BadRequestError('Substitute teacher is required.');

  if (mongoose.isValidObjectId(value)) {
    const teacher = await Teacher.findOne({ _id: value, school: schoolId, status: 'active' }).select('_id teacherId user').lean();
    if (teacher) return teacher;
  }

  const byTeacherId = await Teacher.findOne({ school: schoolId, teacherId: value, status: 'active' }).select('_id teacherId user').lean();
  if (byTeacherId) return byTeacherId;

  if (value.includes('@')) {
    const user = await User.findOne({ email: value.toLowerCase(), role: 'teacher' }).select('_id').lean();
    if (user) {
      const teacher = await Teacher.findOne({ school: schoolId, user: user._id, status: 'active' }).select('_id teacherId user').lean();
      if (teacher) return teacher;
    }
  }

  throw new NotFoundError('Active substitute teacher in this school');
}

export const listSubstitutes = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await schoolContext(req);
  const date = dateOnly(req.query.date);
  const rows = await SubstituteAssignment.find({ school: schoolId, date, active: true })
    .populate({ path: 'teacher', select: 'teacherId profile user', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'user', select: 'email' }] })
    .populate({ path: 'schedule', select: 'class course startTime endTime', populate: [{ path: 'class', select: 'title section' }, { path: 'course', select: 'title courseCode' }] })
    .sort({ createdAt: 1 })
    .lean();
  return ApiResponse.success(res, rows);
};

export const assignSubstitute = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await schoolContext(req);
  if (!['admin', 'org_admin'].includes(req.user?.role || '')) throw new ForbiddenError('Only administrators can assign substitute teachers.');
  const date = dateOnly(req.body?.date);
  const scheduleId = String(req.body?.schedule || '');
  if (!mongoose.isValidObjectId(scheduleId)) throw new BadRequestError('A valid schedule is required.');

  const schedule: any = await ClassSchedule.findOne({ _id: scheduleId, school: schoolId, isActive: true }).select('_id dayOfWeek teacher course class startTime endTime').lean();
  if (!schedule) throw new NotFoundError('Schedule');
  if (Number(schedule.dayOfWeek) !== date.getDay()) throw new BadRequestError('This schedule does not meet on the selected date.');

  const teacher: any = await resolveTeacher(schoolId, req.body?.teacher);
  if (schedule.teacher && String(schedule.teacher) === String(teacher._id)) throw new BadRequestError('This teacher is already the regular teacher for the schedule.');

  const conflicting = await ClassSchedule.exists({ school: schoolId, teacher: teacher._id, dayOfWeek: date.getDay(), isActive: true, startTime: { $lt: schedule.endTime }, endTime: { $gt: schedule.startTime } });
  if (conflicting) throw new BadRequestError('The substitute teacher already has a regular class during this time.');
  const substituteConflict = await SubstituteAssignment.findOne({ school: schoolId, teacher: teacher._id, date, active: true, schedule: { $ne: schedule._id } }).populate('schedule', 'startTime endTime').lean();
  if (substituteConflict) {
    const other: any = substituteConflict.schedule;
    if (other && other.startTime < schedule.endTime && other.endTime > schedule.startTime) throw new BadRequestError('The substitute teacher is already covering another class during this time.');
  }

  const row = await SubstituteAssignment.findOneAndUpdate(
    { school: schoolId, schedule: schedule._id, date },
    { $set: {
      teacher: teacher._id,
      reason: String(req.body?.reason || '').trim().slice(0, 500),
      active: true,
      assignedBy: new mongoose.Types.ObjectId(req.user!.userId),
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return ApiResponse.success(res, row, 'Substitute teacher assigned successfully');
};

export const removeSubstitute = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = await schoolContext(req);
  if (!['admin', 'org_admin'].includes(req.user?.role || '')) throw new ForbiddenError('Only administrators can remove substitute assignments.');
  if (!mongoose.isValidObjectId(req.params.id)) throw new BadRequestError('A valid substitute assignment is required.');
  const row = await SubstituteAssignment.findOneAndUpdate({ _id: req.params.id, school: schoolId }, { $set: { active: false } }, { new: true });
  if (!row) throw new NotFoundError('Substitute assignment');
  return ApiResponse.success(res, { _id: row._id }, 'Substitute assignment removed');
};
