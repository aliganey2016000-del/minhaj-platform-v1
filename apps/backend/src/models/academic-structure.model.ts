import mongoose, { Schema, Document } from 'mongoose';

export type AcademicSystem = 'annual' | 'semester';

export interface IAcademicStructure extends Document {
  school: mongoose.Types.ObjectId;
  academicSystem: AcademicSystem;
  semestersPerAcademicYear: 1 | 2 | 3;
  /** Whether this org's hierarchy has a Faculty layer above Department.
   * Historically hardcoded to "organizationType === 'university'" at each
   * call site (department/faculty controllers, academic-class middleware);
   * now an explicit per-org setting so a College can opt in without being
   * misclassified as a University, and a University can be created without
   * assuming every one of them uses Faculties. */
  usesFaculty: boolean;
  lastSemesterAdvanceAt?: Date;
  lastSemesterAdvanceKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const academicStructureSchema = new Schema<IAcademicStructure>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, unique: true, index: true },
    academicSystem: { type: String, enum: ['annual', 'semester'], default: 'annual' },
    semestersPerAcademicYear: { type: Number, enum: [1, 2, 3], default: 1 },
    usesFaculty: { type: Boolean, default: false },
    lastSemesterAdvanceAt: { type: Date, default: null, index: true },
    lastSemesterAdvanceKey: { type: String, default: null },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } },
);

academicStructureSchema.pre('validate', function (next) {
  if (this.academicSystem === 'annual') this.semestersPerAcademicYear = 1;
  if (this.academicSystem === 'semester' && ![2, 3].includes(this.semestersPerAcademicYear)) {
    this.invalidate('semestersPerAcademicYear', 'Semester-based institutions must use 2 or 3 semesters per academic year.');
  }
  next();
});

export default mongoose.model<IAcademicStructure>('AcademicStructure', academicStructureSchema);
