import mongoose, { Schema, Document } from 'mongoose';

export interface IClass extends Document {
  school: mongoose.Types.ObjectId;
  title: string;
  section: string;
  room: string;
  course?: mongoose.Types.ObjectId;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  meetingLink?: string;
  teacher?: mongoose.Types.ObjectId;
  status: 'active' | 'inactive' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

const classSchema = new Schema<IClass>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    section: { type: String, required: true, trim: true, maxlength: 10 },
    room: { type: String, required: true, trim: true, maxlength: 50 },
    course: { type: Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
    dayOfWeek: { type: Number, min: 0, max: 6, default: null },
    startTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/, default: null },
    endTime: { type: String, match: /^([01]\d|2[0-3]):([0-5]\d)$/, default: null },
    meetingLink: { type: String, default: '' },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null, index: true },
    status: { type: String, enum: ['active', 'inactive', 'completed'], default: 'active', index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

const ClassModel = mongoose.model<IClass>('Class', classSchema);
export default ClassModel;