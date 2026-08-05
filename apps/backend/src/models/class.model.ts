import mongoose, { Schema, Document } from 'mongoose';

export interface IClass extends Document {
  school: mongoose.Types.ObjectId;
  department: mongoose.Types.ObjectId;
  title: string;
  section: string;
  room: string;
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
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    section: { type: String, required: true, trim: true, maxlength: 10 },
    room: { type: String, required: true, trim: true, maxlength: 50 },
    shiftMode: { type: String, enum: ['Morning', 'Afternoon', 'Evening', 'Virtual'], default: 'Morning' },
    course: { type: Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
    dayOfWeek: { type: Number, min: 0, max: 6, default: null },
    startTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/, default: null },
    endTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/, default: null },
    meetingLink: { type: String, default: '' },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null, index: true },
    status: { type: String, enum: ['active', 'inactive', 'completed'], default: 'active', index: true },
    // The cohort's batch code, e.g. Organization ID + 2-digit graduation
    // year — typed by an admin and editable from the Manage Classes form.
    // Not `required` at the schema level so pre-existing classes without
    // one remain valid.
    batch: { type: String, trim: true, maxlength: 20, default: '', index: true },
    // Year-end promotion (Grade 1 -> Grade 2, etc.) needs an explicit grade
    // ordering and academic year — `title` is free text ("Grade 3") so it
    // can't be used to derive "the next grade" on its own. Not `required`
    // so pre-existing classes remain valid; promotion simply skips any
    // class missing `gradeLevel` and reports it back to the admin.
    gradeLevel: { type: Number, min: 0, max: 30, default: null, index: true },
    academicYear: { type: String, trim: true, maxlength: 20, default: '' },
    // The final grade in a track (e.g. Grade 12) — promoting these marks
    // students `graduated` instead of moving them to a next-grade class.
    isGraduatingGrade: { type: Boolean, default: false },
    // The entry point of a track (e.g. Grade 1) — promoting these ALSO
    // opens a fresh same-grade class for the target academic year (batch
    // left blank for the admin to assign), so a new intake of students has
    // somewhere to enroll without the admin hand-building "Grade 1" again
    // from scratch every cycle.
    isEntryGrade: { type: Boolean, default: false },
    // Set once this class has been promoted, so re-running "Promote All"
    // never double-moves the same cohort. `promotedTo` links to the class
    // its students were moved into, for an audit trail.
    promotedAt: { type: Date, default: null },
    promotedTo: { type: Schema.Types.ObjectId, ref: 'Class', default: null },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

const ClassModel = mongoose.model<IClass>('Class', classSchema);
export default ClassModel;