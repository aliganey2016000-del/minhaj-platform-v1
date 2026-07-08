import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Payment from '../models/payment.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

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

  // Create payment record
  const payment = await Payment.create({
    student: studentId,
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

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId totalFeesPaid totalFeesDue' })
      .populate('recordedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Payment.countDocuments(filter),
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
// GET /payments/stats — Payment statistics
// ---------------------------------------------------------------------------

export const getPaymentStats = async (_req: Request, res: Response): Promise<Response> => {
  const [stats, paymentCounts] = await Promise.all([
    Student.aggregate([
      {
        $group: {
          _id: null,
          totalPaid: { $sum: '$totalFeesPaid' },
          totalDue: { $sum: '$totalFeesDue' },
          count: { $sum: 1 },
        },
      },
    ]),
    Payment.aggregate([
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  const studentsWithDebt = await Student.countDocuments({ totalFeesDue: { $gt: 0 } });
  const fullyPaid = await Student.countDocuments({ totalFeesDue: 0, totalFeesPaid: { $gt: 0 } });

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
// GET /payments/student/:studentId — Get student payment history
// ---------------------------------------------------------------------------

export const getStudentPayments = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.studentId)
    .select('studentId totalFeesPaid totalFeesDue')
    .populate('profile', 'firstName lastName')
    .lean();

  if (!student) throw new NotFoundError('Student');

  const payments = await Payment.find({ student: req.params.studentId })
    .populate('recordedBy', 'email')
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, {
    student: {
      studentId: (student as any).studentId,
      name: `${(student as any).profile?.firstName} ${(student as any).profile?.lastName}`,
      totalFeesPaid: (student as any).totalFeesPaid || 0,
      totalFeesDue: (student as any).totalFeesDue || 0,
    },
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