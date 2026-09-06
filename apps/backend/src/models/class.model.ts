import mongoose, { Schema, Document } from 'mongoose';

export interface IClass extends Document {
  school: mongoose.Types.ObjectId;
  /** Required for schools and higher-ed (university/college); optional for a
   * training center, which may organize purely by Program with no
   * Department layer at all — enforced per-type in academic-class.middleware.ts. */
  department?: mongoose.Types.ObjectId;
  /** Optional grouping above this Cohort/Batch (Department → Program →
   * Cohort/Class for college/university; top-level for a training center,
   * which commonly has no department). Unset for schools. */
  program?: mongoose.Types.ObjectId;
  title: string;
  section?: string;
  room: string;
  /** Maximum enrollable students/learners. Optional — unlimited if unset. */
  capacity?: number;
  shiftMode: 'Morning' | 'Afternoon' | 'Evening' | 'Virtual';
  course?: mongoose.Types.ObjectId;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  meetingLink?: string;
  teacher?: mongoose.Types.ObjectId;
  status: 'active' | 'inactive' | 'completed';
  batch?: string;
  gradeLevel?: number;
  academicYear?: string;
  studyYear?: number;
  semesterNumber?: number;
  semesterInYear?: number;
  isGraduatingGrade?: boolean;
  isEntryGrade?: boolean;
  promotedAt?: Date;
  promotedTo?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const classSchema = new Schema<IClass>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    program: { type: Schema.Types.ObjectId, ref: 'Program', default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    section: { type: String, trim: true, maxlength: 10 },
    room: { type: String, required: true, trim: true, maxlength: 50 },
    capacity: { type: Number, min: [1, 'Capacity must be at least 1'], max: 5000, default: null },
    shiftMode: { type: String, enum: ['Morning', 'Afternoon', 'Evening', 'Virtual'], default: 'Morning' },
    course: { type: Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
    dayOfWeek: { type: Number, min: 0, max: 6, default: null },
    startTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/, default: null },
    endTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/, default: null },
    meetingLink: { type: String, default: '' },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null, index: true },
    status: { type: String, enum: ['active', 'inactive', 'completed'], default: 'active', index: true },
    batch: { type: String, trim: true, maxlength: 20, default: '', index: true },
    gradeLevel: { type: Number, min: 0, max: 30, default: null, index: true },
    academicYear: { type: String, trim: true, maxlength: 20, default: '' },
    // University progression: semesterNumber is a GLOBAL sequence (S1, S2, S3...),
    // while semesterInYear is the local position (1/2 or 1/2/3). studyYear is
    // derived from the configured semesters-per-academic-year value and stored
    // so filtering/reporting stays simple.
    studyYear: { type: Number, min: 1, max: 30, default: null, index: true },
    semesterNumber: { type: Number, min: 1, max: 100, default: null, index: true },
    semesterInYear: { type: Number, min: 1, max: 3, default: null },
    isGraduatingGrade: { type: Boolean, default: false },
    isEntryGrade: { type: Boolean, default: false },
    promotedAt: { type: Date, default: null },
    promotedTo: { type: Schema.Types.ObjectId, ref: 'Class', default: null },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

classSchema.index({ school: 1, academicYear: 1, studyYear: 1, semesterNumber: 1 });

const ClassModel = mongoose.model<IClass>('Class', classSchema);
export default ClassModel;
