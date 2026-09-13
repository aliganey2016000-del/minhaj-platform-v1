import mongoose, { Document, Schema } from 'mongoose';

export interface ITimetableDraftEntry {
  _id?: mongoose.Types.ObjectId;
  sourceSchedule?: mongoose.Types.ObjectId | null;
  class: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  teacher?: mongoose.Types.ObjectId | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  isActive: boolean;
}

export interface ITimetableDraft extends Document {
  school: mongoose.Types.ObjectId;
  name: string;
  entries: ITimetableDraftEntry[];
  status: 'draft' | 'published' | 'archived';
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const entrySchema = new Schema<ITimetableDraftEntry>(
  {
    sourceSchedule: { type: Schema.Types.ObjectId, ref: 'ClassSchedule', default: null },
    class: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    room: { type: String, trim: true, maxlength: 80, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

const timetableDraftSchema = new Schema<ITimetableDraft>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, trim: true, maxlength: 120, default: 'Working Draft' },
    entries: { type: [entrySchema], default: [] },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

timetableDraftSchema.index({ school: 1, status: 1, updatedAt: -1 });

export default mongoose.model<ITimetableDraft>('TimetableDraft', timetableDraftSchema);
