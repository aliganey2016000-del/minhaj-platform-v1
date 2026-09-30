import crypto from 'crypto';

export type LivenessAction = 'blink' | 'turn_left' | 'turn_right';

export interface LivenessMetrics {
  sampleCount: number;
  durationMs: number;
  blinkScore: number;
  turnScore: number;
  facePresenceRatio?: number;
}

interface ChallengePayload {
  userId: string;
  organizationId: string;
  actions: LivenessAction[];
  nonce: string;
  expiresAt: number;
}

const FACE_DESCRIPTOR_LENGTH = 128;
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

function secretMaterial(): string {
  const value = process.env.BIOMETRIC_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET;
  if (!value) throw new Error('BIOMETRIC_ENCRYPTION_KEY or JWT_ACCESS_SECRET must be configured');
  return value;
}

function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(secretMaterial()).digest();
}

function challengeKey(): Buffer {
  return crypto.createHmac('sha256', encryptionKey()).update('teacher-attendance-liveness-v1').digest();
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function parseBase64url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export function validateDescriptor(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== FACE_DESCRIPTOR_LENGTH) {
    throw new Error('Face descriptor must contain exactly 128 values');
  }
  const descriptor = value.map(Number);
  if (descriptor.some((item) => !Number.isFinite(item) || Math.abs(item) > 10)) {
    throw new Error('Face descriptor contains invalid values');
  }
  return descriptor;
}

export function encryptDescriptor(descriptor: number[]): {
  descriptorCiphertext: string;
  descriptorIv: string;
  descriptorAuthTag: string;
} {
  const validated = validateDescriptor(descriptor);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(validated), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    descriptorCiphertext: encrypted.toString('base64'),
    descriptorIv: iv.toString('base64'),
    descriptorAuthTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptDescriptor(record: {
  descriptorCiphertext: string;
  descriptorIv: string;
  descriptorAuthTag: string;
}): number[] {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(record.descriptorIv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(record.descriptorAuthTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.descriptorCiphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return validateDescriptor(JSON.parse(plaintext));
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = a[index] - b[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

export function haversineDistanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const latDelta = toRadians(latitude2 - latitude1);
  const lonDelta = toRadians(longitude2 - longitude1);
  const lat1 = toRadians(latitude1);
  const lat2 = toRadians(latitude2);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lonDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function createLivenessChallenge(userId: string, organizationId: string): {
  token: string;
  actions: LivenessAction[];
  expiresInSeconds: number;
} {
  const turn: LivenessAction = crypto.randomInt(0, 2) === 0 ? 'turn_left' : 'turn_right';
  const actions: LivenessAction[] = ['blink', turn];
  const payload: ChallengePayload = {
    userId,
    organizationId,
    actions,
    nonce: crypto.randomBytes(16).toString('hex'),
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', challengeKey()).update(encodedPayload).digest();
  return {
    token: encodedPayload + '.' + signature.toString('base64url'),
    actions,
    expiresInSeconds: Math.floor(CHALLENGE_TTL_MS / 1000),
  };
}

export function verifyLivenessChallenge(
  token: unknown,
  userId: string,
  organizationId: string
): ChallengePayload {
  if (typeof token !== 'string' || !token.includes('.')) throw new Error('Liveness challenge is missing');
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) throw new Error('Liveness challenge is invalid');
  const expected = crypto.createHmac('sha256', challengeKey()).update(encodedPayload).digest();
  const actual = parseBase64url(encodedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('Liveness challenge signature is invalid');
  }
  let payload: ChallengePayload;
  try {
    payload = JSON.parse(parseBase64url(encodedPayload).toString('utf8')) as ChallengePayload;
  } catch {
    throw new Error('Liveness challenge payload is invalid');
  }
  if (payload.userId !== userId || payload.organizationId !== organizationId) {
    throw new Error('Liveness challenge belongs to another account');
  }
  if (!Array.isArray(payload.actions) || payload.actions.length < 2) {
    throw new Error('Liveness challenge actions are invalid');
  }
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < Date.now()) {
    throw new Error('Liveness challenge expired. Please try again');
  }
  return payload;
}

export function livenessFailure(
  actions: LivenessAction[],
  value: unknown
): string | null {
  const metrics = (value || {}) as Partial<LivenessMetrics>;
  const sampleCount = Number(metrics.sampleCount);
  const durationMs = Number(metrics.durationMs);
  const blinkScore = Number(metrics.blinkScore);
  const turnScore = Number(metrics.turnScore);
  const facePresenceRatio = metrics.facePresenceRatio === undefined ? 1 : Number(metrics.facePresenceRatio);

  if (!Number.isFinite(sampleCount) || sampleCount < 8) return 'Keep your face visible in the camera and try again';
  if (!Number.isFinite(durationMs) || durationMs < 1200 || durationMs > 20000) return 'Liveness scan duration was invalid';
  if (!Number.isFinite(facePresenceRatio) || facePresenceRatio < 0.65 || facePresenceRatio > 1.01) {
    return 'Your face was not continuously visible during verification';
  }
  if (actions.includes('blink') && (!Number.isFinite(blinkScore) || blinkScore < 0.025)) {
    return 'Blink was not detected. Blink naturally and try again';
  }
  if (
    (actions.includes('turn_left') || actions.includes('turn_right')) &&
    (!Number.isFinite(turnScore) || turnScore < 0.07)
  ) {
    return 'Head movement was not detected. Follow the turn instruction and try again';
  }
  return null;
}

export function dateLabelInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return part('year') + '-' + part('month') + '-' + part('day');
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}
