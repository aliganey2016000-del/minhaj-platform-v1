import mongoose, { Document, Schema } from 'mongoose';

export interface ITimetablePeriod {
  key: string;
  label: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

export interface ITimetableConfig extends Document {
  school: mongoose.Types.ObjectId;
  workingDays: number[];
  periods: ITimetablePeriod[];
  strictPeriods: boolean;
  timezone: string;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const periodSchema = new Schema<ITimetablePeriod>(
  {
    key: { type: String, required: true, trim: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    isBreak: { type: Boolean, default: false },
  },
  { _id: false },
);

const timetableConfigSchema = new Schema<ITimetableConfig>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, unique: true, index: true },
    workingDays: {
      type: [Number],
      default: [0, 1, 2, 3, 4],
      validate: {
        validator(values: number[]) {
          return values.length > 0 && values.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) && new Set(values).size === values.length;
        },
        message: 'Working days must contain unique day numbers from 0 to 6',
      },
    },
    periods: { type: [periodSchema], default: [] },
    strictPeriods: { type: Boolean, default: false },
    timezone: { type: String, trim: true, maxlength: 100, default: 'Africa/Mogadishu' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export default mongoose.model<ITimetableConfig>('TimetableConfig', timetableConfigSchema);
