import mongoose, { Schema, Document } from 'mongoose';
import type { InstitutionType } from '../utils/academic-config';

export type RegistrationStatus = 'draft' | 'submitted' | 'admitted' | 'rejected';

export interface IStudentRegistration extends Document {
  student: mongoose.Types.ObjectId;
  school: mongoose.Types.ObjectId;
  organizationType: InstitutionType;
  registrationNumber?: string;
  applicationDate: Date;
  admissionDate?: Date;
  academicYear?: string;
  program?: mongoose.Types.ObjectId;
  department?: mongoose.Types.ObjectId;
  faculty?: mongoose.Types.ObjectId;
  class?: mongoose.Types.ObjectId;
  intake?: string;
  admissionType?: string;
  previousInstitution?: string;
  previousQualification?: string;
  graduationYear?: number;
  applicationStatus: RegistrationStatus;
  notes?: string;
  metadata: Record<string, unknown>;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const studentRegistrationSchema = new Schema<IStudentRegistration>({
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, unique: true, index: true },
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  organizationType: { type: String, enum: ['university', 'college', 'school', 'training_center'], required: true },
  // Registration numbers are optional for the normal Add Student flow.
  // `null` is intentionally NOT used here: a sparse unique index still
  // indexes an explicitly-null field, which meant the first student with no
  // registration number blocked every later student in the same school.
  registrationNumber: { type: String, trim: true, maxlength: 100, default: undefined },
  applicationDate: { type: Date, default: Date.now },
  admissionDate: { type: Date, default: null },
  academicYear: { type: String, trim: true, maxlength: 30, default: null },
  program: { type: Schema.Types.ObjectId, ref: 'Program', default: null },
  department: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
  faculty: { type: Schema.Types.ObjectId, ref: 'Faculty', default: null },
  class: { type: Schema.Types.ObjectId, ref: 'Class', default: null },
  intake: { type: String, trim: true, maxlength: 100, default: null },
  admissionType: { type: String, trim: true, maxlength: 100, default: null },
  previousInstitution: { type: String, trim: true, maxlength: 200, default: null },
  previousQualification: { type: String, trim: true, maxlength: 200, default: null },
  graduationYear: { type: Number, min: 1900, max: 2200, default: null },
  applicationStatus: { type: String, enum: ['draft', 'submitted', 'admitted', 'rejected'], default: 'draft', index: true },
  notes: { type: String, trim: true, maxlength: 2000, default: null },
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } });

// Only actual registration-number strings participate in uniqueness. Empty
// Add Student submissions therefore may create one registration document per
// student without colliding on a shared null value.
studentRegistrationSchema.index(
  { school: 1, registrationNumber: 1 },
  {
    unique: true,
    name: 'school_registrationNumber_unique',
    partialFilterExpression: { registrationNumber: { $type: 'string' } },
  },
);

export default mongoose.model<IStudentRegistration>('StudentRegistration', studentRegistrationSchema);
