import mongoose, { Schema, Document } from 'mongoose';
import { nextFormattedId } from '../utils/id-sequence';

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

certificateSchema.index({ student: 1, course: 1 });

// Auto-generate certificate number. Atomically reserved (utils/id-sequence.ts)
// instead of `count + 1`, which could mint the same number for two
// concurrent issues (one then fails the unique index) or reissue a
// retired number once a certificate was deleted and the count dropped.
certificateSchema.pre<ICertificate>('validate', async function (next) {
  if (this.isNew && !this.certificateNumber) {
    const year = new Date().getFullYear();
    const CertificateModel = mongoose.model('Certificate');
    this.certificateNumber = await nextFormattedId(
      `certificate:CERT-${year}`,
      (n) => `CERT-${year}-${String(n).padStart(5, '0')}`,
      (candidate) => CertificateModel.exists({ certificateNumber: candidate }).then(Boolean),
      async () => CertificateModel.countDocuments({ certificateNumber: { $regex: `^CERT-${year}-` } }),
    );
  }
  next();
});

export default mongoose.model<ICertificate>('Certificate', certificateSchema);