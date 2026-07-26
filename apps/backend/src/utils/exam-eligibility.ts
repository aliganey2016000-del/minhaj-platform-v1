/**
 * Auto-scheduled exam windows — shared by exam.controller.ts (getMyExams,
 * so "My Exam Schedule" can show a real personalized date) and
 * exam-attempt.controller.ts (getActiveExams/start/getReview, which
 * actually gate launching/reviewing the exam). One rule, not two that
 * could drift apart.
 */
import CourseContent from '../models/course-content.model';
import Progress from '../models/progress.model';
import ExamEligibility from '../models/exam-eligibility.model';

export interface AutoScheduleWindow {
  /** Has this student finished the prerequisite chapters at all? False = no window exists yet, full stop. */
  metPrerequisites: boolean;
  /** The moment they first met the prerequisites — persisted once, never shifts on re-checks. Null until metPrerequisites is true. */
  eligibleAt: Date | null;
  /** eligibleAt + exam.autoScheduleDelayDays — when their personal window opens. */
  scheduledStart: Date | null;
  /** scheduledStart + exam.autoScheduleWindowDays — when their personal window closes. */
  scheduledEnd: Date | null;
}

/** Has this student completed every lesson/quiz/assignment in the chapters this exam's milestone gates? 'mid' gates chapters tagged examMilestone: 'mid'; 'final' gates the entire course. */
async function hasMetPrerequisites(exam: { course: any; milestone?: string | null }, studentId: any): Promise<boolean> {
  const content = await CourseContent.findOne({ course: exam.course }).lean();
  if (!content) return false;

  const gatingChapters = exam.milestone === 'mid'
    ? content.chapters.filter((ch: any) => ch.examMilestone === 'mid')
    : content.chapters; // 'final' (or unset) — the whole course

  const requiredItemIds = gatingChapters
    .flatMap((ch: any) => ch.items || [])
    .filter((it: any) => it.type === 'lesson' || it.type === 'quiz' || it.type === 'assignment')
    .map((it: any) => it._id?.toString())
    .filter(Boolean);

  if (requiredItemIds.length === 0) return false;

  const progress = await Progress.findOne({ student: studentId, course: exam.course }).select('completedItemIds').lean();
  if (!progress) return false;

  const completed = new Set(progress.completedItemIds || []);
  return requiredItemIds.every((id: string) => completed.has(id));
}

/**
 * Full per-student window for an auto-scheduled exam. Persists the
 * first-eligible timestamp the first time prerequisites are found met, so
 * a student's personal window is fixed the moment they qualify — checking
 * again later (e.g. every time they open My Exam Schedule) doesn't push
 * their date around.
 */
export async function getAutoScheduleWindow(
  exam: { _id: any; course: any; milestone?: string | null; autoScheduleDelayDays?: number; autoScheduleWindowDays?: number },
  studentId: any
): Promise<AutoScheduleWindow> {
  const metPrerequisites = await hasMetPrerequisites(exam, studentId);
  if (!metPrerequisites) {
    return { metPrerequisites: false, eligibleAt: null, scheduledStart: null, scheduledEnd: null };
  }

  let record = await ExamEligibility.findOne({ exam: exam._id, student: studentId });
  if (!record) {
    try {
      record = await ExamEligibility.create({ exam: exam._id, student: studentId, eligibleAt: new Date() });
    } catch {
      // Race: another request created it a moment ago — re-read.
      record = await ExamEligibility.findOne({ exam: exam._id, student: studentId });
    }
  }
  if (!record) return { metPrerequisites: true, eligibleAt: null, scheduledStart: null, scheduledEnd: null };

  const delayDays = exam.autoScheduleDelayDays ?? 0;
  const windowDays = exam.autoScheduleWindowDays ?? 2;
  const scheduledStart = new Date(record.eligibleAt.getTime() + delayDays * 24 * 60 * 60 * 1000);
  const scheduledEnd = new Date(scheduledStart.getTime() + windowDays * 24 * 60 * 60 * 1000);

  return { metPrerequisites: true, eligibleAt: record.eligibleAt, scheduledStart, scheduledEnd };
}

/** Convenience: is the student's personal window open right now? */
export function isWindowActive(win: AutoScheduleWindow): boolean {
  if (!win.scheduledStart || !win.scheduledEnd) return false;
  const now = Date.now();
  return now >= win.scheduledStart.getTime() && now <= win.scheduledEnd.getTime();
}

/** Convenience: has the student's personal window fully closed? */
export function isWindowPast(win: AutoScheduleWindow): boolean {
  if (!win.scheduledEnd) return false;
  return Date.now() > win.scheduledEnd.getTime();
}
