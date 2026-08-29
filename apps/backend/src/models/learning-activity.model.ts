/**
 * Learning Activity Model
 *
 * The event stream behind the Student Activity Tracking & Analytics system.
 */

import mongoose, { Schema, Document } from 'mongoose';

export type LearningActivityType =
  | 'login'
  | 'logout'
  | 'session_end'
  | 'page_view'
  | 'course_view'
  | 'course_enrolled'
  | 'lesson_view'
  | 'video_progress'
  | 'pdf_view'
  | 'audio_progress'
  | 'download'
  | 'quiz_attempt'
  | 'exam_attempt'
  | 'assignment_submitted'
  | 'assignment_graded'
  | 'certificate_earned'
  | 'note_created'
  | 'bookmark_added'
  | 'forum_post'
  | 'message_sent'
  | 'notification_viewed';

export interface ILearningActivity extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  student?: mongoose.Types.ObjectId;
  school?: mongoose.Types.ObjectId;
  loginSessionId?: string;
  type: LearningActivityType;
  course?: mongoose.Types.ObjectId;
  lessonId?: string;
  lessonTitle?: string;
  resourceName?: string;
  status?: string;
  durationSeconds?: number;
  percent?: number;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  device?: string;
  browser?: string;
  os?: string;
  createdAt: Date;
}

const learningActivitySchema = new Schema<ILearningActivity>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', index: true },
    loginSessionId: { type: String, index: true },
    type: {
      type: String,
      required: true,
      enum: [
        'login', 'logout', 'session_end', 'page_view', 'course_view', 'course_enrolled',
        'lesson_view', 'video_progress', 'pdf_view', 'audio_progress', 'download',
        'quiz_attempt', 'exam_attempt', 'assignment_submitted', 'assignment_graded',
        'certificate_earned', 'note_created', 'bookmark_added', 'forum_post',
        'message_sent', 'notification_viewed',
      ],
      index: true,
    },
    course: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    lessonId: { type: String, index: true },
    lessonTitle: { type: String, default: '' },
    resourceName: { type: String, default: '' },
    status: { type: String, default: '' },
    durationSeconds: { type: Number },
    percent: { type: Number, min: 0, max: 100 },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    device: { type: String, default: '' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

learningActivitySchema.index({ user: 1, createdAt: -1 });
learningActivitySchema.index({ student: 1, loginSessionId: 1, createdAt: -1 });
learningActivitySchema.index({ school: 1, createdAt: -1 });
learningActivitySchema.index({ course: 1, createdAt: -1 });
learningActivitySchema.index({ type: 1, createdAt: -1 });

export default mongoose.model<ILearningActivity>('LearningActivity', learningActivitySchema);
