import mongoose, { Schema, Document } from 'mongoose';

export type SchoolCalendarDayType = 'instructional' | 'holiday' | 'closure' | 'exam' | 'special';

export interface ISchoolCalendarDay extends Document {
  school: mongoose.Types.ObjectId;
  date: Date;
  type: SchoolCalendarDayType;
  name: string;
  isInstructional: boolean;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schoolCalendarDaySchema = new Schema<ISchoolCalendarDay>(
  {
    school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    date: { type: Date, required: true, index: true },
    type: {
      type: String,
      enum: ['instructional', 'holiday', 'closure', 'exam', 'special'],
      required: true,
      default: 'instructional',
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    isInstructional: { type: Boolean, required: true, default: true, index: true },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

schoolCalendarDaySchema.index({ school: 1, date: 1 }, { unique: true });
schoolCalendarDaySchema.index({ school: 1, date: 1, isInstructional: 1 });

export default mongoose.model<ISchoolCalendarDay>('SchoolCalendarDay', schoolCalendarDaySchema);
