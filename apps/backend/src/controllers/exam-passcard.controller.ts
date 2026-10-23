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
    .populate({ path: 'student', select: 'studentId profile class department', populate: [{ path: 'profile', select: 'firstName lastName' }, { path: 'class', select: 'title section' }] })
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
      verificationToken: randomBytes(32).toString('hex'),
      status: 'pending',
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

function escapeVerificationHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[char] || char;
  });
}

/** Public QR verification page. It intentionally reveals no student-identifying data. */
export const verify = async (req: Request, res: Response): Promise<Response> => {
  const token = String(req.params.token || '').trim();
  if (!token || token.length > 128) {
    return res.status(400).type('html').send('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>PassCard verification</title><body><h1>Invalid PassCard QR</h1></body></html>');
  }

  // Keep both lookups on the same query type to avoid Mongoose inference
  // mismatches between the token lookup and the legacy ObjectId fallback.
  const findVerificationCard = (filter: Record<string, unknown>) =>
    ExamPassCard.findOne(filter).populate('examPeriod', 'name academicYear').select('status examPeriod');
  let card = await findVerificationCard({ verificationToken: token });
  // Legacy cards have no verification token yet; their ObjectId supports read-only verification.
  if (!card && mongoose.isValidObjectId(token)) {
    card = await findVerificationCard({ _id: token, verificationToken: { $exists: false } });
  }

  const status = !card ? 'invalid' : card.status === 'issued' ? 'valid' : card.status === 'revoked' ? 'revoked' : 'pending';
  const title = status === 'valid' ? 'PASSCARD VERIFIED' : status === 'pending' ? 'NOT YET ISSUED' : status === 'revoked' ? 'PASSCARD REVOKED' : 'INVALID PASSCARD';
  const color = status === 'valid' ? '#047857' : status === 'pending' ? '#b45309' : '#b91c1c';
  const period = card?.examPeriod as any;
  const details = period ? '<p>' + escapeVerificationHtml(String(period.name || 'Examination')) + ' · ' + escapeVerificationHtml(String(period.academicYear || '')) + '</p>' : '';
  const message = status === 'valid' ? 'This examination PassCard is officially issued.' : status === 'pending' ? 'This PassCard has been generated but has not been issued.' : status === 'revoked' ? 'This PassCard is no longer valid.' : 'No matching PassCard was found.';
  res.setHeader('Cache-Control', 'no-store');
  const code = status === 'valid' ? 200 : status === 'pending' ? 200 : 404;
  const html = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>PassCard verification</title><style>body{font:16px system-ui,sans-serif;background:#f1f5f9;color:#0f172a;display:grid;min-height:100vh;place-items:center;margin:0;padding:20px;box-sizing:border-box}.card{background:white;border:1px solid #e2e8f0;border-radius:20px;padding:28px;max-width:420px;width:100%;box-sizing:border-box;text-align:center;box-shadow:0 12px 36px #0f172a12}h1{font-size:22px;color:' + color + '}p{color:#475569}.mark{font-size:44px;color:' + color + '}</style></head><body><main class="card"><div class="mark">' + (status === 'valid' ? '✓' : '!') + '</div><h1>' + title + '</h1>' + details + '<p>' + message + '</p></main></body></html>';
  return res.status(code).type('html').send(html);
};
