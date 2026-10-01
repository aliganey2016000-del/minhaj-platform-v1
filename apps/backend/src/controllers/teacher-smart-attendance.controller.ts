import { Request, Response } from 'express';
import StaffAttendance, { IStaffAttendanceVerification } from '../models/staff-attendance.model';
import StaffAttendanceSettings from '../models/staff-attendance-settings.model';
import TeacherBiometric from '../models/teacher-biometric.model';
import User from '../models/user.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ConflictError, ForbiddenError } from '../utils/api-error';
import {
  adjustedGeofenceDistance,
  createLivenessChallenge,
  dateLabelInTimezone,
  decryptDescriptorWithMetadata,
  encryptDescriptor,
  euclideanDistance,
  haversineDistanceMeters,
  livenessFailure,
  validateDescriptor,
  verifyLivenessChallenge,
} from '../utils/teacher-biometric';

interface EffectiveSettings {
  enabled: boolean;
  latitude?: number;
  longitude?: number;
  locationAccuracyMeters: number;
  radiusMeters: number;
  maxAccuracyMeters: number;
  faceMatchThreshold: number;
  requireLiveness: boolean;
  enrollmentRequiresGeofence: boolean;
  checkOutEnabled: boolean;
  timezone: string;
}

interface LocationInput {
  latitude: number;
  longitude: number;
  accuracy: number;
}

const DEFAULT_SETTINGS: EffectiveSettings = {
  enabled: true,
  locationAccuracyMeters: 0,
  radiusMeters: 150,
  maxAccuracyMeters: 100,
  faceMatchThreshold: 0.52,
  requireLiveness: true,
  enrollmentRequiresGeofence: true,
  checkOutEnabled: true,
  timezone: 'Africa/Mogadishu',
};

async function teacherContext(req: Request) {
  if (!req.user?.userId || req.user.role !== 'teacher') {
    throw new ForbiddenError('Teacher access is required');
  }
  const user = await User.findOne({
    _id: req.user.userId,
    role: 'teacher',
    isActive: true,
  }).select('_id organizationId').lean();
  if (!user?.organizationId) {
    throw new ForbiddenError('Your teacher account is not assigned to an organization');
  }
  return { userId: user._id.toString(), organizationId: user.organizationId.toString() };
}

async function effectiveSettings(organizationId: string): Promise<EffectiveSettings> {
  const stored = await StaffAttendanceSettings.findOne({ organizationId }).lean();
  if (!stored) return { ...DEFAULT_SETTINGS };
  return {
    enabled: stored.enabled,
    latitude: stored.latitude,
    longitude: stored.longitude,
    locationAccuracyMeters: Number.isFinite(stored.locationAccuracyMeters)
      ? stored.locationAccuracyMeters
      : 25,
    radiusMeters: stored.radiusMeters,
    maxAccuracyMeters: stored.maxAccuracyMeters,
    faceMatchThreshold: stored.faceMatchThreshold,
    requireLiveness: stored.requireLiveness,
    enrollmentRequiresGeofence: stored.enrollmentRequiresGeofence,
    checkOutEnabled: stored.checkOutEnabled,
    timezone: stored.timezone || DEFAULT_SETTINGS.timezone,
  };
}

function requireConfigured(settings: EffectiveSettings): void {
  if (!settings.enabled) throw new BadRequestError('Smart teacher attendance is disabled for this organization');
  if (!Number.isFinite(settings.latitude) || !Number.isFinite(settings.longitude)) {
    throw new BadRequestError('Smart attendance location is not configured. Ask your administrator to set the school GPS location.');
  }
}

function readLocation(raw: unknown): LocationInput {
  const value = (raw || {}) as Partial<LocationInput>;
  if (['latitude', 'longitude', 'accuracy'].some(key => typeof (value as any)[key] !== 'number')) {
    throw new BadRequestError('GPS latitude, longitude and accuracy must be numbers');
  }
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const accuracy = Number(value.accuracy);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new BadRequestError('A valid GPS latitude is required');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new BadRequestError('A valid GPS longitude is required');
  }
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000) {
    throw new BadRequestError('A valid GPS accuracy value is required');
  }
  return { latitude, longitude, accuracy };
}

function verifyLocation(settings: EffectiveSettings, raw: unknown): {
  distanceMeters: number;
  accuracyMeters: number;
} {
  requireConfigured(settings);
  const location = readLocation(raw);
  if (location.accuracy > settings.maxAccuracyMeters) {
    throw new BadRequestError(
      'GPS accuracy is too low (' + Math.round(location.accuracy) + ' m). Move to an open area, enable precise location and try again.'
    );
  }
  const distanceMeters = haversineDistanceMeters(
    settings.latitude as number,
    settings.longitude as number,
    location.latitude,
    location.longitude
  );

  // Consumer phone GPS can drift by tens of metres even when two devices are
  // physically at the same place. Use a capped portion of the device-reported
  // accuracy as uncertainty instead of rejecting on raw centre-point distance.
  // The cap keeps the geofence meaningful even when a device reports poor GPS.
  const schoolAccuracy = Math.max(0, Number(settings.locationAccuracyMeters || 0));
  const accuracyAdjustedDistance = adjustedGeofenceDistance(
    distanceMeters,
    location.accuracy,
    schoolAccuracy,
    50
  );

  if (accuracyAdjustedDistance > settings.radiusMeters) {
    throw new BadRequestError(
      'You are outside the attendance area. GPS shows about ' +
      Math.round(distanceMeters) +
      ' m from the school location (accuracy ±' +
      Math.round(location.accuracy) +
      ' m; school GPS accuracy ±' +
      Math.round(schoolAccuracy) +
      ' m); allowed school radius is ' +
      settings.radiusMeters +
      ' m.'
    );
  }
  return { distanceMeters, accuracyMeters: location.accuracy };
}

function verifyLiveness(
  settings: EffectiveSettings,
  challengeToken: unknown,
  liveness: unknown,
  userId: string,
  organizationId: string
): string[] {
  if (!settings.requireLiveness) return [];
  let challenge;
  try {
    challenge = verifyLivenessChallenge(challengeToken, userId, organizationId);
  } catch (error: any) {
    throw new BadRequestError(error?.message || 'Liveness challenge failed');
  }
  const failure = livenessFailure(challenge.actions, liveness);
  if (failure) throw new BadRequestError(failure);
  return challenge.actions;
}

function currentAttendanceDay(settings: EffectiveSettings): { label: string; date: Date } {
  const label = dateLabelInTimezone(new Date(), settings.timezone);
  return { label, date: new Date(label + 'T00:00:00.000Z') };
}

function safeDevice(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : undefined;
}

async function verifyFace(
  userId: string,
  organizationId: string,
  descriptorRaw: unknown,
  threshold: number
): Promise<number> {
  let descriptor: number[];
  try {
    descriptor = validateDescriptor(descriptorRaw);
  } catch (error: any) {
    throw new BadRequestError(error?.message || 'Face descriptor is invalid');
  }

  const biometric = await TeacherBiometric.findOne({ user: userId, organizationId })
    .select('+descriptorCiphertext +descriptorIv +descriptorAuthTag');
  if (!biometric) {
    throw new BadRequestError('Your face is not enrolled yet. Enroll your face before checking in.');
  }

  let storedDescriptor: number[];
  let needsReencryption = false;
  try {
    const decrypted = decryptDescriptorWithMetadata(biometric);
    storedDescriptor = decrypted.descriptor;
    needsReencryption = decrypted.needsReencryption;
  } catch {
    throw new BadRequestError('Your stored face template could not be read. Ask an administrator to reset it and enroll again.');
  }

  const faceDistance = euclideanDistance(storedDescriptor, descriptor);
  if (!Number.isFinite(faceDistance) || faceDistance > threshold) {
    throw new BadRequestError('Face verification failed. Make sure the enrolled teacher is in front of the camera and try again.');
  }

  if (needsReencryption) {
    try {
      Object.assign(biometric, encryptDescriptor(storedDescriptor));
      await biometric.save();
    } catch (error) {
      // The identity match succeeded. Keep attendance usable and retry the
      // transparent key migration on the next verification.
      console.error('[smart-attendance] Failed to migrate biometric encryption key', {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return faceDistance;
}

async function recordSuccessfulFaceVerification(userId: string, organizationId: string): Promise<void> {
  try {
    await TeacherBiometric.updateOne(
      { user: userId, organizationId },
      {
        $set: { lastVerifiedAt: new Date() },
        $inc: { verificationCount: 1 },
      }
    );
  } catch (error) {
    // Attendance has already been committed at this point. A secondary
    // verification-counter failure must not tell the teacher that check-in or
    // check-out failed and encourage a duplicate retry.
    console.error('[smart-attendance] Failed to update biometric verification metadata', {
      userId,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function verificationAudit(
  location: { distanceMeters: number; accuracyMeters: number },
  faceDistance: number,
  actions: string[],
  device: unknown,
  requireLiveness: boolean
): IStaffAttendanceVerification {
  return {
    gpsVerified: true,
    faceVerified: true,
    livenessVerified: requireLiveness && actions.length > 0,
    distanceMeters: Math.round(location.distanceMeters * 10) / 10,
    accuracyMeters: Math.round(location.accuracyMeters * 10) / 10,
    faceDistance: Math.round(faceDistance * 10000) / 10000,
    challenge: actions,
    device: safeDevice(device),
  };
}

export const getStatus = async (req: Request, res: Response): Promise<Response> => {
  const context = await teacherContext(req);
  const settings = await effectiveSettings(context.organizationId);
  const { date } = currentAttendanceDay(settings);
  const [biometric, attendance] = await Promise.all([
    TeacherBiometric.findOne({ user: context.userId, organizationId: context.organizationId })
      .select('_id enrolledAt lastVerifiedAt verificationCount')
      .lean(),
    StaffAttendance.findOne({
      organizationId: context.organizationId,
      user: context.userId,
      date,
    }).lean(),
  ]);

  const locationConfigured = Number.isFinite(settings.latitude) && Number.isFinite(settings.longitude);
  return ApiResponse.success(res, {
    configured: settings.enabled && locationConfigured,
    settings: {
      enabled: settings.enabled,
      radiusMeters: settings.radiusMeters,
      maxAccuracyMeters: settings.maxAccuracyMeters,
      locationAccuracyMeters: settings.locationAccuracyMeters,
      requireLiveness: settings.requireLiveness,
      enrollmentRequiresGeofence: settings.enrollmentRequiresGeofence,
      checkOutEnabled: settings.checkOutEnabled,
      timezone: settings.timezone,
      locationConfigured,
    },
    biometricEnrolled: Boolean(biometric),
    biometric: biometric || null,
    todayAttendance: attendance || null,
    canCheckIn: settings.enabled && locationConfigured && Boolean(biometric) && !attendance?.checkInAt,
    canCheckOut:
      settings.enabled &&
      locationConfigured &&
      settings.checkOutEnabled &&
      Boolean(attendance?.checkInAt) &&
      !attendance?.checkOutAt,
  });
};

export const getChallenge = async (req: Request, res: Response): Promise<Response> => {
  const context = await teacherContext(req);
  const settings = await effectiveSettings(context.organizationId);
  requireConfigured(settings);
  const challenge = createLivenessChallenge(context.userId, context.organizationId);
  return ApiResponse.success(res, challenge);
};

export const enrollFace = async (req: Request, res: Response): Promise<Response> => {
  const context = await teacherContext(req);
  const settings = await effectiveSettings(context.organizationId);
  requireConfigured(settings);

  if (req.body?.consent !== true) {
    throw new BadRequestError('Consent is required before a face template can be enrolled');
  }

  const existing = await TeacherBiometric.exists({
    user: context.userId,
    organizationId: context.organizationId,
  });
  if (existing) throw new ConflictError('A face template is already enrolled. Ask an administrator to reset it first.');

  if (settings.enrollmentRequiresGeofence) verifyLocation(settings, req.body?.location);
  const actions = verifyLiveness(
    settings,
    req.body?.challengeToken,
    req.body?.liveness,
    context.userId,
    context.organizationId
  );

  let descriptor: number[];
  try {
    descriptor = validateDescriptor(req.body?.descriptor);
  } catch (error: any) {
    throw new BadRequestError(error?.message || 'Face descriptor is invalid');
  }

  const encrypted = encryptDescriptor(descriptor);
  let biometric;
  try {
    biometric = await TeacherBiometric.create({
      user: context.userId,
      organizationId: context.organizationId,
      ...encrypted,
      modelVersion: 'face-api-0.22.2-128d',
      enrolledAt: new Date(),
      enrolledBy: context.userId,
      consentedAt: new Date(),
      verificationCount: 0,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new ConflictError('A face template is already enrolled. Ask an administrator to reset it first.');
    }
    throw error;
  }

  return ApiResponse.success(res, {
    enrolled: true,
    enrolledAt: biometric.enrolledAt,
    livenessVerified: settings.requireLiveness && actions.length > 0,
    geofenceVerified: settings.enrollmentRequiresGeofence,
  }, 'Face enrollment completed. No face photo was stored.');
};

export const checkIn = async (req: Request, res: Response): Promise<Response> => {
  const context = await teacherContext(req);
  const settings = await effectiveSettings(context.organizationId);
  requireConfigured(settings);

  const { date } = currentAttendanceDay(settings);
  const existing = await StaffAttendance.findOne({
    organizationId: context.organizationId,
    user: context.userId,
    date,
  }).select('_id checkInAt').lean();
  if (existing?.checkInAt) throw new ConflictError('You are already checked in today');

  const location = verifyLocation(settings, req.body?.location);
  const actions = verifyLiveness(
    settings,
    req.body?.challengeToken,
    req.body?.liveness,
    context.userId,
    context.organizationId
  );
  const faceDistance = await verifyFace(
    context.userId,
    context.organizationId,
    req.body?.descriptor,
    settings.faceMatchThreshold
  );

  const now = new Date();
  const audit = verificationAudit(
    location,
    faceDistance,
    actions,
    req.body?.device,
    settings.requireLiveness
  );

  let record;
  try {
    record = await StaffAttendance.findOneAndUpdate(
      {
        organizationId: context.organizationId,
        user: context.userId,
        date,
        $or: [{ checkInAt: { $exists: false } }, { checkInAt: null }],
      },
      {
        $set: {
          status: 'present',
          source: 'smart_self',
          checkInAt: now,
          verification: audit,
          markedBy: context.userId,
          markedAt: now,
          notes: '',
        },
      },
      { upsert: !existing, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();
  } catch (error: any) {
    if (error?.code === 11000) throw new ConflictError('You are already checked in today');
    throw error;
  }

  if (!record) throw new ConflictError('You are already checked in today');
  await recordSuccessfulFaceVerification(context.userId, context.organizationId);

  return ApiResponse.success(res, record, 'Attendance check-in verified and recorded');
};

export const checkOut = async (req: Request, res: Response): Promise<Response> => {
  const context = await teacherContext(req);
  const settings = await effectiveSettings(context.organizationId);
  requireConfigured(settings);
  if (!settings.checkOutEnabled) throw new BadRequestError('Check-out is disabled for this organization');

  const { date } = currentAttendanceDay(settings);
  const record = await StaffAttendance.findOne({
    organizationId: context.organizationId,
    user: context.userId,
    date,
  });
  if (!record?.checkInAt) throw new BadRequestError('You must check in before checking out');
  if (record.checkOutAt) throw new ConflictError('You are already checked out today');

  const location = verifyLocation(settings, req.body?.location);
  const actions = verifyLiveness(
    settings,
    req.body?.challengeToken,
    req.body?.liveness,
    context.userId,
    context.organizationId
  );
  const faceDistance = await verifyFace(
    context.userId,
    context.organizationId,
    req.body?.descriptor,
    settings.faceMatchThreshold
  );

  const now = new Date();
  const updated = await StaffAttendance.findOneAndUpdate(
    { _id: record._id, $or: [{ checkOutAt: { $exists: false } }, { checkOutAt: null }] },
    {
      $set: {
        checkOutAt: now,
        checkOutVerification: verificationAudit(
          location,
          faceDistance,
          actions,
          req.body?.device,
          settings.requireLiveness
        ),
        markedAt: now,
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) throw new ConflictError('You are already checked out today');
  await recordSuccessfulFaceVerification(context.userId, context.organizationId);

  return ApiResponse.success(res, updated, 'Attendance check-out verified and recorded');
};
