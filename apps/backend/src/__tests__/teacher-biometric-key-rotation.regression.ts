import assert from 'node:assert/strict';
import {
  decryptDescriptorWithMetadata,
  encryptDescriptor,
} from '../utils/teacher-biometric';

const descriptor = Array.from({ length: 128 }, (_, index) => index / 1000);

delete process.env.BIOMETRIC_ENCRYPTION_KEY;
delete process.env.BIOMETRIC_PREVIOUS_ENCRYPTION_KEYS;
process.env.JWT_ACCESS_SECRET = 'legacy-biometric-key';
const legacyEncrypted = encryptDescriptor(descriptor);

process.env.BIOMETRIC_ENCRYPTION_KEY = 'stable-dedicated-biometric-key';
const legacyDecrypted = decryptDescriptorWithMetadata(legacyEncrypted);
assert.deepEqual(legacyDecrypted.descriptor, descriptor);
assert.equal(legacyDecrypted.needsReencryption, true);

const migrated = encryptDescriptor(legacyDecrypted.descriptor);
process.env.JWT_ACCESS_SECRET = 'rotated-jwt-secret';
const migratedDecrypted = decryptDescriptorWithMetadata(migrated);
assert.deepEqual(migratedDecrypted.descriptor, descriptor);
assert.equal(migratedDecrypted.needsReencryption, false);

process.env.BIOMETRIC_ENCRYPTION_KEY = 'next-biometric-key';
process.env.BIOMETRIC_PREVIOUS_ENCRYPTION_KEYS = 'stable-dedicated-biometric-key';
const previousKeyDecrypted = decryptDescriptorWithMetadata(migrated);
assert.deepEqual(previousKeyDecrypted.descriptor, descriptor);
assert.equal(previousKeyDecrypted.needsReencryption, true);

console.log('PASS: legacy JWT fallback, dedicated biometric key, JWT rotation and previous-key rotation');
