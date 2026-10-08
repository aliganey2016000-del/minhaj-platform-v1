import mongoose, { Schema, Document } from 'mongoose';

export interface IGuuldoonCourseConfig extends Document {
  course: mongoose.Types.ObjectId;
  targetExamDate?: Date;
  passTarget: number;
  chapterWeights: { chapterId: string; examWeight: number }[];
  glossary: { termSo: string; termEn: string; termAr: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IGuuldoonCourseConfig>({
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, unique: true, index: true },
  targetExamDate: { type: Date, default: null },
  passTarget: { type: Number, min: 0, max: 100, default: 70 },
  chapterWeights: {
    type: [{
      chapterId: { type: String, required: true, trim: true },
      examWeight: { type: Number, required: true, min: 0, max: 100 },
    }],
    default: [],
  },
  glossary: {
    type: [{
      termSo: { type: String, required: true, trim: true },
      termEn: { type: String, required: true, trim: true },
      termAr: { type: String, required: true, trim: true },
    }],
    default: [],
  },
}, { timestamps: true });

export default mongoose.model<IGuuldoonCourseConfig>('GuuldoonCourseConfig', schema);
