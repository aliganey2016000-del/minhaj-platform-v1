/**
 * Shared target-class resolution for student promotion.
 *
 * Classes (Grade 1 A, Grade 2 A, ...) are persistent containers: the same
 * Class document is reused every academic year, so promotion never clones a
 * Class or its Courses, and never marks a Class "completed". Only students
 * move — their `class` pointer changes and the move is recorded in
 * `enrollmentHistory` (see enrollment.service.ts). A missing target class is
 * a stop-and-report condition, never an auto-create: the admin prepares the
 * class in Manage Classes first, so nothing gets created that they didn't
 * explicitly ask for.
 *
 * Both promotion controllers (the bulk "promote-all" flow and the per-
 * student "promote-reviewed" flow) share this module instead of each
 * keeping its own copy — the duplicated copies are exactly what caused the
 * class/course duplication this module replaces.
 */

import mongoose from 'mongoose';
import ClassModel, { IClass } from '../models/class.model';

export interface TargetClassQuery {
  schoolId: string;
  gradeLevel: number;
  section?: string;
}

export interface MissingTarget {
  gradeLevel: number;
  title: string;
  section?: string;
  message: string;
}

/**
 * Finds the persistent, active class a group of students should move into.
 * Never creates one. Matches on (school, gradeLevel, section) only — NOT
 * department and NOT batch.
 *
 * Department is deliberately excluded: a school's departments are
 * themselves grade-bounded (e.g. Primary covers grades 1-8, Secondary
 * covers 9-12), so the grade that follows a source class can — and
 * routinely does — belong to a different department than the source
 * (Grade 8 in Primary promotes into Grade 9 in Secondary). Requiring the
 * target's department to match the source's would make that ordinary,
 * already-existing target class unfindable and wrongly report it as
 * missing. gradeLevel (plus section) already identifies the right class
 * within the school without it.
 *
 * batch is excluded because it is an entry-cohort label ("the year this
 * class's current group started"), so Grade 9's batch and Grade 10's batch
 * are naturally different even when Grade 10 is exactly the right target
 * for a promoting Grade 9 student. Requiring it to match would make the
 * correct, already-existing target class unfindable.
 */
export async function findPersistentTargetClass(
  query: TargetClassQuery,
): Promise<mongoose.HydratedDocument<IClass> | null> {
  const filter: Record<string, unknown> = {
    school: query.schoolId,
    gradeLevel: query.gradeLevel,
    status: 'active',
  };
  if (query.section) filter.section = query.section;
  return ClassModel.findOne(filter).sort({ createdAt: 1 });
}

/** Grade bounds among a set of classes, used to infer entry/final grade when not explicitly flagged. */
function gradeBounds(classes: Array<{ gradeLevel?: number | null }>) {
  const grades = classes
    .map((item) => item.gradeLevel)
    .filter((grade): grade is number => typeof grade === 'number' && Number.isFinite(grade));
  const unique = [...new Set(grades)];
  return {
    min: unique.length ? Math.min(...unique) : null,
    max: unique.length ? Math.max(...unique) : null,
    distinctCount: unique.length,
  };
}

/**
 * Shared final-grade classifier for a school's active classes: explicit
 * `isGraduatingGrade` wins; otherwise, when grades span more than one
 * level, the highest gradeLevel present is inferred as final.
 */
export function classifyClasses(classes: Array<{ gradeLevel?: number | null; isGraduatingGrade?: boolean }>) {
  const bounds = gradeBounds(classes);
  const canInferBounds = bounds.distinctCount > 1;
  const hasExplicitFinal = classes.some((item) => !!item.isGraduatingGrade);
  const isFinalClass = (cls: { gradeLevel?: number | null; isGraduatingGrade?: boolean }) =>
    !!cls.isGraduatingGrade || (!hasExplicitFinal && canInferBounds && bounds.max !== null && cls.gradeLevel === bounds.max);
  return { isFinalClass, bounds };
}

/** Builds the actionable "go create this class first" description for a missing target. */
export function describeMissingTarget(
  source: { title: string; section?: string },
  gradeLevel: number,
): MissingTarget {
  const sourceLabel = `${source.title}${source.section ? ` ${source.section}` : ''}`;
  const targetLabel = `Grade ${gradeLevel}${source.section ? ` ${source.section}` : ''}`;
  return {
    gradeLevel,
    title: `Grade ${gradeLevel}`,
    section: source.section || undefined,
    message: `No active "${targetLabel}" class exists yet. Create it in Manage Classes before promoting ${sourceLabel} — it will not be created automatically.`,
  };
}
