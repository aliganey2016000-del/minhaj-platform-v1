/**
 * Academic Configuration — shared institution/academic-model helpers
 *
 * Single source of truth for:
 *  - resolving an org's InstitutionType (new field, with legacy
 *    `organizationType` fallback for documents written before this field
 *    existed — see school.model.ts's pre-validate backfill hook for the
 *    write-path equivalent of this same fallback)
 *  - the sensible per-institution-type defaults used both at registration
 *    time and by the lazy get-or-create in academic-structure.controller.ts
 *  - the annual/semester validation rule (was previously duplicated inline
 *    in academic-structure.controller.ts's updateStructure)
 *
 * Reused by: school.controller.ts (registration), academic-structure.controller.ts,
 * department.controller.ts, faculty.controller.ts, academic-class.middleware.ts.
 */

import { BadRequestError } from './api-error';
import type { AcademicSystem } from '../models/academic-structure.model';

export type InstitutionType = 'school' | 'college' | 'university' | 'training_center';
export type OwnershipType = 'public' | 'private' | 'nonprofit' | 'other';

export const INSTITUTION_TYPES: InstitutionType[] = ['school', 'college', 'university', 'training_center'];
export const OWNERSHIP_TYPES: OwnershipType[] = ['public', 'private', 'nonprofit', 'other'];

/** Legacy `organizationType` values (pre-dating the institutionType/ownershipType
 * split) mapped onto the new InstitutionType. 'private' was overloaded to mean
 * both "ownership: private" and a catch-all generic org — it maps to 'school'
 * here since that was always the de-facto shape of every 'private' org that
 * existed before this field split (see school.model.ts backfill hook). */
const LEGACY_ORG_TYPE_TO_INSTITUTION_TYPE: Record<string, InstitutionType> = {
  school: 'school',
  university: 'university',
  training_center: 'training_center',
  private: 'school',
};

/** Resolves the effective institution type for a School document/lean-object,
 * whether or not it has been migrated to the new field yet. Prefer this over
 * reading `.institutionType` directly anywhere business logic branches on
 * institution type, since a `.lean()` read of a pre-migration document will
 * have `institutionType` as `undefined`. */
export function resolveInstitutionType(school: { institutionType?: string | null; organizationType?: string | null }): InstitutionType {
  if (school.institutionType && INSTITUTION_TYPES.includes(school.institutionType as InstitutionType)) {
    return school.institutionType as InstitutionType;
  }
  if (school.organizationType && LEGACY_ORG_TYPE_TO_INSTITUTION_TYPE[school.organizationType]) {
    return LEGACY_ORG_TYPE_TO_INSTITUTION_TYPE[school.organizationType];
  }
  return 'school';
}

/** Institution types whose Class hierarchy is naturally academic-year/semester
 * shaped (Faculty/Department/Program, studyYear + semesterNumber progression) —
 * as opposed to School's grade/section model or Training Center's batch model. */
export function isHigherEdInstitutionType(institutionType: InstitutionType): boolean {
  return institutionType === 'university' || institutionType === 'college';
}

export interface AcademicConfigDefaults {
  academicSystem: AcademicSystem;
  semestersPerAcademicYear: 1 | 2 | 3;
  usesFaculty: boolean;
}

/** Sensible per-institution-type defaults — a starting point the org can
 * reconfigure during onboarding or later from Settings, never a hard limit. */
export function defaultAcademicConfig(institutionType: InstitutionType): AcademicConfigDefaults {
  if (institutionType === 'university') {
    return { academicSystem: 'semester', semestersPerAcademicYear: 2, usesFaculty: true };
  }
  if (institutionType === 'college') {
    return { academicSystem: 'semester', semestersPerAcademicYear: 2, usesFaculty: false };
  }
  // school, training_center
  return { academicSystem: 'annual', semestersPerAcademicYear: 1, usesFaculty: false };
}

/** Validates an academicSystem/semestersPerAcademicYear pair, optionally
 * against a specific institution type. Throws BadRequestError on:
 *  - an impossible combination (annual can't carry semester config; semester
 *    must be 2 or 3) — mirrors the invariant already enforced at the schema
 *    level (academic-structure.model.ts's pre-validate hook) so callers get a
 *    clear 400 before that hook would otherwise reject the save.
 *  - a `semester` academicSystem requested for an institution type that
 *    doesn't support it: School and Training Center have no semester
 *    workflow anywhere in the product (no semester-aware Class/Student UI,
 *    no Faculty/Department/Program hierarchy to hang a semester on) — the
 *    schema itself would happily accept `academicSystem: 'semester'` on a
 *    School's AcademicStructure document, but the resulting classes/students
 *    would have no semester UI to progress them through, so it's rejected
 *    here rather than allowed to be silently stored and then be a dead
 *    feature. Only University/College may use `semester`. Pass no
 *    institutionType to skip this check (callers that don't yet know it). */
export function validateAcademicConfig(academicSystem: unknown, semestersPerAcademicYear: unknown, institutionType?: InstitutionType): void {
  if (academicSystem !== 'annual' && academicSystem !== 'semester') {
    throw new BadRequestError('Academic system must be "annual" or "semester"');
  }
  if (academicSystem === 'semester' && ![2, 3].includes(Number(semestersPerAcademicYear))) {
    throw new BadRequestError('Semester-based institutions must use 2 or 3 semesters per academic year');
  }
  if (academicSystem === 'semester' && institutionType && !isHigherEdInstitutionType(institutionType)) {
    throw new BadRequestError('Semester-based academic system is only supported for University and College organizations. School and Training Center must use "annual".');
  }
}
