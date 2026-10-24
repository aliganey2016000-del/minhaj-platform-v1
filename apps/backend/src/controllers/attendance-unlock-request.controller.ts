import mongoose from 'mongoose';
import { Request, Response } from 'express';
import AttendanceUnlockRequest from '../models/attendance-unlock-request.model';
import AttendanceSession from '../models/attendance-session.model';
import Attendance from '../models/attendance.model';
import { resolveViewableOrgId, getOwnTeacherRecord } from '../utils/tenant-scope';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/api-error';

function parseDate(raw: unknown): Date {
  const value = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestError('A valid attendance date (YYYY-MM-DD) is required.');
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new BadRequestError('A valid attendance date is required.');
  return date;
}

export async function createRequest(req: Request, res: Response): Promise<Response> {
  const course: any = (req as any).attendanceCourse;
  const schedule: any = (req as any).attendanceSchedule;
  if (!course || !schedule) throw new BadRequestError('Course and scheduled class are required.');
  const date = parseDate(req.body.date);
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 3) throw new BadRequestError('Please explain why this attendance needs to be reopened.');
  const session = await AttendanceSession.findOne({ school: course.school, course: course._id, schedule: schedule._id, date });
  if (!session?.locked || session.status !== 'complete') throw new ConflictError('Only completed, locked attendance can be submitted for unlock approval.');
  const teacher: any = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found.');
  const existing = await AttendanceUnlockRequest.findOne({ school: course.school, schedule: schedule._id, date, status: 'pending' });
  if (existing) throw new ConflictError('An unlock request is already waiting for administrator review.');
  const request = await AttendanceUnlockRequest.create({
    school: course.school, course: course._id, schedule: schedule._id, date,
    teacher: teacher._id, reason: reason.slice(0, 1000), status: 'pending',
  });
  return ApiResponse.success(res, request, 'Attendance unlock request submitted for approval');
}

export async function listRequests(req: Request, res: Response): Promise<Response> {
  const orgId = resolveViewableOrgId(req);
  const filter: Record<string, unknown> = {};
  if (req.user?.role === 'admin') {
    const schoolId = String(req.query.schoolId || '');
    if (schoolId && mongoose.isValidObjectId(schoolId)) filter.school = schoolId;
    else if (req.query.status !== 'all') filter.status = String(req.query.status || 'pending');
  } else {
    if (!orgId) throw new ForbiddenError('Your account is not assigned to an organization.');
    filter.school = orgId;
    filter.status = String(req.query.status || 'pending');
  }
  if (req.query.status === 'all') delete filter.status;
  const rows = await AttendanceUnlockRequest.find(filter)
    .populate({ path: 'teacher', select: 'teacherId profile user', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'user', select: 'email' }] })
    .populate('course', 'title courseCode')
    .populate({ path: 'schedule', select: 'startTime endTime class', populate: { path: 'class', select: 'title section' } })
    .sort({ createdAt: -1 }).limit(200).lean();
  return ApiResponse.success(res, rows);
}

export async function reviewRequest(req: Request, res: Response): Promise<Response> {
  const course: any = (req as any).attendanceCourse;
  const schedule: any = (req as any).attendanceSchedule;
  if (!course || !schedule) throw new BadRequestError('Course and scheduled class are required.');
  const request = await AttendanceUnlockRequest.findById(req.params.id);
  if (!request) throw new NotFoundError('Attendance unlock request');
  if (String(request.school) !== String(course.school) || String(request.course) !== String(course._id) || String(request.schedule) !== String(schedule._id)) {
    throw new ForbiddenError('This request does not belong to the selected school attendance session.');
  }
  if (request.status !== 'pending') throw new ConflictError('This request has already been reviewed.');
  const approve = req.body.decision === 'approve';
  if (!approve && req.body.decision !== 'reject') throw new BadRequestError('Decision must be approve or reject.');
  const reviewNote = String(req.body.reviewNote || '').trim().slice(0, 1000);
  request.status = approve ? 'approved' : 'rejected';
  request.reviewedBy = new mongoose.Types.ObjectId(req.user!.userId);
  request.reviewedAt = new Date();
  request.reviewNote = reviewNote;
  if (approve) {
    const date = request.date;
    const session = await AttendanceSession.findOne({ school: request.school, schedule: request.schedule, date });
    if (!session?.locked) throw new ConflictError('Attendance is no longer locked; refresh before reviewing this request.');
    await Attendance.updateMany({ course: request.course, schedule: request.schedule, date }, { $set: { locked: false } });
    const unlockedAt = new Date();
    const reasonText = `Approved unlock request: ${request.reason}`.slice(0, 500);
    session.locked = false;
    session.syncSubmissionId = undefined;
    session.syncState = undefined;
    session.syncClaimedAt = undefined;
    const unlockedBy = new mongoose.Types.ObjectId(req.user!.userId);
    session.unlockedBy = unlockedBy;
    session.unlockedAt = unlockedAt;
    session.unlockReason = reasonText;
    session.corrections.push({ unlockedBy, unlockedAt, reason: reasonText });
    await session.save();
  }
  await request.save();
  return ApiResponse.success(res, request, approve ? 'Unlock request approved; attendance is now editable.' : 'Unlock request rejected.');
}

export async function myRequests(req: Request, res: Response): Promise<Response> {
  const teacher: any = await getOwnTeacherRecord(req);
  if (!teacher) throw new ForbiddenError('Teacher record not found.');
  const rows = await AttendanceUnlockRequest.find({ teacher: teacher._id })
    .populate('course', 'title courseCode')
    .populate('schedule', 'startTime endTime class')
    .sort({ createdAt: -1 }).limit(100).lean();
  return ApiResponse.success(res, rows);
}
