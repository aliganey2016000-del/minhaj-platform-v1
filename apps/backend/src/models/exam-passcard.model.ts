import mongoose, { Schema, Document } from 'mongoose';

export interface IExamPassCard extends Document {
  school: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  examPeriod: mongoose.Types.ObjectId;
  cardNumber: string;
  verificationToken?: string;
  status: 'pending' | 'issued' | 'revoked';
  issuedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const examPassCardSchema = new Schema<IExamPassCard>({
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  examPeriod: { type: Schema.Types.ObjectId, ref: 'ExamPeriod', required: true, index: true },
  cardNumber: { type: String, required: true, trim: true, unique: true },
  verificationToken: { type: String, trim: true, unique: true, sparse: true, index: true },
  status: { type: String, enum: ['pending', 'issued', 'revoked'], default: 'pending', index: true },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } });

examPassCardSchema.index({ school: 1, examPeriod: 1, student: 1 }, { unique: true, partialFilterExpression: { status: 'issued' } });

export default mongoose.model<IExamPassCard>('ExamPassCard', examPassCardSchema);
