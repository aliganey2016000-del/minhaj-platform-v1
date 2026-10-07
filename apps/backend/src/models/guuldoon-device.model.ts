import { Schema, model } from 'mongoose';

const schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  revision: { type: Number, default: 0 },
  activeHash: { type: String, default: '' },
  activatedAt: Date,
  blockedUntil: Date,
  history: { type: [{ hash: String, at: Date }], default: [] },
  passwordAttempts: { type: Number, default: 0 },
  passwordAttemptWindow: Date,
}, { timestamps: true });

export default model('GuuldoonDevice', schema);
