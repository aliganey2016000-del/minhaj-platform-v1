import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { randomBytes } from 'crypto';
import ExamPassCard from '../models/exam-passcard.model';
import ExamPeriod from '../models/exam-period.model';
import Student from '../models/student.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';

function schoolIdFor(req: Request): string {
  const id = req.user?.role === 'org_admin'
    ? req.user.organizationId
    : (req.query.schoolId || req.body?.schoolId || req.user?.organizationId);
  if (!id || !mongoose.isValidObjectId(String(id))) {
    throw new BadRequestError('A valid school/organization is required');
  }
  if (req.user?.role === 'org_admin' && String(id) !== String(req.user.organizationId)) {
    throw new ForbiddenError('You can only manage PassCards for your own organization');
  }
  return String(id);
}

export const context = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = schoolIdFor(req);
  const [periods, students] = await Promise.all([
    ExamPeriod.find({ school: schoolId }).select('name academicYear term startDate endDate status').sort({ startDate: -1, createdAt: -1 }).lean(),
    Student.find({ school: schoolId, status: 'active', approvalStatus: 'approved' })
      .select('studentId profile class school status department')
      .populate('profile', 'firstName lastName')
      .populate('class', 'title section')
      .sort({ studentId: 1 })
      .limit(2000)
      .lean(),
  ]);
  return res.json({ success: true, data: { periods, students } });
};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = schoolIdFor(req);
  const requestedStatus = String(req.query.status || 'all');
  if (!['all', 'pending', 'issued', 'revoked'].includes(requestedStatus)) throw new BadRequestError('Invalid PassCard status');
  const filter: Record<string, unknown> = { school: schoolId, status: requestedStatus === 'all' ? { $in: ['pending', 'issued'] } : requestedStatus };
  if (req.query.periodId) {
    if (!mongoose.isValidObjectId(String(req.query.periodId))) throw new BadRequestError('A valid exam period is required');
    filter.examPeriod = String(req.query.periodId);
  }
  const cards = await ExamPassCard.find(filter)
    .populate({ path: 'student', select: 'studentId profile class', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'class', select: 'title section' }] })
    .populate('examPeriod', 'name academicYear term startDate endDate')
    .populate('issuedBy', 'email')
    .sort({ createdAt: -1 })
    .lean();
  return res.json({ success: true, data: cards, meta: { total: cards.length } });
};

export const create = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = schoolIdFor(req);
  const { studentId, periodId } = req.body || {};
  if (!studentId || !mongoose.isValidObjectId(String(studentId))) throw new BadRequestError('Select a valid student');
  if (!periodId || !mongoose.isValidObjectId(String(periodId))) throw new BadRequestError('Select an exam period');

  const [student, period] = await Promise.all([
    Student.findOne({ _id: studentId, school: schoolId, status: 'active', approvalStatus: 'approved' }).select('_id studentId school'),
    ExamPeriod.findOne({ _id: periodId, school: schoolId }).select('_id name academicYear'),
  ]);
  if (!student) throw new NotFoundError('Active student in this organization');
  if (!period) throw new NotFoundError('Exam period in this organization');

  const existing = await ExamPassCard.findOne({ school: schoolId, student: student._id, examPeriod: period._id, status: { $in: ['pending', 'issued'] } });
  if (existing) return res.status(200).json({ success: true, message: 'This student already has a PassCard for this exam period.', data: existing, alreadyExists: true });

  const cardNumber = `PC-${new Date().getFullYear()}-${String(student.studentId).replace(/[^A-Z0-9]/gi, '').slice(-12)}-${randomBytes(3).toString('hex').toUpperCase()}`;
  try {
    const card = await ExamPassCard.create({
      school: schoolId,
      student: student._id,
      examPeriod: period._id,
      cardNumber,
      issuedBy: req.user!.userId,
    });
    const populated = await ExamPassCard.findById(card._id)
      .populate({ path: 'student', select: 'studentId profile class', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'class', select: 'title section' }] })
      .populate('examPeriod', 'name academicYear term startDate endDate')
      .lean();
    return res.status(201).json({ success: true, message: 'PassCard generated and added to Not Issued.', data: populated });
  } catch (error: any) {
    if (error?.code === 11000) {
      const duplicate = await ExamPassCard.findOne({ school: schoolId, student: student._id, examPeriod: period._id, status: { $in: ['pending', 'issued'] } }).lean();
      if (duplicate) return res.status(200).json({ success: true, message: 'This student already has a PassCard for this exam period.', data: duplicate, alreadyExists: true });
    }
    throw error;
  }
};

export const issue = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = schoolIdFor(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw new BadRequestError('Invalid PassCard');
  const card = await ExamPassCard.findOneAndUpdate(
    { _id: req.params.id, school: schoolId, status: 'pending' },
    { $set: { status: 'issued', issuedBy: req.user!.userId } },
    { new: true },
  )
    .populate({ path: 'student', select: 'studentId profile class department', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'class', select: 'title section' }] })
    .populate('examPeriod', 'name academicYear term startDate endDate');
  if (!card) throw new NotFoundError('Pending PassCard');
  return res.json({ success: true, message: 'PassCard issued successfully.', data: card });
};

export const revoke = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = schoolIdFor(req);
  if (!mongoose.isValidObjectId(req.params.id)) throw new BadRequestError('Invalid PassCard');
  const card = await ExamPassCard.findOneAndUpdate(
    { _id: req.params.id, school: schoolId, status: 'issued' },
    { $set: { status: 'revoked' } },
    { new: true },
  );
  if (!card) throw new NotFoundError('Active PassCard');
  return res.json({ success: true, message: 'PassCard revoked.', data: card });
};
