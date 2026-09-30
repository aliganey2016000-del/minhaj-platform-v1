import mongoose, { Document, Schema } from 'mongoose';

export interface ITeacherBiometric extends Document {
  user: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  descriptorCiphertext: string;
  descriptorIv: string;
  descriptorAuthTag: string;
  modelVersion: string;
  enrolledAt: Date;
  enrolledBy: mongoose.Types.ObjectId;
  consentedAt: Date;
  lastVerifiedAt?: Date;
  verificationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const teacherBiometricSchema = new Schema<ITeacherBiometric>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  descriptorCiphertext: { type: String, required: true, select: false },
  descriptorIv: { type: String, required: true, select: false },
  descriptorAuthTag: { type: String, required: true, select: false },
  modelVersion: { type: String, trim: true, maxlength: 100, default: 'face-api-0.22.2-128d' },
  enrolledAt: { type: Date, default: Date.now },
  enrolledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  consentedAt: { type: Date, required: true },
  lastVerifiedAt: { type: Date, default: undefined },
  verificationCount: { type: Number, default: 0, min: 0 },
}, {
  timestamps: true,
  toJSON: {
    transform(_doc: any, ret: any) {
      delete ret.__v;
      delete ret.descriptorCiphertext;
      delete ret.descriptorIv;
      delete ret.descriptorAuthTag;
      return ret;
    },
  },
});

teacherBiometricSchema.index({ organizationId: 1, user: 1 }, { unique: true });

export default mongoose.model<ITeacherBiometric>('TeacherBiometric', teacherBiometricSchema);
