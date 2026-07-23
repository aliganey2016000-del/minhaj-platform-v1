/**
 * Learning Activity Model
 *
 * The event stream behind the Student Activity Tracking & Analytics system —
 * one document per discrete student action (login, page/course/lesson view,
 * video progress, quiz attempt, assignment submission, download, etc.).
 * Distinct from the admin-facing `ActivityLog`/`AuditLog` models (which log
 * CRUD/admin actions for an audit trail) — this is purpose-built for LMS
 * learning analytics: course/lesson refs, duration/percent fields, and a
 * fixed set of LMS-specific event types the frontend/other controllers emit.
 *
 * Granular data that's already recorded elsewhere (quiz scores in
 * QuizAttempt, block-by-block gate progress in LessonBlockProgress, overall
 * course completion in Progress) is NOT duplicated here — an activity event
 * for those just references the existing record's id via `refId`, and the
 * analytics aggregation reads the authoritative data from its own model.
 */

import mongoose, { Schema, Document } from 'mongoose';

export type LearningActivityType =
  | 'login'
  | 'logout'
  | 'session_end'          // heartbeat timeout / tab closed without explicit logout
  | 'page_view'
  | 'course_view'
  | 'course_enrolled'
  | 'lesson_view'
  | 'video_progress'       // metadata: { startTime, endTime, percent }
  | 'pdf_view'
  | 'audio_progress'
  | 'download'
  | 'quiz_attempt'         // refId -> QuizAttempt
  | 'exam_attempt'         // refId -> ExamAttempt/Result
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
  user: mongoose.Types.ObjectId;         // the student's User._id
  student?: mongoose.Types.ObjectId;     // Student._id, when resolvable (not every event has one, e.g. login before role checks)
  school?: mongoose.Types.ObjectId;      // tenant scoping
  type: LearningActivityType;
  course?: mongoose.Types.ObjectId;
  lessonId?: string;                     // lesson subdocument _id (CourseContent.chapters[].items is Mixed, so no ref)
  resourceName?: string;                 // human-readable label for the timeline (lesson title, file name, quiz title, ...)
  status?: string;                       // 'completed' | 'in_progress' | 'passed' | 'failed' | free-form
  durationSeconds?: number;
  percent?: number;                      // 0-100, e.g. video watch completion
  metadata?: Record<string, unknown>;    // free-form extra fields (startTime/endTime, score, attempt count, etc.)
  ip?: string;
  userAgent?: string;
  device?: string;                       // 'mobile' | 'tablet' | 'desktop'
  browser?: string;
  os?: string;
  createdAt: Date;
}

const learningActivitySchema = new Schema<ILearningActivity>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', index: true },
    school: { type: Schema.Types.ObjectId, ref: 'School', index: true },
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
    lessonId: { type: String },
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

// Timeline queries filter by user + date range, or by course, most often.
learningActivitySchema.index({ user: 1, createdAt: -1 });
learningActivitySchema.index({ school: 1, createdAt: -1 });
learningActivitySchema.index({ course: 1, createdAt: -1 });
learningActivitySchema.index({ type: 1, createdAt: -1 });

export default mongoose.model<ILearningActivity>('LearningActivity', learningActivitySchema);
