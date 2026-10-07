import { Router, Request } from 'express';
import { createHash, createHmac, randomBytes, randomInt } from 'crypto';
import Device from '../../models/guuldoon-device.model';
import User from '../../models/user.model';
import { sendGuuldoonOtp } from '../../services/email.service';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { ApiError, BadRequestError, ConflictError, ForbiddenError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';
const router = Router();
const cookie = 'guuldoon_device';
const day = 86400000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function deviceHash(req: Request) {
  const value = req.cookies?.[cookie];
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? digest(value) : '';
}
function otpDigest(code: string, user: string, hash: string) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new ApiError(503, 'Device verification unavailable');
  return createHmac('sha256', secret).update(`${user}:${hash}:${code}`).digest('hex');
}
router.use((req, _res, next) => req.user?.role === 'student' && !req.user.isStaff ? next() : next(new ForbiddenError('Student access required')));
async function state(user: string) {
  try { return await Device.findOneAndUpdate({ user }, { $setOnInsert: { user } }, { upsert: true, new: true, setDefaultsOnInsert: true }); }
  catch (error: any) { if (error.code === 11000) return (await Device.findOne({ user }))!; throw error; }
}
router.get('/', asyncHandler(async (req, res) => {
  const row = await Device.findOne({ user: req.user!.userId });
  const blocked = !!row?.blockedUntil && row.blockedUntil.getTime() > Date.now();
  return ApiResponse.success(res, { verified: !blocked && !!deviceHash(req) && row?.activeHash === deviceHash(req), registered: !!row?.activeHash, activatedAt: row?.activatedAt, blockedUntil: blocked ? row?.blockedUntil : null });
}));
router.post('/request', asyncHandler(async (req, res) => {
  const user = req.user!.userId;
  const row = await state(user);
  const now = Date.now();
  if (row.blockedUntil && row.blockedUntil.getTime() > now) throw new ApiError(423, 'Guuldoon is blocked for 24 hours');
  if (row.sentAt && now - row.sentAt.getTime() < 60000) throw new ApiError(429, 'Wait one minute before requesting another code');
  const fresh = !row.sendWindow || now - row.sendWindow.getTime() >= 3600000;
  if (!fresh && row.sends >= 5) throw new ApiError(429, 'Too many codes requested. Try again later');
  let hash = deviceHash(req);
  if (!hash) { const value = randomBytes(32).toString('hex'); hash = digest(value); res.cookie(cookie, value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/api/v1/guuldoon', maxAge: 365 * day }); }
  const code = String(randomInt(100000, 1000000));
  const codeHash = otpDigest(code, user, hash);
  const updated = await Device.findOneAndUpdate({ _id: row._id, revision: row.revision }, { $set: { pendingHash: hash, otpHash: codeHash, otpExpiresAt: new Date(now + 600000), attempts: 0, sentAt: new Date(now), sendWindow: fresh ? new Date(now) : row.sendWindow, sends: fresh ? 1 : row.sends + 1 }, $inc: { revision: 1 } }, { new: true });
  if (!updated) throw new ConflictError('Another request is in progress. Retry');
  const account = await User.findById(user).select('email').lean();
  try { if (!account?.email) throw new Error('Email unavailable'); await sendGuuldoonOtp(account.email, code); }
  catch { await Device.updateOne({ _id: row._id, otpHash: codeHash }, { $unset: { otpHash: 1, pendingHash: 1, otpExpiresAt: 1 } }); throw new ApiError(503, 'Unable to deliver verification email. Please contact support'); }
  return ApiResponse.success(res, { expiresIn: 600 }, 'Code sent to your account email');
}));
router.post('/verify', asyncHandler(async (req, res) => {
  if (typeof req.body.code !== 'string' || !/^\d{6}$/.test(req.body.code)) throw new BadRequestError('Enter the six digit code');
  const user = req.user!.userId;
  const hash = deviceHash(req);
  const row = await Device.findOne({ user });
  const now = Date.now();
  if (row?.blockedUntil && row.blockedUntil.getTime() > now) throw new ApiError(423, 'Guuldoon is blocked for 24 hours');
  if (!hash || !row || row.pendingHash !== hash || !row.otpExpiresAt || row.otpExpiresAt.getTime() <= now || row.attempts >= 5 || !row.otpHash) throw new BadRequestError('Code expired or unavailable. Request a new code');
  const match = row.otpHash === otpDigest(req.body.code, user, hash);
  const history = row.history.filter(item => item.at && item.at.getTime() > now - day).map(item => ({ hash: item.hash!, at: item.at! }));
  if (match && !history.some(item => item.hash === hash)) history.push({ hash, at: new Date(now) });
  const blocked = match && history.length >= 3;
  const update = match ? { $set: { history, activeHash: blocked ? '' : hash, activatedAt: new Date(now), blockedUntil: blocked ? new Date(now + day) : null }, $unset: { otpHash: 1, pendingHash: 1, otpExpiresAt: 1 }, $inc: { revision: 1 } } : { $inc: { attempts: 1, revision: 1 } };
  const saved = await Device.findOneAndUpdate({ _id: row._id, revision: row.revision }, update);
  if (!saved) throw new ConflictError('Verification changed. Retry');
  if (!match) throw new BadRequestError('Incorrect code');
  if (blocked) throw new ApiError(423, 'Three devices verified within 24 hours. Guuldoon is blocked for 24 hours');
  return ApiResponse.success(res, { verified: true }, 'Device verified. Previous Guuldoon device disconnected');
}));
/** Use only on Guuldoon learning routes; school authentication stays independent. */
export async function requireGuuldoonDevice(req: Request): Promise<void> {
  const row = await Device.findOne({ user: req.user!.userId }).lean();
  if (!deviceHash(req) || !row || row.activeHash !== deviceHash(req) || (row.blockedUntil && row.blockedUntil.getTime() > Date.now())) throw new ForbiddenError('Verify this Guuldoon device before learning');
}
router.get('/access', asyncHandler(async (req, res) => { await requireGuuldoonDevice(req); return ApiResponse.success(res, { verified: true }); }));
export default router;
