/**
 * Seat Allocation Controller
 * Assigns enrolled students to exam rooms + desk numbers ("Room Allocation").
 */

import { Request, Response } from 'express';
import Exam from '../models/exam.model';
import ExamRoom from '../models/exam-room.model';
import SeatAllocation from '../models/seat-allocation.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { assertOwnsOrg, assertOwnsExamIfTeacher } from '../utils/tenant-scope';
import ensureStudentRecord from '../utils/ensure-student';

async function loadManageableExam(req: Request, examId: string) {
  const exam = await Exam.findById(examId).populate('course', 'title.en school teacher');
  if (!exam) throw new NotFoundError('Exam');
  assertOwnsOrg(req, exam, 'school');
  await assertOwnsExamIfTeacher(req, exam);
  return exam;
}

async function getEligibleStudents(exam: any) {
  const courseId = (exam.course as any)?._id || exam.course;
  if (!courseId) return [];
  return Student.find({ enrolledCourses: courseId })
    .populate('profile', 'firstName lastName')
    .select('studentId profile status')
    .sort({ studentId: 1 })
    .lean();
}

export const getForExam = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const allocations = await SeatAllocation.find({ exam: exam._id })
    .populate('room', 'name building capacity')
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .sort({ room: 1, deskNumber: 1 })
    .lean();
  return ApiResponse.success(res, allocations);
};

export const getCandidates = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const [students, allocations] = await Promise.all([
    getEligibleStudents(exam),
    SeatAllocation.find({ exam: exam._id }).select('student').lean(),
  ]);
  const assignedIds = new Set(allocations.map((allocation) => allocation.student.toString()));
  return ApiResponse.success(res, students.map((student: any) => ({
    ...student,
    assigned: assignedIds.has(student._id.toString()),
  })));
};

export const create = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const { studentId, room: roomId, deskNumber } = req.body as { studentId?: string; room?: string; deskNumber?: string };
  if (!studentId || !roomId || !String(deskNumber || '').trim()) throw new BadRequestError('studentId, room and deskNumber are required');

  const student = await Student.findById(studentId).select('_id studentId enrolledCourses status').lean();
  if (!student) throw new NotFoundError('Student');
  const courseId = (exam.course as any)?._id || exam.course;
  const enrolled = (student.enrolledCourses || []).some((course: any) => course.toString() === courseId?.toString());
  if (!enrolled) throw new BadRequestError('Student is not enrolled in this exam course');
  if (student.status && student.status !== 'active') throw new BadRequestError('Student is not active');

  const room = await ExamRoom.findById(roomId).lean();
  if (!room) throw new NotFoundError('Exam room');
  assertOwnsOrg(req, room, 'school');

  const seat = String(deskNumber).trim();
  if (await SeatAllocation.exists({ exam: exam._id, student: student._id })) throw new BadRequestError('This student is already assigned a seat for this exam');
  if (await SeatAllocation.exists({ exam: exam._id, room: room._id, deskNumber: seat })) throw new BadRequestError(`Seat "${seat}" is already occupied in ${room.name}`);

  const trailingNumber = seat.match(/(\d+)\s*$/);
  if (trailingNumber && Number(trailingNumber[1]) > room.capacity) throw new BadRequestError(`Seat ${seat} exceeds ${room.name} capacity (${room.capacity})`);

  const allocation = await SeatAllocation.create({ exam: exam._id, student: student._id, room: room._id, deskNumber: seat, school: exam.school || null });
  const populated = await SeatAllocation.findById(allocation._id)
    .populate('room', 'name building capacity')
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .lean();
  return ApiResponse.success(res, populated, 'Seat allocation added');
};

export const generate = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const { roomIds } = req.body as { roomIds: string[] };
  if (!Array.isArray(roomIds) || roomIds.length === 0) throw new BadRequestError('roomIds is required and must be a non-empty array');
  const rooms = await ExamRoom.find({ _id: { $in: roomIds } }).sort({ name: 1 }).lean();
  if (rooms.length === 0) throw new NotFoundError('Exam rooms');
  for (const room of rooms) assertOwnsOrg(req, room, 'school');
  const courseId = (exam.course as any)?._id || exam.course;
  const students = await Student.find({ enrolledCourses: courseId }).sort({ studentId: 1 }).lean();
  const totalCapacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
  if (students.length > totalCapacity) throw new BadRequestError(`Not enough seats: ${students.length} enrolled students but only ${totalCapacity} seats across the selected rooms.`);
  await SeatAllocation.deleteMany({ exam: exam._id });
  const docs: { exam: unknown; student: unknown; room: unknown; deskNumber: string; school: unknown }[] = [];
  let studentIdx = 0;
  for (const room of rooms) {
    for (let desk = 1; desk <= room.capacity && studentIdx < students.length; desk++) {
      docs.push({ exam: exam._id, student: students[studentIdx]._id, room: room._id, deskNumber: `${room.name}-${String(desk).padStart(2, '0')}`, school: exam.school || null });
      studentIdx++;
    }
  }
  if (docs.length > 0) await SeatAllocation.insertMany(docs);
  const populated = await SeatAllocation.find({ exam: exam._id })
    .populate('room', 'name building capacity')
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .lean();
  return ApiResponse.success(res, populated, `${docs.length} students seated across ${rooms.length} room(s)`);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  const { room: roomId, deskNumber } = req.body;
  const existing = await SeatAllocation.findOne({ _id: req.params.allocationId, exam: exam._id });
  if (!existing) throw new NotFoundError('Seat allocation');
  if (roomId) {
    const room = await ExamRoom.findById(roomId).lean();
    if (!room) throw new NotFoundError('Exam room');
    assertOwnsOrg(req, room, 'school');
    existing.room = room._id;
  }
  if (deskNumber) existing.deskNumber = deskNumber;
  await existing.save();
  const populated = await SeatAllocation.findById(existing._id)
    .populate('room', 'name building capacity')
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .lean();
  return ApiResponse.success(res, populated, 'Seat updated');
};

export const clearForExam = async (req: Request, res: Response): Promise<Response> => {
  const exam = await loadManageableExam(req, req.params.id);
  await SeatAllocation.deleteMany({ exam: exam._id });
  return ApiResponse.noContent(res, 'Seating cleared');
};

export const getMySeating = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);
  const allocations = await SeatAllocation.find({ student: student._id })
    .populate({ path: 'exam', select: 'title examDate startTime endTime room instructions course', populate: { path: 'course', select: 'title.en slug category' } })
    .populate('room', 'name building capacity')
    .sort({ createdAt: -1 })
    .lean();
  return ApiResponse.success(res, allocations);
};
