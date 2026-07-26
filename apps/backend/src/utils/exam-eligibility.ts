/**
 * Auto-scheduled exam eligibility — shared by exam.controller.ts
 * (getMyExams, so "My Exam Schedule" can show a locked/ready state) and
 * exam-attempt.controller.ts (getActiveExams/start, which actually gate
 * launching the exam). One rule, not two that could drift apart.
 */
import CourseContent from '../models/course-content.model';
import Progress from '../models/progress.model';

/**
 * Per-student eligibility for an auto-scheduled exam: has this student
 * completed every lesson/quiz/assignment in the chapters this exam's
 * milestone gates? 'mid' gates chapters explicitly tagged
 * examMilestone: 'mid'; 'final' gates the entire course (every chapter,
 * tagged or not) — finishing the course is the natural prerequisite for a
 * final exam. No tagged chapters for 'mid' (or no chapters at all for
 * 'final') means the milestone was never configured, so it stays locked
 * rather than unlocking for everyone by default.
 */
export async function isEligibleForAutoScheduledExam(exam: { course: any; milestone?: string | null }, studentId: any): Promise<boolean> {
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
