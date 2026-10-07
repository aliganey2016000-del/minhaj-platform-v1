import { Router, Request } from 'express';
import { createHash, randomBytes } from 'crypto';
import Device from '../../models/guuldoon-device.model';
import User from '../../models/user.model';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { ApiError, BadRequestError, ConflictError, ForbiddenError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';

const router = Router();
const cookie = 'guuldoon_device';
const day = 86400000;
const passwordAttemptWindow = 15 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function deviceHash(req: Request) {
  const value = req.cookies?.[cookie];
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? digest(value) : '';
}

router.use((req, _res, next) =>
  req.user?.role === 'student' && !req.user.isStaff
    ? next()
    : next(new ForbiddenError('Student access required')),
);

async function state(user: string) {
  try {
    return await Device.findOneAndUpdate(
      { user },
      { $setOnInsert: { user } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error: any) {
    if (error.code === 11000) return (await Device.findOne({ user }))!;
    throw error;
  }
}

router.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, private, max-age=0');
  res.set('Pragma', 'no-cache');
  const row = await Device.findOne({ user: req.user!.userId });
  const hash = deviceHash(req);
  const blocked = !!row?.blockedUntil && row.blockedUntil.getTime() > Date.now();
  return ApiResponse.success(res, {
    verified: !blocked && !!hash && row?.activeHash === hash,
    registered: !!row?.activeHash,
    activatedAt: row?.activatedAt,
    blockedUntil: blocked ? row?.blockedUntil : null,
  });
}));

router.post('/verify-password', asyncHandler(async (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!password || password.length > 256) throw new BadRequestError('Enter your account password');

  const user = req.user!.userId;
  const row = await state(user);
  const now = Date.now();
  if (row.blockedUntil && row.blockedUntil.getTime() > now) {
    throw new ApiError(423, 'Guuldoon is blocked for 24 hours');
  }

  const freshAttemptWindow = !row.passwordAttemptWindow
    || now - row.passwordAttemptWindow.getTime() >= passwordAttemptWindow;
  const attempts = freshAttemptWindow ? 0 : (row.passwordAttempts || 0);
  if (attempts >= 5) {
    throw new ApiError(429, 'Too many password attempts. Try again in 15 minutes');
  }

  const account = await User.findById(user).select('+password isActive');
  if (!account || !account.isActive) throw new ForbiddenError('Active student account required');

  const passwordMatches = await account.comparePassword(password);
  if (!passwordMatches) {
    await Device.updateOne(
      { _id: row._id },
      {
        $set: {
          passwordAttempts: attempts + 1,
          passwordAttemptWindow: freshAttemptWindow ? new Date(now) : row.passwordAttemptWindow,
        },
      },
    );
    throw new BadRequestError('Password-ka waa khalad');
  }

  let hash = deviceHash(req);
  let newCookieValue = '';
  if (!hash) {
    newCookieValue = randomBytes(32).toString('hex');
    hash = digest(newCookieValue);
  }

  const history = row.history
    .filter(item => item.at && item.at.getTime() > now - day)
    .map(item => ({ hash: item.hash!, at: item.at! }));
  if (!history.some(item => item.hash === hash)) history.push({ hash, at: new Date(now) });

  const blocked = history.length >= 3;
  const saved = await Device.findOneAndUpdate(
    { _id: row._id, revision: row.revision },
    {
      $set: {
        history,
        activeHash: blocked ? '' : hash,
        activatedAt: new Date(now),
        blockedUntil: blocked ? new Date(now + day) : null,
        passwordAttempts: 0,
        passwordAttemptWindow: null,
      },
      $inc: { revision: 1 },
    },
  );

  if (!saved) throw new ConflictError('Verification changed. Retry');
  if (blocked) {
    throw new ApiError(423, 'Three devices verified within 24 hours. Guuldoon is blocked for 24 hours');
  }

  if (newCookieValue) {
    res.cookie(cookie, newCookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/guuldoon',
      maxAge: 365 * day,
    });
  }

  res.set('Cache-Control', 'no-store, private, max-age=0');
  return ApiResponse.success(
    res,
    { verified: true },
    'Device verified with your account password. Previous Guuldoon device disconnected',
  );
}));

/** Use only on Guuldoon learning routes; school authentication stays independent. */
export async function requireGuuldoonDevice(req: Request): Promise<void> {
  const row = await Device.findOne({ user: req.user!.userId }).lean();
  const hash = deviceHash(req);
  if (!hash || !row || row.activeHash !== hash || (row.blockedUntil && row.blockedUntil.getTime() > Date.now())) {
    throw new ForbiddenError('Verify this Guuldoon device before learning');
  }
}

router.get('/access', asyncHandler(async (req, res) => {
  await requireGuuldoonDevice(req);
  return ApiResponse.success(res, { verified: true });
}));

export default router;
