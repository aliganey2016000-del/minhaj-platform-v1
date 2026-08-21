import { describe, expect, it, vi } from 'vitest';

/**
 * P2.7 regression coverage for the authorization contract used by Teacher Portal.
 * These tests intentionally exercise the scope helper contract rather than
 * coupling to controller/database implementation details.
 */
describe('Teacher Portal authorization contract', () => {
  it('requires an authenticated teacher identity', async () => {
    const { getOwnTeacherRecord } = await import('../utils/tenant-scope');
    await expect(getOwnTeacherRecord({ user: undefined } as any)).rejects.toThrow();
  });

  it('does not treat a missing teacher record as authorized', async () => {
    vi.resetModules();
    const { getOwnTeacherRecord } = await import('../utils/tenant-scope');
    const result = await getOwnTeacherRecord({ user: { _id: '000000000000000000000000' } } as any);
    expect(result).toBeFalsy();
  });
});
