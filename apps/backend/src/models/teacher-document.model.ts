import mongoose, { Document, Schema } from 'mongoose';

export interface ITeacherDocument extends Document {
  teacher: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  title: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
}

const schema = new Schema<ITeacherDocument>({
  teacher: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
  school: { type: Schema.Types.ObjectId, ref: 'School', index: true },
  title: { type: String, required: true, trim: true },
  fileUrl: { type: String, required: true },
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true },
  fileSize: { type: Number, required: true },
}, { timestamps: true });

export default mongoose.model<ITeacherDocument>('TeacherDocument', schema);
