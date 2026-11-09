/**
 * Which master-seating allocation a request works on.
 *
 * Room Allocation opened from an exam period (e.g. MONTHLY EXAM I) is that
 * period's own allocation: rows carry `period`, and the academic year /
 * exam type are taken from the period, so the admin never picks Mid/Final
 * and the year is always the period's own spelling ("2026/27"), which is
 * what Invigilator and Attendance read back.
 *
 * Without a period the legacy academic-year + Mid/Final allocation is used
 * (rows with no `period`).
 */
import { Request } from 'express';
import mongoose from 'mongoose';
import ExamPeriod from '../models/exam-period.model';
import { BadRequestError, NotFoundError } from './api-error';
import { assertOwnOrg } from './tenant-scope';

export type SeatingExamType = 'mid' | 'final';

export interface SeatingScope {
  period: mongoose.Types.ObjectId | null;
  periodName: string;
  academicYear: string;
  examType: SeatingExamType;
  /** Organization the period belongs to (null for legacy scopes; callers apply their own org filter). */
  school: mongoose.Types.ObjectId | null;
}

const norm = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');

export function examTypeValue(value: unknown): SeatingExamType | '' {
  const x = norm(value).toLowerCase();
  if (x === 'mid' || x === 'mid exam' || x === 'midterm') return 'mid';
  if (x === 'final' || x === 'final exam') return 'final';
  return '';
}

/** Mid/Final label stored on a period's rows — only a label now that rows are period-scoped. */
export function periodExamType(period: { name?: string; term?: string } | null | undefined): SeatingExamType {
  const label = `${period?.name || ''} ${period?.term || ''}`.toLowerCase();
  return /\bfinal[a-z-]*\b/.test(label) ? 'final' : 'mid';
}

/**
 * Resolves the scope from `periodId` (preferred) or `academicYear` + `examType`.
 * Returns null when neither is provided and `required` is false.
 */
export async function resolveSeatingScope(
  req: Request,
  input: { periodId?: unknown; academicYear?: unknown; examType?: unknown },
  required = true,
): Promise<SeatingScope | null> {
  const periodId = norm(input.periodId);
  if (periodId) {
    if (!mongoose.isValidObjectId(periodId)) throw new BadRequestError('A valid Exam is required');
    const period = await ExamPeriod.findById(periodId).lean() as any;
    if (!period) throw new NotFoundError('Exam');
    assertOwnOrg(req, period, 'school');
    return {
      period: period._id,
      periodName: period.name || '',
      academicYear: norm(period.academicYear),
      examType: periodExamType(period),
      school: period.school || null,
    };
  }

  const academicYear = norm(input.academicYear);
  const examType = examTypeValue(input.examType);
  if (!academicYear || !examType) {
    if (!required) return null;
    throw new BadRequestError('Choose the Exam (or an Academic Year and Exam Type) first');
  }
  return { period: null, periodName: '', academicYear, examType, school: null };
}

/** Mongo filter for the rows of a scope (legacy scopes match rows without a period). */
export function seatingScopeFilter(scope: SeatingScope): Record<string, unknown> {
  return {
    academicYear: scope.academicYear,
    examType: scope.examType,
    period: scope.period || null,
  };
}
