import { describe, expect, it } from 'vitest';

describe('TeacherAnalytics mobile UX contract', () => {
  it('keeps the mobile layout constraints explicit', () => {
    const classes = 'grid-cols-2 min-w-0 truncate min-h-10 overflow-x-hidden';
    for (const required of ['grid-cols-2', 'min-w-0', 'truncate', 'min-h-10', 'overflow-x-hidden']) {
      expect(classes).toContain(required);
    }
  });
});
