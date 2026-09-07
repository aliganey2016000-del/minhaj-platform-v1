/**
 * Institution-type helpers — frontend mirror of
 * apps/backend/src/utils/academic-config.ts's resolveInstitutionType /
 * isHigherEdInstitutionType.
 *
 * Single source of truth for reading an organization's institution type on
 * the frontend. Always read `institutionType` through `resolveInstitutionType`
 * rather than accessing `.institutionType` directly, since a pre-migration
 * organization document may still only carry the legacy `organizationType`
 * field (or neither).
 */

export type InstitutionType = 'school' | 'college' | 'university' | 'training_center';

export const INSTITUTION_TYPES: InstitutionType[] = ['school', 'college', 'university', 'training_center'];

const LEGACY_ORG_TYPE_TO_INSTITUTION_TYPE: Record<string, InstitutionType> = {
  school: 'school',
  university: 'university',
  training_center: 'training_center',
  private: 'school',
};

export interface OrgLike {
  institutionType?: string | null;
  organizationType?: string | null;
}

export function resolveInstitutionType(org: OrgLike | null | undefined): InstitutionType {
  if (!org) return 'school';
  if (org.institutionType && (INSTITUTION_TYPES as string[]).includes(org.institutionType)) {
    return org.institutionType as InstitutionType;
  }
  if (org.organizationType && LEGACY_ORG_TYPE_TO_INSTITUTION_TYPE[org.organizationType]) {
    return LEGACY_ORG_TYPE_TO_INSTITUTION_TYPE[org.organizationType];
  }
  return 'school';
}

/** University/College — Faculty/Department/Program, studyYear + semester progression. */
export function isHigherEdInstitutionType(type: InstitutionType): boolean {
  return type === 'university' || type === 'college';
}

export function isSchool(type: InstitutionType): boolean {
  return type === 'school';
}

export function isCollege(type: InstitutionType): boolean {
  return type === 'college';
}

export function isUniversity(type: InstitutionType): boolean {
  return type === 'university';
}

export function isTrainingCenter(type: InstitutionType): boolean {
  return type === 'training_center';
}

export const institutionTypeLabel = (type: InstitutionType): string =>
  ({ school: 'School', college: 'College', university: 'University', training_center: 'Training Center' }[type]);
