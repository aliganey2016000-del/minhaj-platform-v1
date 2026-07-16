import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Payment from '../models/payment.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, assertCanAccessStudent } from '../utils/tenant-scope';
import ensureStudentRecord from '../utils/ensure-student';

// ---------------------------------------------------------------------------
// POST /payments — Record a payment with full transaction history
// ---------------------------------------------------------------------------

export const recordPayment = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, amount, type, method, notes, dueDate, status } = req.body;

  if (!studentId || !amount || amount <= 0) {
    throw new BadRequestError('studentId and a valid amount are required');
  }

  const student = await Student.findById(studentId);
  if (!student) throw new NotFoundError('Student');
  // org_admin can only record payments for students in their own org.
  assertOwnsOrg(req, student, 'school');

  // Create payment record
  const payment = await Payment.create({
    student: studentId,
    school: student.school || null,
    amount,
    type: type || 'tuition',
    method: method || 'cash',
    status: status || 'completed',
    notes: notes || '',
    recordedBy: new mongoose.Types.ObjectId(req.user!.userId),
    dueDate: dueDate || undefined,
  });

  // Update student balance
  if (status === 'completed' || !status) {
    student.totalFeesPaid = (student.totalFeesPaid || 0) + amount;
    student.totalFeesDue = Math.max(0, (student.totalFeesDue || 0) - amount);
    await student.save();
  }

  const populated = await Payment.findById(payment._id)
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId totalFeesPaid totalFeesDue' })
    .populate('recordedBy', 'email')
    .lean();

  return ApiResponse.created(res, populated, 'Payment recorded successfully');
};

// ---------------------------------------------------------------------------
// GET /payments — List all payments with filters, search, pagination
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, status, type, method, page = '1', limit = '20', search } = req.query;

  const filter: Record<string, unknown> = {};
  if (studentId) filter.student = studentId as string;
  if (status && ['completed', 'pending', 'refunded'].includes(status as string)) filter.status = status;
  if (type && ['tuition', 'registration', 'exam', 'material', 'donation', 'other'].includes(type as string)) filter.type = type;
  if (method && ['cash', 'bank_transfer', 'mobile_money', 'online'].includes(method as string)) filter.method = method;

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [payments, total] = await Promise.all([
    Payment.find(scopedFilter)
      .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId totalFeesPaid totalFeesDue' })
      .populate('recordedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Payment.countDocuments(scopedFilter),
  ]);

  let result = payments;
  if (search) {
    const s = (search as string).toLowerCase();
    result = payments.filter((p: any) => {
      const name = `${p.student?.profile?.firstName || ''} ${p.student?.profile?.lastName || ''}`.toLowerCase();
      const sid = (p.student?.studentId || '').toLowerCase();
      const notes = (p.notes || '').toLowerCase();
      return name.includes(s) || sid.includes(s) || notes.includes(s);
    });
  }

  return ApiResponse.paginated(res, result, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};

// ---------------------------------------------------------------------------
// GET /payments/stats — Payment statistics (org-scoped for org_admin)
// ---------------------------------------------------------------------------

export const getPaymentStats = async (req: Request, res: Response): Promise<Response> => {
  const studentFilter = applyOrgFilter(req, {}, 'school');
  const paymentFilter = applyOrgFilter(req, {}, 'school');

  const [stats, paymentCounts, studentsWithDebt, fullyPaid] = await Promise.all([
    Student.aggregate([
      { $match: studentFilter },
      { $group: { _id: null, totalPaid: { $sum: '$totalFeesPaid' }, totalDue: { $sum: '$totalFeesDue' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: paymentFilter },
      { $group: { _id: null, totalTransactions: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
    ]),
    Student.countDocuments({ ...studentFilter, totalFeesDue: { $gt: 0 } }),
    Student.countDocuments({ ...studentFilter, totalFeesDue: 0, totalFeesPaid: { $gt: 0 } }),
  ]);

  const s = stats[0] || { totalPaid: 0, totalDue: 0, count: 0 };
  const total = s.totalPaid + s.totalDue;

  return ApiResponse.success(res, {
    totalPaid: s.totalPaid || 0,
    totalDue: s.totalDue || 0,
    totalStudents: s.count || 0,
    studentsWithDebt,
    fullyPaid,
    collectionRate: total > 0 ? Math.round((s.totalPaid / total) * 100) : 0,
    totalTransactions: paymentCounts[0]?.totalTransactions || 0,
    totalAmountProcessed: paymentCounts[0]?.totalAmount || 0,
  });
};

// ---------------------------------------------------------------------------
// GET /payments/outstanding — Students with an outstanding balance (org-scoped)
// ---------------------------------------------------------------------------

export const getOutstanding = async (req: Request, res: Response): Promise<Response> => {
  const filter = applyOrgFilter(req, { totalFeesDue: { $gt: 0 } }, 'school');

  const students = await Student.find(filter)
    .populate('profile', 'firstName lastName')
    .populate('school', 'name')
    .populate('class', 'title section')
    .select('studentId profile school class totalFeesPaid totalFeesDue')
    .sort({ totalFeesDue: -1 })
    .lean();

  return ApiResponse.success(res, students);
};

// ---------------------------------------------------------------------------
// GET /payments/student/:studentId — Get a student's payment history
// (admin/org_admin, the student themselves, or their linked parent)
// ---------------------------------------------------------------------------

export const getStudentPayments = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.studentId)
    .select('studentId school user enrolledCourses')
    .populate('profile', 'firstName lastName')
    .lean();

  if (!student) throw new NotFoundError('Student');
  await assertCanAccessStudent(req, student);

  const fullStudent = await Student.findById(req.params.studentId).select('totalFeesPaid totalFeesDue').lean();

  const payments = await Payment.find({ student: req.params.studentId })
    .populate('recordedBy', 'email')
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, {
    student: {
      studentId: (student as any).studentId,
      name: `${(student as any).profile?.firstName} ${(student as any).profile?.lastName}`,
      totalFeesPaid: (fullStudent as any)?.totalFeesPaid || 0,
      totalFeesDue: (fullStudent as any)?.totalFeesDue || 0,
    },
    payments,
  });
};

// ---------------------------------------------------------------------------
// GET /payments/my — Student self-service payment history
// ---------------------------------------------------------------------------

export const getMyPayments = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const payments = await Payment.find({ student: student._id })
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, {
    totalFeesPaid: (student as any).totalFeesPaid || 0,
    totalFeesDue: (student as any).totalFeesDue || 0,
    payments,
  });
};

// ---------------------------------------------------------------------------
// PATCH /payments/:id/status — Update payment status
// ---------------------------------------------------------------------------

export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['completed', 'pending', 'refunded'].includes(status)) {
    throw new BadRequestError('Valid status required: completed, pending, or refunded');
  }

  const existing = await Payment.findById(req.params.id);
  if (!existing) throw new NotFoundError('Payment');
  assertOwnsOrg(req, existing, 'school');

  const payment = await Payment.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  )
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId totalFeesPaid totalFeesDue' })
    .populate('recordedBy', 'email')
    .lean();

  if (!payment) throw new NotFoundError('Payment');

  // Recalculate student balance
  const studentId = (payment as any).student?._id;
  if (studentId) {
    const completedPayments = await Payment.find({ student: studentId, status: 'completed' }).lean();
    const total = completedPayments.reduce((sum, p) => sum + p.amount, 0);
    await Student.findByIdAndUpdate(studentId, { totalFeesPaid: total });
  }

  return ApiResponse.success(res, payment, `Payment status updated to ${status}`);
};
