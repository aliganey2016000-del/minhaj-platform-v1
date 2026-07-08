import mongoose, { Schema, Document } from 'mongoose';

export interface IClass extends Document {
  course: mongoose.Types.ObjectId;
  title: string;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  room?: string;
  meetingLink?: string;
  teacher?: mongoose.Types.ObjectId;
  status: 'active' | 'inactive' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

const classSchema = new Schema<IClass>(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    room: { type: String, default: '' },
    meetingLink: { type: String, default: '' },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null, index: true },
    status: { type: String, enum: ['active', 'inactive', 'completed'], default: 'active', index: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

classSchema.index({ course: 1, dayOfWeek: 1 });
classSchema.index({ status: 1 });

const ClassModel = mongoose.model<IClass>('Class', classSchema);
export default ClassModel;