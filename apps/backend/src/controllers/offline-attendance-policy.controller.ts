import { Request, Response } from 'express';
import mongoose from 'mongoose';
import School from '../models/school.model';
import OfflineAttendancePolicy, {
  ALLOWED_OFFLINE_ATTENDANCE_DAYS, DEFAULT_OFFLINE_ATTENDANCE_DAYS,
} from '../models/offline-attendance-policy.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { offlineAttendancePeriod } from '../utils/offline-attendance-period';

/** Organization admins may configure only their own school. A platform
 * administrator must explicitly supply a school ID. Teachers read own only. */
function schoolIdFor(req: Request): string {
  if (req.user?.isStaff) throw new ForbiddenError('Only organization administrators can manage offline access.');
  let schoolId: string | undefined;
  if (req.user?.role === 'admin') {
    schoolId = typeof req.query.school === 'string' ? req.query.school : undefined;
    if (!schoolId) throw new BadRequestError('Choose a school first.');
  } else {
    schoolId = req.user?.organizationId;
  }
  if (!schoolId || !mongoose.isValidObjectId(schoolId)) {
    throw new ForbiddenError('No valid school assigned to this account.');
  }
  return schoolId;
}

export const getOfflineAttendancePolicy = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = schoolIdFor(req);
  if (!await School.exists({ _id: organizationId })) throw new NotFoundError('School');
  const policy = await OfflineAttendancePolicy.findOne({ organizationId }).lean();
  const days = policy?.maxOfflineDays ?? DEFAULT_OFFLINE_ATTENDANCE_DAYS;
  const verifiedAt = new Date();
  const period = offlineAttendancePeriod(days, verifiedAt);
  res.setHeader('Cache-Control', 'no-store');
  return ApiResponse.success(res, {
    organizationId, maxOfflineDays: days,
    allowedDays: [...ALLOWED_OFFLINE_ATTENDANCE_DAYS],
    isDefault: !policy,
    timezone: 'Africa/Mogadishu',
    verifiedAt: verifiedAt.toISOString(),
    periodStart: period.start.toISOString(),
    periodEndExclusive: period.endExclusive.toISOString(),
    nextPeriodStart: period.nextPeriodStart.toISOString(),
    calendarAligned: period.calendarAligned,
  });
};

export const updateOfflineAttendancePolicy = async (req: Request, res: Response): Promise<Response> => {
  if (req.user?.role !== 'org_admin' && req.user?.role !== 'admin') {
    throw new ForbiddenError('Only administrators can change offline attendance access.');
  }
  const organizationId = schoolIdFor(req);
  const { maxOfflineDays } = req.body || {};
  if (typeof maxOfflineDays !== 'number' ||
      !ALLOWED_OFFLINE_ATTENDANCE_DAYS.some(days => days === maxOfflineDays)) {
    throw new BadRequestError('maxOfflineDays must be one of 1, 3, 7, 14, or 30.');
  }
  if (!await School.exists({ _id: organizationId })) throw new NotFoundError('School');
  const policy = await OfflineAttendancePolicy.findOneAndUpdate(
    { organizationId },
    { $set: { maxOfflineDays, updatedBy: req.user!.userId }, $setOnInsert: { organizationId } },
    { new: true, upsert: true, runValidators: true },
  ).lean();
  const verifiedAt = new Date();
  const period = offlineAttendancePeriod(policy!.maxOfflineDays, verifiedAt);
  res.setHeader('Cache-Control', 'no-store');
  return ApiResponse.success(res,
    {
      organizationId, maxOfflineDays: policy!.maxOfflineDays,
      allowedDays: [...ALLOWED_OFFLINE_ATTENDANCE_DAYS],
      timezone: 'Africa/Mogadishu',
      verifiedAt: verifiedAt.toISOString(),
      periodStart: period.start.toISOString(),
      periodEndExclusive: period.endExclusive.toISOString(),
      nextPeriodStart: period.nextPeriodStart.toISOString(),
      calendarAligned: period.calendarAligned,
    },
    'Offline attendance access duration updated.'
  );
};
