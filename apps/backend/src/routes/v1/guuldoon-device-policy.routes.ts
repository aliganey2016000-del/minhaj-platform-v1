import { Router } from 'express';
import GuuldoonDevicePolicy from '../../models/guuldoon-device-policy.model';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError, ForbiddenError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';
import { clearDevicePolicyCache, DEFAULT_DEVICE_POLICY, getDevicePolicy } from '../../utils/guuldoon-device-policy';

const router = Router();

router.use((req, _res, next) =>
  req.user?.role === 'admin' && !req.user.isStaff
    ? next()
    : next(new ForbiddenError('Super Admin access required')),
);

router.get('/', asyncHandler(async (_req, res) => {
  return ApiResponse.success(res, { ...(await getDevicePolicy()), defaults: DEFAULT_DEVICE_POLICY });
}));

function whole(value: unknown, label: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequestError(`${label} must be a whole number from ${min} to ${max}`);
  return n;
}

router.put('/', asyncHandler(async (req, res) => {
  const deviceLimit = whole(req.body.deviceLimit, 'Device limit', 2, 10);
  const windowHours = whole(req.body.windowHours, 'Window (hours)', 1, 168);
  const blockHours = whole(req.body.blockHours, 'Block length (hours)', 1, 168);
  await GuuldoonDevicePolicy.findOneAndUpdate(
    { key: 'default' },
    { $set: { deviceLimit, windowHours, blockHours, updatedBy: req.user!.userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  clearDevicePolicyCache();
  return ApiResponse.success(res, { deviceLimit, windowHours, blockHours, defaults: DEFAULT_DEVICE_POLICY }, 'Device rule saved');
}));

export default router;
