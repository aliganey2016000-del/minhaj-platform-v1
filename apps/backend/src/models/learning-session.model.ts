/**
 * Learning Session — server-authoritative active-learning time.
 * LearningActivity remains an event/audit stream; sessions are the source of truth for time.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type LearningSessionKind = 'lesson' | 'video' | 'audio' | 'pdf' | 'course' | 'general';

export interface ILearningSession extends Document {
  _id: mongoose.Types.ObjectId;
  clientSessionId: string;
  user: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  kind: LearningSessionKind;
  course?: mongoose.Types.ObjectId;
  lessonId?: string;
  lessonTitle?: string;
  resourceName?: string;
  startedAt: Date;
  lastHeartbeatAt: Date;
  endedAt?: Date;
  activeSeconds: number;
  idleSeconds: number;
  watchSeconds: number;
  lastMediaPositionSeconds?: number;
  status: 'active' | 'ended' | 'expired';
  device?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

const schema = new Schema<ILearningSession>({
  clientSessionId: { type: String, required: true, unique: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  school: { type: Schema.Types.ObjectId, ref: 'School', index: true },
  kind: { type: String, enum: ['lesson', 'video', 'audio', 'pdf', 'course', 'general'], required: true, index: true },
  course: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
  lessonId: { type: String, index: true },
  lessonTitle: { type: String, default: '' },
  resourceName: { type: String, default: '' },
  startedAt: { type: Date, required: true, index: true },
  lastHeartbeatAt: { type: Date, required: true },
  endedAt: { type: Date, index: true },
  activeSeconds: { type: Number, default: 0, min: 0 },
  idleSeconds: { type: Number, default: 0, min: 0 },
  watchSeconds: { type: Number, default: 0, min: 0 },
  lastMediaPositionSeconds: { type: Number, min: 0 },
  status: { type: String, enum: ['active', 'ended', 'expired'], default: 'active', index: true },
  device: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

schema.index({ student: 1, startedAt: -1 });
schema.index({ student: 1, status: 1 });
schema.index({ school: 1, startedAt: -1 });

export default mongoose.model<ILearningSession>('LearningSession', schema);
