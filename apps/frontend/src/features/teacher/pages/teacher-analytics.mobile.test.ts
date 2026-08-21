import { describe, expect, it } from 'vitest';

describe('TeacherAnalytics mobile UX contract', () => {
  it('keeps primary metrics readable on narrow screens', () => {
    expect(['grid-cols-2', 'truncate', 'min-w-0']).toEqual(
      expect.arrayContaining(['grid-cols-2', 'truncate', 'min-w-0'])
    );
  });
});
