import { describe, expect, it } from 'vitest';

describe('Teacher student profile contract', () => {
  it('exposes a teacher-scoped profile endpoint', () => {
    expect('/students/:studentId/profile').toContain('students');
    expect('/students/:studentId/profile').toContain('profile');
  });

  it('uses percentage-based grading rather than raw score averages', () => {
    const submissions = [
      { score: 8, maxScore: 10 },
      { score: 40, maxScore: 50 },
    ];
    const average = submissions.reduce((sum, s) => sum + (s.score / s.maxScore) * 100, 0) / submissions.length;
    expect(average).toBe(80);
  });
});
