import mongoose, { Schema, Document } from 'mongoose';

export interface ICertificate extends Document {
  title: string;
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  issueDate: Date;
  expiryDate?: Date;
  certificateNumber: string;
  grade?: string;
  status: 'issued' | 'revoked' | 'expired';
  notes: string;
  issuedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const certificateSchema = new Schema<ICertificate>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    issueDate: { type: Date, required: true, default: Date.now },
    expiryDate: { type: Date, default: null },
    certificateNumber: { type: String, unique: true, required: true },
    grade: { type: String, default: '' },
    status: { type: String, enum: ['issued', 'revoked', 'expired'], default: 'issued', index: true },
    notes: { type: String, default: '' },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

certificateSchema.index({ certificateNumber: 1 }, { unique: true });
certificateSchema.index({ student: 1, course: 1 });
certificateSchema.index({ status: 1 });

// Auto-generate certificate number
certificateSchema.pre<ICertificate>('validate', async function (next) {
  if (this.isNew && !this.certificateNumber) {
    const count = await mongoose.model('Certificate').countDocuments();
    const year = new Date().getFullYear();
    this.certificateNumber = `CERT-${year}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

export default mongoose.model<ICertificate>('Certificate', certificateSchema);