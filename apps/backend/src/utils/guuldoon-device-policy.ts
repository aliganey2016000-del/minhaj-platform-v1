import GuuldoonDevicePolicy from '../models/guuldoon-device-policy.model';

export interface DevicePolicy {
  deviceLimit: number;
  windowHours: number;
  blockHours: number;
}

export const DEFAULT_DEVICE_POLICY: DevicePolicy = { deviceLimit: 3, windowHours: 24, blockHours: 24 };

const CACHE_TTL_MS = 30_000;
let cached: { at: number; value: DevicePolicy } | null = null;

/** Current device rule. Cached briefly; falls back to the defaults if none was saved. */
export async function getDevicePolicy(): Promise<DevicePolicy> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const row = await GuuldoonDevicePolicy.findOne({ key: 'default' }).lean();
  const value: DevicePolicy = {
    deviceLimit: row?.deviceLimit ?? DEFAULT_DEVICE_POLICY.deviceLimit,
    windowHours: row?.windowHours ?? DEFAULT_DEVICE_POLICY.windowHours,
    blockHours: row?.blockHours ?? DEFAULT_DEVICE_POLICY.blockHours,
  };
  cached = { at: Date.now(), value };
  return value;
}

export function clearDevicePolicyCache() {
  cached = null;
}
