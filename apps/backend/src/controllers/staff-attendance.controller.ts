import { Request, Response } from 'express';
import StaffAttendance, { StaffAttendanceStatus } from '../models/staff-attendance.model';
import StaffAttendanceSettings from '../models/staff-attendance-settings.model';
import TeacherBiometric from '../models/teacher-biometric.model';
import User from '../models/user.model';
import { BadRequestError, ForbiddenError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter } from '../utils/tenant-scope';
import { isValidTimeZone } from '../utils/teacher-biometric';

const VALID_STATUSES: StaffAttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

function dayRange(value?: string) {
  const date = value ? new Date(value + 'T00:00:00.000Z') : new Date();
  if (Number.isNaN(date.getTime())) throw new BadRequestError('Invalid date');
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end, date: start };
}

function applyAttendanceOrgFilter(
  req: Request,
  filter: Record<string, unknown>,
  bodyOrganizationId?: unknown
): Record<string, unknown> {
  const scoped = applyOrgFilter(req, filter, 'organizationId');
  if (req.user?.role === 'admin') {
    const requested = bodyOrganizationId || req.query.organizationId;
    if (requested) scoped.organizationId = String(requested);
  }
  return scoped;
}

function resolveSettingsOrganization(req: Request, bodyOrganizationId?: unknown): string {
  if (req.user?.role === 'org_admin') {
    if (!req.user.organizationId) throw new ForbiddenError('Your account is not assigned to an organization');
    return req.user.organizationId;
  }
  if (req.user?.role === 'admin') {
    const requested = bodyOrganizationId || req.query.organizationId;
    if (!requested) throw new BadRequestError('organizationId is required for platform administrators');
    return String(requested);
  }
  throw new ForbiddenError('Administrator access is required');
}

async function ensureEmployee(req: Request, userId: string, organizationId?: unknown) {
  const filter: Record<string, unknown> = {
    _id: userId,
    role: { $in: ['staff', 'teacher'] },
    isActive: true,
  };
  const scoped = applyAttendanceOrgFilter(req, filter, organizationId);
  const user = await User.findOne(scoped)
    .select('_id organizationId email phone title department role')
    .lean();
  if (!user) throw new ForbiddenError('Teacher/staff member not found or outside your organization');
  return user;
}

export const getForDate = async (req: Request, res: Response): Promise<Response> => {
  const { start, end } = dayRange(req.query.date as string | undefined);
  const employeeFilter = applyAttendanceOrgFilter(req, {
    role: { $in: ['staff', 'teacher'] },
    isActive: true,
  });
  const employees = await User.find(employeeFilter)
    .select('_id email phone title department organizationId role')
    .populate('profile', 'firstName lastName')
    .populate('department', 'name')
    .populate('organizationId', 'name')
    .sort({ role: 1, createdAt: 1 })
    .limit(1000)
    .lean();

  const attendanceFilter = applyAttendanceOrgFilter(req, {
    date: { $gte: start, $lt: end },
  });
  const records = await StaffAttendance.find(attendanceFilter).lean();
  const byUser = new Map(records.map((record) => [record.user.toString(), record]));

  const teacherIds = employees
    .filter((member: any) => member.role === 'teacher')
    .map((member: any) => member._id);
  const biometricRows = teacherIds.length
    ? await TeacherBiometric.find({ user: { $in: teacherIds } }).select('user').lean()
    : [];
  const enrolled = new Set(biometricRows.map((item) => item.user.toString()));

  const rows = employees.map((member: any) => ({
    staff: member,
    attendance: byUser.get(member._id.toString()) || null,
    biometricEnrolled: member.role === 'teacher' ? enrolled.has(member._id.toString()) : false,
  }));
  return ApiResponse.success(res, { date: start.toISOString().slice(0, 10), rows });
};

export const mark = async (req: Request, res: Response): Promise<Response> => {
  const { userId, date, status, notes, organizationId } = req.body as {
    userId: string;
    date?: string;
    status: StaffAttendanceStatus;
    notes?: string;
    organizationId?: string;
  };
  if (!userId || !VALID_STATUSES.includes(status)) {
    throw new BadRequestError('userId and a valid status are required');
  }
  const employee = await ensureEmployee(req, userId, organizationId);
  if (!employee.organizationId) throw new BadRequestError('Employee is not assigned to an organization');
  const { date: day } = dayRange(date);
  const record = await StaffAttendance.findOneAndUpdate(
    { organizationId: employee.organizationId, user: employee._id, date: day },
    {
      $set: {
        status,
        notes: notes || '',
        source: 'admin',
        markedBy: req.user!.userId,
        markedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return ApiResponse.success(res, record, 'Attendance saved');
};

export const history = async (req: Request, res: Response): Promise<Response> => {
  const userId = req.query.userId as string | undefined;
  if (userId) await ensureEmployee(req, userId, req.query.organizationId);
  const filter: Record<string, unknown> = userId ? { user: userId } : {};
  const scoped = applyAttendanceOrgFilter(req, filter);
  const records = await StaffAttendance.find(scoped)
    .populate({
      path: 'user',
      select: 'email phone title role organizationId',
      populate: [
        { path: 'profile', select: 'firstName lastName' },
        { path: 'organizationId', select: 'name' },
      ],
    })
    .sort({ date: -1, markedAt: -1 })
    .limit(300)
    .lean();
  return ApiResponse.success(res, records);
};

export const getSettings = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = resolveSettingsOrganization(req);
  const settings = await StaffAttendanceSettings.findOne({ organizationId }).lean();
  const data = settings || {
    organizationId,
    enabled: true,
    radiusMeters: 150,
    maxAccuracyMeters: 100,
    faceMatchThreshold: 0.52,
    requireLiveness: true,
    enrollmentRequiresGeofence: true,
    checkOutEnabled: true,
    timezone: 'Africa/Mogadishu',
  };
  return ApiResponse.success(res, {
    ...data,
    configured: Number.isFinite((data as any).latitude) && Number.isFinite((data as any).longitude),
  });
};

function finiteInRange(value: unknown, min: number, max: number, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new BadRequestError(label + ' must be between ' + min + ' and ' + max);
  }
  return number;
}

export const updateSettings = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = resolveSettingsOrganization(req, req.body?.organizationId);
  const current = await StaffAttendanceSettings.findOne({ organizationId }).lean();
  const latitude = finiteInRange(req.body?.latitude, -90, 90, 'Latitude');
  const longitude = finiteInRange(req.body?.longitude, -180, 180, 'Longitude');
  const radiusMeters = finiteInRange(req.body?.radiusMeters ?? current?.radiusMeters ?? 150, 20, 5000, 'Radius');
  const maxAccuracyMeters = finiteInRange(
    req.body?.maxAccuracyMeters ?? current?.maxAccuracyMeters ?? 100,
    10,
    1000,
    'Maximum GPS accuracy'
  );
  const faceMatchThreshold = finiteInRange(
    req.body?.faceMatchThreshold ?? current?.faceMatchThreshold ?? 0.52,
    0.3,
    0.8,
    'Face match threshold'
  );
  const timezone = String(req.body?.timezone ?? current?.timezone ?? 'Africa/Mogadishu').trim();
  if (!isValidTimeZone(timezone)) throw new BadRequestError('Invalid timezone');

  const settings = await StaffAttendanceSettings.findOneAndUpdate(
    { organizationId },
    {
      $set: {
        enabled: req.body?.enabled === undefined ? (current?.enabled ?? true) : Boolean(req.body.enabled),
        latitude,
        longitude,
        radiusMeters,
        maxAccuracyMeters,
        faceMatchThreshold,
        requireLiveness:
          req.body?.requireLiveness === undefined
            ? (current?.requireLiveness ?? true)
            : Boolean(req.body.requireLiveness),
        enrollmentRequiresGeofence:
          req.body?.enrollmentRequiresGeofence === undefined
            ? (current?.enrollmentRequiresGeofence ?? true)
            : Boolean(req.body.enrollmentRequiresGeofence),
        checkOutEnabled:
          req.body?.checkOutEnabled === undefined
            ? (current?.checkOutEnabled ?? true)
            : Boolean(req.body.checkOutEnabled),
        timezone,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return ApiResponse.success(res, { ...settings, configured: true }, 'Smart attendance settings saved');
};

export const resetTeacherFace = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = resolveSettingsOrganization(req, req.body?.organizationId);
  const teacher = await User.findOne({
    _id: req.params.userId,
    role: 'teacher',
    organizationId,
    isActive: true,
  }).select('_id').lean();
  if (!teacher) throw new ForbiddenError('Teacher not found in this organization');
  await TeacherBiometric.deleteOne({ user: teacher._id, organizationId });
  return ApiResponse.success(res, { reset: true }, 'Teacher face enrollment reset');
};
