/**
 * Exam Attendance Controller
 * Invigilator portal for marking exam-day attendance ("Exam Attendance").
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Exam from '../models/exam.model';
import ExamAttendance from '../models/exam-attendance.model';
import SeatAllocation from '../models/seat-allocation.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, assertOwnsExamIfTeacher } from '../utils/tenant-scope';
import ensureStudentRecord from '../utils/ensure-student';

const VALID_STATUSES = ['present', 'absent', 'late', 'excused'];

/** Loads the exam and verifies the caller may manage its attendance. */
async function loadManageableExam(req: Request, examId: string) {
  const exam = await Exam.findById(examId).populate('course', 'title.en school teacher');
  if (!exam) throw new NotFoundError('Exam');
  assertOwnsOrg(req, exam, 'school');
  await assertOwnsExamIfTeacher(req, exam);
  return exam;
}

// GET /exams/:id/attendance — roster (enrolled students + seat + current status)
export const getForExam = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const courseId = (exam.course as any)?._id || exam.course;

  const [students, seats, records] = await Promise.all([
    Student.find({ enrolledCourses: courseId })
      .populate('profile', 'firstName lastName')
      .select('studentId profile')
      .sort({ studentId: 1 })
      .lean(),
    SeatAllocation.find({ exam: exam._id }).populate('room', 'name building').lean(),
    ExamAttendance.find({ exam: exam._id }).lean(),
  ]);

  const seatByStudent: Record<string, any> = {};
  for (const s of seats) seatByStudent[s.student.toString()] = s;

  const recordByStudent: Record<string, any> = {};
  for (const r of records) recordByStudent[r.student.toString()] = r;

  const roster = students.map((s: any) => ({
    student: s,
    seat: seatByStudent[s._id.toString()] || null,
    attendance: recordByStudent[s._id.toString()] || null,
  }));

  return ApiResponse.success(res, roster);
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

  const populated = await ExamAttendance.find({ exam: exam._id })
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('markedBy', 'email')
    .lean();

  return ApiResponse.success(res, populated, `Attendance saved for ${records.length} student(s)`);
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
