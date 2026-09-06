import mongoose, { Schema, Document } from 'mongoose';

export type AcademicSystem = 'annual' | 'semester';

export interface IAcademicStructure extends Document {
  school: mongoose.Types.ObjectId;
  academicSystem: AcademicSystem;
  semestersPerAcademicYear: 1 | 2 | 3;
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
