import { Schema, model } from 'mongoose';

/** A student's privacy choice for the national Guuldoon leaderboard. No record = anonymous. */
const schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  showName: { type: Boolean, default: false },
}, { timestamps: true });

export default model('GuuldoonLeaderboardPref', schema);
