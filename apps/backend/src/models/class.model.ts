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
  graduationYear?: number;
  batch?: string;
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
    // The cohort's permanent graduation year — set once at class creation
    // and never recomputed, since `batch` (derived from it) must stay fixed
    // as students promote through grades. Not `required` at the schema
    // level so pre-existing classes without one remain valid.
    graduationYear: { type: Number, min: 2000, max: 2100, default: null },
    // Auto-derived as `${organization.orgId}${YY}` at creation time (see
    // class.controller.ts `create`) — permanent, server-controlled, and
    // stripped from every `update` request so it can never drift.
    batch: { type: String, trim: true, maxlength: 20, default: '', index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

const ClassModel = mongoose.model<IClass>('Class', classSchema);
export default ClassModel;