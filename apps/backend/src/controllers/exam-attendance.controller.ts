/**
 * Exam Attendance Controller
 * Invigilator portal for marking exam-day attendance ("Exam Attendance").
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Exam from '../models/exam.model';
import ExamAttendance from '../models/exam-attendance.model';
import ExamAttendanceLog from '../models/exam-attendance-log.model';
import SeatAllocation from '../models/seat-allocation.model';
import Student from '../models/student.model';
import School from '../models/school.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, assertOwnsExamIfTeacher } from '../utils/tenant-scope';
import ensureStudentRecord from '../utils/ensure-student';

const VALID_STATUSES = ['present', 'absent', 'late', 'excused'];

/** Loads the exam and verifies the caller may manage its attendance. */
async function loadManageableExam(req: Request, examId: string) {
  const exam = await Exam.findById(examId).populate('course', 'title.en school teacher class');
  if (!exam) throw new NotFoundError('Exam');
  assertOwnsOrg(req, exam, 'school');
  await assertOwnsExamIfTeacher(req, exam);
  return exam;
}

// GET /exams/:id/attendance — roster (enrolled students + seat + current status)
export const getForExam = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const course = exam.course as any;
  const courseId = course?._id || course;

  // Class-based organizations roster exam attendance off the whole Class,
  // same as regular course attendance — every student in the class, not
  // just the ones individually enrolled in this course.
  const school = course?.school ? await School.findById(course.school).select('attendanceType').lean() : null;
  const isClassBased = school?.attendanceType === 'class_based' && !!course?.class;
  const studentFilter = isClassBased ? { class: course.class } : { enrolledCourses: courseId };

  const [students, seats, records] = await Promise.all([
    Student.find(studentFilter)
      .populate('profile', 'firstName lastName')
      .populate('class', 'title section')
      .select('studentId profile class')
      .sort({ studentId: 1 })
      .lean(),
    SeatAllocation.find({ exam: exam._id }).populate('room', 'name building').lean(),
    ExamAttendance.find({ exam: exam._id }).lean(),
  ]);

  const seatByStudent: Record<string, any> = {};
  for (const s of seats) seatByStudent[s.student.toString()] = s;

  const recordByStudent: Record<string, any> = {};
  for (const r of records) recordByStudent[r.student.toString()] = r;

  // "Marked By" needs a human-readable name/role — Users don't carry a
  // profile ref the way Students do, so resolve it by hand. A record
  // marked by the student's own account (self-paced auto check-in) is
  // labeled "Auto System" instead of a person's name.
  const markerIds = [...new Set(records.map((r: any) => r.markedBy?.toString()).filter(Boolean))];
  const [markerUsers, markerProfiles] = await Promise.all([
    User.find({ _id: { $in: markerIds } }).select('email role').lean(),
    Profile.find({ user: { $in: markerIds } }).select('user firstName lastName').lean(),
  ]);
  const markerMap = new Map(
    markerIds.map((id) => {
      const u = markerUsers.find((mu) => mu._id.toString() === id);
      if (u?.role === 'student') return [id, { name: 'Auto System', role: 'system' }];
      const p = markerProfiles.find((mp) => mp.user.toString() === id);
      const name = p ? `${p.firstName} ${p.lastName}` : u?.email || 'Unknown';
      return [id, { name, role: u?.role || '' }];
    })
  );

  const roster = students.map((s: any) => {
    const attendance = recordByStudent[s._id.toString()] || null;
    return {
      student: s,
      seat: seatByStudent[s._id.toString()] || null,
      attendance: attendance
        ? {
            ...attendance,
            markedBy: attendance.markedBy ? markerMap.get(attendance.markedBy.toString()) || null : null,
          }
        : null,
    };
  });

  // Return the exam's own details alongside the roster — the frontend
  // previously looked this up in a separately-fetched (and independently
  // filtered/paginated) exams list, which could fall out of sync with
  // whatever roster was actually loaded and silently show blank Course/
  // Date/Time columns. Sourcing it from the same request the roster came
  // from guarantees they always match.
  const examDetails = {
    _id: exam._id,
    title: exam.title,
    examDate: exam.examDate,
    startTime: exam.startTime,
    endTime: exam.endTime,
    status: exam.status,
    autoSchedule: exam.autoSchedule,
    course: course ? { _id: course._id, title: course.title } : null,
  };

  return ApiResponse.success(res, { exam: examDetails, roster });
};

// POST /exams/:id/attendance — bulk mark attendance
export const bulkMark = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const { records } = req.body as { records: { student: string; status: string; notes?: string }[] };

  if (!Array.isArray(records) || records.length === 0) {
    throw new BadRequestError('records is required and must be a non-empty array');
  }
  for (const r of records) {
    if (!VALID_STATUSES.includes(r.status)) {
      throw new BadRequestError(`Invalid status "${r.status}" — must be one of ${VALID_STATUSES.join(', ')}`);
    }
  }

  // Snapshot what each record said BEFORE this write, so we can log an
  // audit entry per student whose status or notes actually changed —
  // ExamAttendance itself is one row per (exam, student) updated in place,
  // so without this the "who changed what, and from what" history is lost
  // the moment the next save overwrites it.
  const studentIds = records.map((r) => r.student);
  const existingDocs = await ExamAttendance.find({ exam: exam._id, student: { $in: studentIds } })
    .select('student status notes')
    .lean();
  const existingByStudent = new Map(existingDocs.map((d) => [d.student.toString(), d]));

  const ops = records.map((r) => ({
    updateOne: {
      filter: { exam: exam._id, student: r.student },
      update: {
        $set: {
          status: r.status as 'present' | 'absent' | 'late' | 'excused',
          notes: r.notes || '',
          markedBy: new mongoose.Types.ObjectId(req.user!.userId),
          markedAt: new Date(),
          school: exam.school || undefined,
        },
      },
      upsert: true,
    },
  }));

  await ExamAttendance.bulkWrite(ops);

  const updatedDocs = await ExamAttendance.find({ exam: exam._id, student: { $in: studentIds } })
    .select('_id student')
    .lean();
  const updatedByStudent = new Map(updatedDocs.map((d) => [d.student.toString(), d._id]));

  const changedByUserId = new mongoose.Types.ObjectId(req.user!.userId);
  const logEntries = records
    .map((r) => {
      const before = existingByStudent.get(r.student);
      const newNotes = r.notes || '';
      const changed = !before || before.status !== r.status || (before.notes || '') !== newNotes;
      if (!changed) return null;
      return {
        attendance: updatedByStudent.get(r.student),
        exam: exam._id,
        student: r.student,
        changedBy: changedByUserId,
        previousStatus: before?.status || null,
        newStatus: r.status,
        previousNotes: before?.notes || '',
        newNotes,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  if (logEntries.length > 0) {
    await ExamAttendanceLog.insertMany(logEntries);
  }

  const populated = await ExamAttendance.find({ exam: exam._id })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('markedBy', 'email')
    .lean();

  return ApiResponse.success(res, populated, `Attendance saved for ${records.length} student(s)`);
};

// GET /exams/:id/attendance/:studentId/logs — audit trail for one student's
// attendance record on this exam (every status/notes change, newest first)
export const getAuditLogs = async (req: Request, res: Response): Promise<Response> => {
  await loadManageableExam(req, req.params.id);

  const logs = await ExamAttendanceLog.find({ exam: req.params.id, student: req.params.studentId })
    .sort({ createdAt: -1 })
    .lean();

  const changerIds = [...new Set(logs.map((l) => l.changedBy.toString()))];
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: changerIds } }).select('email role').lean(),
    Profile.find({ user: { $in: changerIds } }).select('user firstName lastName').lean(),
  ]);
  const changerMap = new Map(
    changerIds.map((id) => {
      const u = users.find((mu) => mu._id.toString() === id);
      if (u?.role === 'student') return [id, { name: 'Auto System', role: 'system' }];
      const p = profiles.find((mp) => mp.user.toString() === id);
      const name = p ? `${p.firstName} ${p.lastName}` : u?.email || 'Unknown';
      return [id, { name, role: u?.role || '' }];
    })
  );

  const enriched = logs.map((l) => ({
    ...l,
    changedBy: changerMap.get(l.changedBy.toString()) || null,
  }));

  return ApiResponse.success(res, enriched);
};

// GET /exams/my/attendance — the logged-in student's own exam attendance history
export const getMyHistory = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const records = await ExamAttendance.find({ student: student._id })
    .populate({
      path: 'exam',
      select: 'title examDate course',
      populate: { path: 'course', select: 'title.en slug category' },
    })
    .sort({ markedAt: -1 })
    .lean();

  return ApiResponse.success(res, records);
};
