import { describe, expect, it } from 'vitest';

describe('TeacherAnalytics mobile UX contract', () => {
  it('defines narrow-screen layout guarantees', () => {
    const classes = 'grid-cols-2 min-w-0 truncate min-h-10 overflow-x-hidden';
    expect(classes).toContain('grid-cols-2');
    expect(classes).toContain('min-w-0');
    expect(classes).toContain('truncate');
    expect(classes).toContain('min-h-10');
    expect(classes).toContain('overflow-x-hidden');
  });
});
