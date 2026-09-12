import mongoose, { Schema, Document } from 'mongoose';

export interface ISubstituteAssignment extends Document {
  school: mongoose.Types.ObjectId;
  schedule: mongoose.Types.ObjectId;
  date: Date;
  teacher: mongoose.Types.ObjectId;
  reason?: string;
  active: boolean;
  assignedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const substituteAssignmentSchema = new Schema<ISubstituteAssignment>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    schedule: { type: Schema.Types.ObjectId, ref: 'ClassSchedule', required: true, index: true },
    date: { type: Date, required: true, index: true },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    active: { type: Boolean, default: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

substituteAssignmentSchema.index({ school: 1, schedule: 1, date: 1 }, { unique: true });
substituteAssignmentSchema.index({ school: 1, teacher: 1, date: 1, active: 1 });

export default mongoose.model<ISubstituteAssignment>('SubstituteAssignment', substituteAssignmentSchema);
