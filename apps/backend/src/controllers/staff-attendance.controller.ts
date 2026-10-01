import { Request, Response } from 'express';
import StaffAttendance, { StaffAttendanceStatus } from '../models/staff-attendance.model';
import StaffAttendanceSettings from '../models/staff-attendance-settings.model';
import TeacherBiometric from '../models/teacher-biometric.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import School from '../models/school.model';
import { BadRequestError, ForbiddenError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { isValidTimeZone } from '../utils/teacher-biometric';

const VALID_STATUSES: StaffAttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

// Profiles reference User through Profile.user; User has no `profile` path
// that Mongoose can populate. Join only the employees already in scope.
async function profilesForUsers(userIds: unknown[]) {
  const profiles = userIds.length
    ? await Profile.find({ user: { $in: userIds } }).select('user firstName lastName').lean()
    : [];
  return new Map(profiles.map((profile) => [profile.user.toString(), {
    firstName: profile.firstName,
    lastName: profile.lastName,
  }]));
}

function dayRange(value?: string) {
  const date = value ? new Date(value + 'T00:00:00.000Z') : new Date();
  if (Number.isNaN(date.getTime())) throw new BadRequestError('Invalid date');
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end, date: start };
}

function objectIdString(value: any): string | undefined {
  if (!value) return undefined;
  const raw = value?._id ?? value;
  const text = String(raw || '').trim();
  return /^[a-fA-F0-9]{24}$/.test(text) ? text : undefined;
}

/**
 * Resolve the organization from the authoritative User document instead of
 * trusting only the JWT's organizationId. This matters for long-lived browser
 * sessions: an org can be assigned/changed after the token was issued, while
 * /auth/me already reflects the current database value.
 *
 * Platform admins may explicitly target another org through the request.
 * Org admins are always pinned to their own current DB organization.
 */
async function resolveRequestOrganization(
  req: Request,
  explicitOrganizationId?: unknown
): Promise<string | undefined> {
  const role = req.user?.role;
  if (!req.user?.userId) throw new ForbiddenError('Authentication is required');

  const currentUser = await User.findById(req.user.userId).select('organizationId role isActive').lean();
  if (!currentUser || currentUser.isActive === false) {
    throw new ForbiddenError('Your account is inactive or no longer available');
  }

  const databaseOrgId = objectIdString(currentUser.organizationId);
  const tokenOrgId = objectIdString(req.user.organizationId);

  if (role === 'org_admin') {
    const organizationId = databaseOrgId || tokenOrgId;
    if (!organizationId) {
      throw new ForbiddenError('Your account is not assigned to an organization');
    }
    return organizationId;
  }

  if (role === 'admin') {
    const explicitId = objectIdString(explicitOrganizationId);
    if (explicitOrganizationId && !explicitId) {
      throw new BadRequestError('Invalid organizationId');
    }
    if (explicitId) return explicitId;

    const ownOrganizationId = databaseOrgId || tokenOrgId;
    if (ownOrganizationId) return ownOrganizationId;

    // If the platform admin is visiting a tenant subdomain/custom domain,
    // resolve that tenant as the current organization as a final fallback.
    if (req.tenant?.slug) {
      const tenantSchool = await School.findOne({ slug: req.tenant.slug, status: 'active' })
        .select('_id')
        .lean();
      if (tenantSchool?._id) return tenantSchool._id.toString();
    }

    return undefined;
  }

  throw new ForbiddenError('Administrator access is required');
}

async function ensureEmployee(req: Request, userId: string, explicitOrganizationId?: unknown) {
  const organizationId = await resolveRequestOrganization(req, explicitOrganizationId);
  const filter: Record<string, unknown> = {
    _id: userId,
    role: { $in: ['staff', 'teacher'] },
    isActive: true,
  };
  if (organizationId) filter.organizationId = organizationId;

  const user = await User.findOne(filter)
    .select('_id organizationId email phone title department role')
    .lean();
  if (!user) throw new ForbiddenError('Teacher/staff member not found or outside your organization');
  return user;
}

export const getForDate = async (req: Request, res: Response): Promise<Response> => {
  const { start, end } = dayRange(req.query.date as string | undefined);
  const organizationId = await resolveRequestOrganization(req, req.query.organizationId);

  const employeeFilter: Record<string, unknown> = {
    role: { $in: ['staff', 'teacher'] },
    isActive: true,
  };
  const attendanceFilter: Record<string, unknown> = {
    date: { $gte: start, $lt: end },
  };

  if (organizationId) {
    employeeFilter.organizationId = organizationId;
    attendanceFilter.organizationId = organizationId;
  }

  const employees = await User.find(employeeFilter)
    .select('_id email phone title department organizationId role')
    .populate('department', 'name')
    .populate('organizationId', 'name')
    .sort({ role: 1, createdAt: 1 })
    .limit(1000)
    .lean();

  const profiles = await profilesForUsers(employees.map((member) => member._id));
  const records = await StaffAttendance.find(attendanceFilter).lean();
  const byUser = new Map(records.map((record) => [record.user.toString(), record]));

  const teacherIds = employees
    .filter((member: any) => member.role === 'teacher')
    .map((member: any) => member._id);
  const biometricRows = teacherIds.length
    ? await TeacherBiometric.find({ user: { $in: teacherIds } })
        .select('user organizationId')
        .lean()
    : [];
  // A teacher can be transferred to another organization while the old
  // tenant's encrypted template remains until it is cleaned up. Enrollment
  // status must match both the user and the organization currently displayed.
  const enrolled = new Set(
    biometricRows.map((item) => item.organizationId.toString() + ':' + item.user.toString())
  );

  const rows = employees.map((member: any) => ({
    staff: { ...member, profile: profiles.get(member._id.toString()) || null },
    attendance: byUser.get(member._id.toString()) || null,
    biometricEnrolled:
      member.role === 'teacher'
        ? enrolled.has((objectIdString(member.organizationId) || '') + ':' + member._id.toString())
        : false,
  }));

  return ApiResponse.success(res, {
    date: start.toISOString().slice(0, 10),
    organizationId: organizationId || null,
    rows,
  });
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
      $unset: {
        checkInAt: '',
        checkOutAt: '',
        verification: '',
        checkOutVerification: '',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();

  return ApiResponse.success(res, record, 'Attendance saved');
};

export const history = async (req: Request, res: Response): Promise<Response> => {
  const userId = req.query.userId as string | undefined;
  const organizationId = await resolveRequestOrganization(req, req.query.organizationId);

  if (userId) await ensureEmployee(req, userId, organizationId);

  const filter: Record<string, unknown> = userId ? { user: userId } : {};
  if (organizationId) filter.organizationId = organizationId;

  const records = await StaffAttendance.find(filter)
    .populate({
      path: 'user',
      select: 'email phone title role organizationId',
      populate: { path: 'organizationId', select: 'name' },
    })
    .sort({ date: -1, markedAt: -1 })
    .limit(300)
    .lean();

  const profiles = await profilesForUsers(
    records.flatMap((record: any) => record.user?._id ? [record.user._id] : [])
  );
  return ApiResponse.success(res, records.map((record: any) => ({
    ...record,
    user: record.user ? {
      ...record.user,
      profile: profiles.get(record.user._id.toString()) || null,
    } : null,
  })));
};

export const getSettings = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = await resolveRequestOrganization(req, req.query.organizationId);
  if (!organizationId) {
    throw new BadRequestError('Select an organization before configuring smart attendance');
  }

  const settings = await StaffAttendanceSettings.findOne({ organizationId }).lean();
  const data = settings || {
    organizationId,
    enabled: true,
    radiusMeters: 150,
    locationAccuracyMeters: 0,
    maxAccuracyMeters: 100,
    faceMatchThreshold: 0.52,
    requireLiveness: true,
    enrollmentRequiresGeofence: true,
    checkOutEnabled: true,
    timezone: 'Africa/Mogadishu',
  };

  return ApiResponse.success(res, {
    ...data,
    locationAccuracyMeters: Number.isFinite((data as any).locationAccuracyMeters)
      ? Number((data as any).locationAccuracyMeters)
      : 25,
    organizationId,
    configured: Number.isFinite((data as any).latitude) && Number.isFinite((data as any).longitude),
  });
};

function finiteInRange(value: unknown, min: number, max: number, label: string): number {
  if (value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) {
    throw new BadRequestError(label + ' is required');
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new BadRequestError(label + ' must be between ' + min + ' and ' + max);
  }
  return number;
}

export const updateSettings = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = await resolveRequestOrganization(req, req.body?.organizationId);
  if (!organizationId) {
    throw new BadRequestError('Select an organization before configuring smart attendance');
  }

  for (const key of ['enabled', 'requireLiveness', 'enrollmentRequiresGeofence', 'checkOutEnabled']) {
    if (req.body?.[key] !== undefined && typeof req.body[key] !== 'boolean') throw new BadRequestError(key + ' must be true or false');
  }
  const current = await StaffAttendanceSettings.findOne({ organizationId }).lean();
  const latitude = finiteInRange(req.body?.latitude === undefined ? current?.latitude : req.body.latitude, -90, 90, 'Latitude');
  const longitude = finiteInRange(req.body?.longitude === undefined ? current?.longitude : req.body.longitude, -180, 180, 'Longitude');
  const locationAccuracyMeters = finiteInRange(
    req.body?.locationAccuracyMeters ?? current?.locationAccuracyMeters ?? 25,
    0,
    5000,
    'School GPS accuracy'
  );
  const radiusMeters = finiteInRange(
    req.body?.radiusMeters ?? current?.radiusMeters ?? 150,
    20,
    5000,
    'Radius'
  );
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
        locationAccuracyMeters,
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
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean();

  return ApiResponse.success(
    res,
    { ...settings, organizationId, configured: true },
    'Smart attendance settings saved'
  );
};

export const resetTeacherFace = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = await resolveRequestOrganization(req, req.body?.organizationId);
  if (!organizationId) {
    throw new BadRequestError('Select an organization before resetting face enrollment');
  }

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
