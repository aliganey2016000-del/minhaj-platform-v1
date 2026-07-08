import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  student: mongoose.Types.ObjectId;
  amount: number;
  type: 'tuition' | 'registration' | 'exam' | 'material' | 'donation' | 'other';
  method: 'cash' | 'bank_transfer' | 'mobile_money' | 'online';
  status: 'completed' | 'pending' | 'refunded';
  notes: string;
  recordedBy: mongoose.Types.ObjectId;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    type: { type: String, enum: ['tuition', 'registration', 'exam', 'material', 'donation', 'other'], default: 'tuition' },
    method: { type: String, enum: ['cash', 'bank_transfer', 'mobile_money', 'online'], default: 'cash' },
    status: { type: String, enum: ['completed', 'pending', 'refunded'], default: 'completed', index: true },
    notes: { type: String, default: '' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { transform(_doc: any, ret: any) { delete ret.__v; return ret; } } }
);

paymentSchema.index({ student: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ type: 1 });

export default mongoose.model<IPayment>('Payment', paymentSchema);