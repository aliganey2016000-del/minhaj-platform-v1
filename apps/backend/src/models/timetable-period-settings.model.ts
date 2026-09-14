import mongoose, { Document, Schema } from 'mongoose';

export interface ITimetablePeriod {
  label: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

export interface ITimetablePeriodSettings extends Document {
  school: mongoose.Types.ObjectId;
  periods: ITimetablePeriod[];
  updatedBy: mongoose.Types.ObjectId;
}

const periodSchema = new Schema<ITimetablePeriod>({
  label: { type: String, required: true, trim: true, maxlength: 40 },
  startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  isBreak: { type: Boolean, default: false },
}, { _id: false });

const schema = new Schema<ITimetablePeriodSettings>({
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
  periods: { type: [periodSchema], required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default mongoose.model<ITimetablePeriodSettings>('TimetablePeriodSettings', schema);
