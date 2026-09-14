/**
 * Enrollment sync — the single place that changes a student's current class
 * and course links. It also records the academic enrollment lifecycle so
 * promotion never destroys historical class/course membership.
 */

import mongoose from 'mongoose';
import Student from '../models/student.model';
import Course from '../models/course.model';
import ClassModel from '../models/class.model';
import ClassSchedule from '../models/class-schedule.model';

async function recalcEnrolledStudents(courseIds: Iterable<string>): Promise<void> {
  for (const courseId of courseIds) {
    const enrolledStudents = await Student.countDocuments({ enrolledCourses: courseId, status: 'active' });
    await Course.updateOne({ _id: courseId }, { $set: { enrolledStudents } });
  }
}

function previousAcademicYear(value: string | null | undefined): string | null {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || end !== start + 1) return null;
  return `${start - 1}-${start}`;
}

function normalizedTitle(value: unknown): string {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const english = typeof record.en === 'string' ? record.en : '';
  if (english.trim()) return english.trim().toLowerCase();
  const first = Object.values(record).find((item) => typeof item === 'string' && item.trim());
  return typeof first === 'string' ? first.trim().toLowerCase() : '';
}

/**
 * Promotion creates a fresh class record for the new academic year. Courses
 * are cloned to that new class, but the timetable is a separate collection
 * and therefore must also be inherited. This helper copies the previous
 * year's schedule for the same grade/section into the new class and remaps
 * each schedule row to the new class's cloned course.
 *
 * It is intentionally idempotent: if the target class already has any
 * schedule rows, nothing is copied. That prevents one timetable copy per
 * student while promotion moves students sequentially.
 */
async function ensurePromotedClassSchedule(newClassId: mongoose.Types.ObjectId | string): Promise<void> {
  const targetClass: any = await ClassModel.findById(newClassId)
    .select('_id school department gradeLevel section academicYear room')
    .lean();
  if (!targetClass) return;

  const existingTargetSchedule = await ClassSchedule.exists({ class: targetClass._id });
  if (existingTargetSchedule) return;

  const priorYear = previousAcademicYear(targetClass.academicYear);
  if (!priorYear || targetClass.gradeLevel === null || targetClass.gradeLevel === undefined) return;

  const templateQuery: Record<string, unknown> = {
    school: targetClass.school,
    gradeLevel: targetClass.gradeLevel,
    academicYear: priorYear,
    status: { $in: ['active', 'completed'] },
  };
  if (targetClass.department) templateQuery.department = targetClass.department;
  if (String(targetClass.section || '').trim()) templateQuery.section = String(targetClass.section).trim();

  let templateClass: any = await ClassModel.findOne(templateQuery).sort({ createdAt: 1 }).lean();

  // Section names sometimes change between academic years. Fall back to the
  // same grade/department so a valid grade timetable is still inherited.
  if (!templateClass) {
    delete templateQuery.section;
    templateClass = await ClassModel.findOne(templateQuery).sort({ createdAt: 1 }).lean();
  }
  if (!templateClass) return;

  const templateSchedules: any[] = await ClassSchedule.find({ class: templateClass._id, isActive: true })
    .populate('course', 'title courseCode')
    .lean();
  if (!templateSchedules.length) return;

  const targetCourses: any[] = await Course.find({
    school: targetClass.school,
    class: targetClass._id,
    status: 'published',
  }).select('_id title courseCode teacher').lean();
  if (!targetCourses.length) return;

  const byCode = new Map<string, any>();
  const byTitle = new Map<string, any>();
  for (const course of targetCourses) {
    const code = String(course.courseCode || '').trim().toLowerCase();
    if (code && !byCode.has(code)) byCode.set(code, course);
    const title = normalizedTitle(course.title);
    if (title && !byTitle.has(title)) byTitle.set(title, course);
  }

  const rows: any[] = [];
  const seen = new Set<string>();
  for (const schedule of templateSchedules) {
    const sourceCourse: any = schedule.course;
    if (!sourceCourse) continue;
    const code = String(sourceCourse.courseCode || '').trim().toLowerCase();
    const title = normalizedTitle(sourceCourse.title);
    const targetCourse = (code && byCode.get(code)) || (title && byTitle.get(title));
    if (!targetCourse) continue;

    const dayOfWeek = Number(schedule.dayOfWeek);
    const startTime = String(schedule.startTime || '').slice(0, 5);
    const endTime = String(schedule.endTime || '').slice(0, 5);
    const duplicateKey = `${dayOfWeek}|${startTime}|${endTime}|${targetCourse._id}`;
    if (seen.has(duplicateKey)) continue;
    seen.add(duplicateKey);

    rows.push({
      school: targetClass.school,
      class: targetClass._id,
      course: targetCourse._id,
      teacher: targetCourse.teacher || null,
      room: targetClass.room || schedule.room || '',
      dayOfWeek,
      startTime,
      endTime,
      isActive: true,
      createdBy: schedule.createdBy,
    });
  }

  if (!rows.length) return;

  // Re-check immediately before insert so sequential promotion calls cannot
  // duplicate the timetable after the first student has created it.
  const alreadyCopied = await ClassSchedule.exists({ class: targetClass._id });
  if (!alreadyCopied) await ClassSchedule.insertMany(rows, { ordered: true });
}

async function syncEnrollmentHistory(
  student: any,
  newClassId: mongoose.Types.ObjectId | string,
  newCourseIds: string[],
): Promise<void> {
  const newClass: any = await ClassModel.findById(newClassId)
    .select('_id title gradeLevel academicYear studyYear semesterNumber semesterInYear department shiftMode')
    .populate('department', 'name');
  if (!newClass || !newClass.academicYear) return;

  // Keep all denormalized placement fields synchronized with Class. Manage
  // Students and reporting read these directly, so changing only `class`
  // during promotion otherwise leaves the student showing the old shift or
  // department until somebody manually edits them later.
  if (newClass.gradeLevel !== null && newClass.gradeLevel !== undefined) {
    student.grade = String(newClass.gradeLevel);
  } else {
    student.grade = String(newClass.title || '').trim() || undefined;
  }
  const department = newClass.department;
  student.department = typeof department === 'string' ? department : department?.name || undefined;
  student.shiftMode = newClass.shiftMode || undefined;

  const history = Array.isArray(student.enrollmentHistory) ? student.enrollmentHistory : [];
  const sameCurrent = history.find(
    (entry: any) => String(entry.class) === String(newClass._id)
      && entry.academicYear === newClass.academicYear
      && entry.semesterNumber === (newClass.semesterNumber ?? null)
      && entry.studyYear === (newClass.studyYear ?? null)
      && entry.status === 'active',
  );

  if (sameCurrent) {
    sameCurrent.courses = newCourseIds.map((id) => new mongoose.Types.ObjectId(id));
    sameCurrent.semesterInYear = newClass.semesterInYear ?? null;
    return;
  }

  const now = new Date();
  for (const entry of history) {
    if (entry.status === 'active') {
      entry.status = 'completed';
      entry.endedAt = now;
    }
  }

  history.push({
    academicYear: newClass.academicYear,
    class: newClass._id,
    grade: newClass.title,
    studyYear: newClass.studyYear ?? undefined,
    semesterNumber: newClass.semesterNumber ?? undefined,
    semesterInYear: newClass.semesterInYear ?? undefined,
    courses: newCourseIds.map((id) => new mongoose.Types.ObjectId(id)),
    status: 'active',
    startedAt: now,
  });
  student.enrollmentHistory = history;
}

/**
 * Refreshes a student's course links after the class itself has progressed
 * in place (for example S1 -> S2). Historical course membership is retained
 * in enrollmentHistory while the current enrolledCourses set becomes the
 * published courses attached to the progressed class.
 *
 * Enrollment synchronization is intentionally active-student-only. This
 * function is also callable outside semester advancement, so the status
 * guard belongs here rather than only in the caller.
 */
export async function refreshStudentCoursesForCurrentClass(
  studentId: mongoose.Types.ObjectId | string,
): Promise<void> {
  const student = await Student.findById(studentId)
    .setOptions({ skipCourseNormalization: true })
    .select('class status enrolledCourses enrollmentHistory grade department shiftMode');
  if (!student?.class || student.status !== 'active') return;

  const [oldCourses, newCourses] = await Promise.all([
    Course.find({ class: student.class }).select('_id'),
    Course.find({ class: student.class, status: 'published' }).select('_id'),
  ]);

  const previousIds = (student.enrolledCourses || []).map((id) => id.toString());
  const currentClassCourseIds = new Set(oldCourses.map((course) => course._id.toString()));
  const retainedIds = previousIds.filter((id) => !currentClassCourseIds.has(id));
  const newCourseIds = newCourses.map((course) => course._id.toString());
  const nextIds = Array.from(new Set([...retainedIds, ...newCourseIds]));

  await syncEnrollmentHistory(student, student.class, newCourseIds);
  student.enrolledCourses = nextIds.map((id) => new mongoose.Types.ObjectId(id));
  await student.save();

  await recalcEnrolledStudents(new Set([...currentClassCourseIds, ...newCourseIds]));
}

/**
 * Closes the student's current academic enrollment without deleting it.
 * Course.enrolledStudents is a cached count of ACTIVE students, so closing a
 * student's enrollment after graduation must refresh those course counters.
 */
export async function completeStudentEnrollmentHistory(
  studentId: mongoose.Types.ObjectId | string,
  status: 'completed' | 'graduated' = 'completed',
): Promise<void> {
  const student = await Student.findById(studentId)
    .setOptions({ skipCourseNormalization: true })
    .select('enrollmentHistory enrolledCourses');
  if (!student) return;

  const affectedCourseIds = new Set((student.enrolledCourses || []).map((id) => id.toString()));
  const now = new Date();
  let changed = false;
  for (const entry of student.enrollmentHistory || []) {
    if (entry.status === 'active') {
      entry.status = status;
      entry.endedAt = now;
      changed = true;
    }
  }
  if (changed) await student.save();
  if (affectedCourseIds.size > 0) await recalcEnrolledStudents(affectedCourseIds);
}

export async function reassignStudentClassCourses(
  studentId: mongoose.Types.ObjectId | string,
  oldClassId: mongoose.Types.ObjectId | string | null | undefined,
  newClassId: mongoose.Types.ObjectId | string | null | undefined,
): Promise<void> {
  if (String(oldClassId || '') === String(newClassId || '')) return;

  const student = await Student.findById(studentId)
    .setOptions({ skipCourseNormalization: true })
    .select('class status enrolledCourses enrollmentHistory grade department shiftMode');
  if (!student || student.status !== 'active') return;

  const oldCourses = oldClassId ? await Course.find({ class: oldClassId }).select('_id') : [];
  const oldCourseIds = new Set(oldCourses.map((c) => c._id.toString()));

  // A deliberate unassignment should not leave the student enrolled in all
  // courses from the old class. Preserve individually assigned courses,
  // close the active history entry, and clear denormalized placement fields.
  if (!newClassId) {
    const keptIds = (student.enrolledCourses || [])
      .map((id) => id.toString())
      .filter((id) => !oldCourseIds.has(id));
    const now = new Date();
    for (const entry of student.enrollmentHistory || []) {
      if (entry.status === 'active') {
        entry.status = 'completed';
        entry.endedAt = now;
      }
    }
    student.class = undefined;
    student.grade = undefined;
    student.department = undefined;
    student.shiftMode = undefined;
    student.enrolledCourses = keptIds.map((id) => new mongoose.Types.ObjectId(id));
    await student.save();
    await recalcEnrolledStudents(oldCourseIds);
    return;
  }

  const newCourses = await Course.find({ class: newClassId, status: 'published' }).select('_id');
  const keptIds = (student.enrolledCourses || []).map((id) => id.toString()).filter((id) => !oldCourseIds.has(id));
  const newCourseIds = newCourses.map((c) => c._id.toString());
  const nextIds = Array.from(new Set([...keptIds, ...newCourseIds]));

  // Ensure the promoted/new academic-year class inherits the correct timetable
  // before the student's class pointer changes. Student Portal reads schedules
  // directly from student.class, so this guarantees the new class timetable is
  // available immediately after promotion.
  await ensurePromotedClassSchedule(newClassId);

  await syncEnrollmentHistory(student, newClassId, newCourseIds);
  student.class = new mongoose.Types.ObjectId(String(newClassId));
  student.enrolledCourses = nextIds.map((id) => new mongoose.Types.ObjectId(id));
  await student.save();

  await recalcEnrolledStudents(new Set([...oldCourseIds, ...newCourseIds]));
}

/** New student (no prior class) — assigns existing published courses and opens the first history entry. */
export async function syncStudentCourseEnrollment(
  studentId: mongoose.Types.ObjectId | string,
  classId: mongoose.Types.ObjectId | string | null | undefined,
): Promise<void> {
  await reassignStudentClassCourses(studentId, null, classId);
}
