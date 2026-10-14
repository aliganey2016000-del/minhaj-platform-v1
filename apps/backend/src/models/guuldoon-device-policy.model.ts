import { Schema, model } from 'mongoose';

/** Platform-wide Guulgaar device rule. One document, key "default". */
const schema = new Schema({
  key: { type: String, default: 'default', unique: true },
  // This many different devices verified inside the window blocks the account.
  deviceLimit: { type: Number, default: 3, min: 2, max: 10 },
  windowHours: { type: Number, default: 24, min: 1, max: 168 },
  blockHours: { type: Number, default: 24, min: 1, max: 168 },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default model('GuuldoonDevicePolicy', schema);
