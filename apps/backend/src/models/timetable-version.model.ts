import mongoose, { Document, Schema } from 'mongoose';

export interface ITimetableVersionEntry {
  scheduleId?: mongoose.Types.ObjectId | null;
  class: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  teacher?: mongoose.Types.ObjectId | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  isActive: boolean;
}

export interface ITimetableVersion extends Document {
  school: mongoose.Types.ObjectId;
  version: number;
  label: string;
  entries: ITimetableVersionEntry[];
  publishedBy: mongoose.Types.ObjectId;
  publishedAt: Date;
  sourceDraft?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const entrySchema = new Schema<ITimetableVersionEntry>(
  {
    scheduleId: { type: Schema.Types.ObjectId, ref: 'ClassSchedule', default: null },
    class: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    room: { type: String, trim: true, maxlength: 80, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const timetableVersionSchema = new Schema<ITimetableVersion>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    label: { type: String, trim: true, maxlength: 160, default: '' },
    entries: { type: [entrySchema], default: [] },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date, default: Date.now },
    sourceDraft: { type: Schema.Types.ObjectId, ref: 'TimetableDraft', default: null },
  },
  { timestamps: true },
);

timetableVersionSchema.index({ school: 1, version: 1 }, { unique: true });
timetableVersionSchema.index({ school: 1, publishedAt: -1 });

export default mongoose.model<ITimetableVersion>('TimetableVersion', timetableVersionSchema);
