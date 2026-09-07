import type { InstitutionType } from './academic-config';

export interface StudentDocumentDefault {
  code: string;
  name: string;
  category: string;
  isRequired: boolean;
  allowedMimeTypes: string[];
}

const COMMON_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export const DEFAULT_STUDENT_DOCUMENT_TYPES: Record<InstitutionType, StudentDocumentDefault[]> = {
  university: [
    { code: 'HIGH_SCHOOL_CERTIFICATE', name: 'High School Certificate', category: 'academic', isRequired: true, allowedMimeTypes: COMMON_TYPES },
    { code: 'NATIONAL_ID', name: 'National ID or Passport', category: 'identity', isRequired: true, allowedMimeTypes: COMMON_TYPES },
    { code: 'TRANSCRIPT', name: 'Academic Transcript', category: 'academic', isRequired: false, allowedMimeTypes: COMMON_TYPES },
    { code: 'APPLICATION_FORM', name: 'Application Form', category: 'application', isRequired: false, allowedMimeTypes: COMMON_TYPES },
    { code: 'OTHER_CERTIFICATE', name: 'Additional Certificate', category: 'additional', isRequired: false, allowedMimeTypes: COMMON_TYPES },
  ],
  college: [
    { code: 'HIGH_SCHOOL_CERTIFICATE', name: 'High School Certificate', category: 'academic', isRequired: true, allowedMimeTypes: COMMON_TYPES },
    { code: 'NATIONAL_ID', name: 'National ID or Passport', category: 'identity', isRequired: true, allowedMimeTypes: COMMON_TYPES },
    { code: 'TRANSCRIPT', name: 'Academic Transcript', category: 'academic', isRequired: false, allowedMimeTypes: COMMON_TYPES },
    { code: 'APPLICATION_FORM', name: 'Application Form', category: 'application', isRequired: false, allowedMimeTypes: COMMON_TYPES },
  ],
  school: [
    { code: 'BIRTH_CERTIFICATE', name: 'Birth Certificate', category: 'identity', isRequired: true, allowedMimeTypes: COMMON_TYPES },
    { code: 'PREVIOUS_SCHOOL_RECORD', name: 'Previous School Record', category: 'academic', isRequired: false, allowedMimeTypes: COMMON_TYPES },
    { code: 'TRANSFER_CERTIFICATE', name: 'Transfer Certificate', category: 'academic', isRequired: false, allowedMimeTypes: COMMON_TYPES },
    { code: 'NATIONAL_ID', name: 'National ID', category: 'identity', isRequired: false, allowedMimeTypes: COMMON_TYPES },
  ],
  training_center: [
    { code: 'NATIONAL_ID', name: 'National ID or Passport', category: 'identity', isRequired: true, allowedMimeTypes: COMMON_TYPES },
    { code: 'PREVIOUS_QUALIFICATION', name: 'Previous Qualification', category: 'academic', isRequired: false, allowedMimeTypes: COMMON_TYPES },
    { code: 'TRAINING_CERTIFICATE', name: 'Training Certificate', category: 'academic', isRequired: false, allowedMimeTypes: COMMON_TYPES },
    { code: 'APPLICATION_FORM', name: 'Application Form', category: 'application', isRequired: false, allowedMimeTypes: COMMON_TYPES },
  ],
};
