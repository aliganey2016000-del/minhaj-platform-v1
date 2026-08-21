import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('teacher grading data-integrity contract', () => {
  const middleware = readFileSync(
    resolve(__dirname, '../middleware/teacher-grading-validation.middleware.ts'),
    'utf8',
  );

  it('rejects non-finite scores before mutation', () => {
    expect(middleware).toContain("typeof score !== 'number' || !Number.isFinite(score)");
  });

  it('bounds scores against the assignment total', () => {
    expect(middleware).toContain('score < 0 || score > assignment.totalMarks');
  });

  it('restricts grading status transitions', () => {
    expect(middleware).toContain("new Set(['graded', 'returned'])");
  });

  it('limits teacher feedback size', () => {
    expect(middleware).toContain('feedback.length > 5000');
  });
});
