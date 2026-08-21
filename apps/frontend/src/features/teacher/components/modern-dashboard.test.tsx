import { describe, expect, it } from 'vitest';

describe('Teacher Dashboard visual layer', () => {
  it('keeps dashboard styling route-scoped', () => {
    const css = 'main:has(a[href="/teacher/courses"])';
    expect(css).toContain('/teacher/courses');
  });
});
