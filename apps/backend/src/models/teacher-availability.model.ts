import mongoose, { Document, Schema } from 'mongoose';

export interface IUnavailableWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface ITeacherAvailability extends Document {
  school: mongoose.Types.ObjectId;
  teacher: mongoose.Types.ObjectId;
  dayOffs: number[];
  unavailableWindows: IUnavailableWindow[];
  maxLessonsPerDay: number;
  maxConsecutiveLessons: number;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const unavailableWindowSchema = new Schema<IUnavailableWindow>(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
  },
  { _id: false },
);

const teacherAvailabilitySchema = new Schema<ITeacherAvailability>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
    dayOffs: {
      type: [Number],
      default: [],
      validate: {
        validator(values: number[]) {
          return values.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) && new Set(values).size === values.length;
        },
        message: 'Teacher day-offs must contain unique day numbers from 0 to 6',
      },
    },
    unavailableWindows: { type: [unavailableWindowSchema], default: [] },
    maxLessonsPerDay: { type: Number, min: 1, max: 20, default: 5 },
    maxConsecutiveLessons: { type: Number, min: 1, max: 12, default: 3 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

teacherAvailabilitySchema.index({ school: 1, teacher: 1 }, { unique: true });

export default mongoose.model<ITeacherAvailability>('TeacherAvailability', teacherAvailabilitySchema);
