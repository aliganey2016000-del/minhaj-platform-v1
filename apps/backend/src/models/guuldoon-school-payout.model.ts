import { Schema, model } from 'mongoose';

/** A payout of the Guuldoon school bonus recorded by the Super Admin. */
const schema = new Schema({
  school: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, enum: ['USD'], default: 'USD' },
  note: { type: String, trim: true, maxlength: 300, default: '' },
  paidAt: { type: Date, default: Date.now },
  paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
schema.index({ school: 1, paidAt: -1 });
export default model('GuuldoonSchoolPayout', schema);
