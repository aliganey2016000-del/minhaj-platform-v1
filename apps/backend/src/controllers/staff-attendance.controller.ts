import { Request, Response } from 'express';
import StaffAttendance, { StaffAttendanceStatus } from '../models/staff-attendance.model';
import User from '../models/user.model';
import { BadRequestError, ForbiddenError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';

const VALID_STATUSES: StaffAttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

function dayRange(value?: string) {
  const date = value ? new Date(`${value}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) throw new BadRequestError('Invalid date');
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  return { start, end, date: start };
}

async function ensureStaff(req: Request, userId: string) {
  const filter: Record<string, unknown> = { _id: userId, role: 'staff', isActive: true };
  applyOrgFilter(req, filter, 'organizationId');
  const user = await User.findOne(filter).select('_id organizationId email phone title department').lean();
  if (!user) throw new ForbiddenError('Staff member not found or outside your organization');
  return user;
}

export const getForDate = async (req: Request, res: Response): Promise<Response> => {
  const { start, end } = dayRange(req.query.date as string | undefined);
  const staffFilter: Record<string, unknown> = { role: 'staff', isActive: true };
  applyOrgFilter(req, staffFilter, 'organizationId');
  const staff = await User.find(staffFilter).select('_id email phone title department organizationId').populate('profile', 'firstName lastName').populate('department', 'name').sort({ createdAt: 1 }).limit(500).lean();
  const attendanceFilter: Record<string, unknown> = { date: { $gte: start, $lt: end } };
  applyOrgFilter(req, attendanceFilter, 'organizationId');
  const records = await StaffAttendance.find(attendanceFilter).lean();
  const byUser = new Map(records.map((record) => [record.user.toString(), record]));
  const rows = staff.map((member: any) => ({ staff: member, attendance: byUser.get(member._id.toString()) || null }));
  return ApiResponse.success(res, { date: start.toISOString().slice(0, 10), rows });
};

export const mark = async (req: Request, res: Response): Promise<Response> => {
  const { userId, date, status, notes } = req.body as { userId: string; date?: string; status: StaffAttendanceStatus; notes?: string };
  if (!userId || !VALID_STATUSES.includes(status)) throw new BadRequestError('userId and a valid status are required');
  const staff = await ensureStaff(req, userId);
  const { date: day } = dayRange(date);
  const record = await StaffAttendance.findOneAndUpdate({ organizationId: staff.organizationId, user: staff._id, date: day }, { $set: { status, notes: notes || '', markedBy: req.user!.userId, markedAt: new Date() } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  return ApiResponse.success(res, record, 'Staff attendance saved');
};

export const history = async (req: Request, res: Response): Promise<Response> => {
  const userId = req.query.userId as string | undefined;
  if (userId) await ensureStaff(req, userId);
  const filter: Record<string, unknown> = userId ? { user: userId } : {};
  applyOrgFilter(req, filter, 'organizationId');
  const records = await StaffAttendance.find(filter).populate({ path: 'user', select: 'email phone title', populate: { path: 'profile', select: 'firstName lastName' } }).sort({ date: -1 }).limit(200).lean();
  return ApiResponse.success(res, records);
};
