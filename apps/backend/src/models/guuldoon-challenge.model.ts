import mongoose, { Schema, Document } from 'mongoose';

/**
 * A teacher-set challenge: a set of Guulgaar questions (whole chapters of the
 * "understanding" or past-paper material, and/or whole exams) given to one or
 * more classes with a deadline.
 */
export interface IGuuldoonChallenge extends Document {
  school: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  title: string;
  chapterIds: string[];
  sources: Array<'understand' | 'past'>;
  examIds: mongoose.Types.ObjectId[];
  classes: mongoose.Types.ObjectId[];
  deadline?: Date;
  status: 'active' | 'closed';
  /** Questions this challenge covers, fixed when it is created so later edits do not move the goalposts. */
  questionIds: mongoose.Types.ObjectId[];
  createdAt: Date;
}

const schema = new Schema<IGuuldoonChallenge>({
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  chapterIds: { type: [String], default: [] },
  sources: { type: [String], enum: ['understand', 'past'], default: [] },
  examIds: { type: [Schema.Types.ObjectId], ref: 'GuuldoonPastExam', default: [] },
  classes: { type: [Schema.Types.ObjectId], ref: 'Class', default: [] },
  deadline: { type: Date, default: undefined },
  status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
  questionIds: { type: [Schema.Types.ObjectId], ref: 'GuuldoonQuestion', default: [] },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ school: 1, createdAt: -1 });
schema.index({ classes: 1, status: 1 });

export default mongoose.model<IGuuldoonChallenge>('GuuldoonChallenge', schema);
