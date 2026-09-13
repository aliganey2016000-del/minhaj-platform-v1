import mongoose, { Document, Schema } from 'mongoose';

export type TimetableConstraintPriority = 'required' | 'preferred';
export type TimetableConstraintSource = 'manual' | 'ai';

export interface ITimetableConstraint extends Document {
  school: mongoose.Types.ObjectId;
  type: string;
  priority: TimetableConstraintPriority;
  source: TimetableConstraintSource;
  teacher?: mongoose.Types.ObjectId | null;
  class?: mongoose.Types.ObjectId | null;
  course?: mongoose.Types.ObjectId | null;
  dayOfWeek?: number | null;
  payload: Record<string, unknown>;
  description?: string;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const timetableConstraintSchema = new Schema<ITimetableConstraint>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    type: { type: String, required: true, trim: true, maxlength: 80, index: true },
    priority: { type: String, enum: ['required', 'preferred'], default: 'required' },
    source: { type: String, enum: ['manual', 'ai'], default: 'manual' },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null, index: true },
    class: { type: Schema.Types.ObjectId, ref: 'Class', default: null, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
    dayOfWeek: { type: Number, min: 0, max: 6, default: null },
    payload: { type: Schema.Types.Mixed, default: {} },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export default mongoose.model<ITimetableConstraint>('TimetableConstraint', timetableConstraintSchema);
