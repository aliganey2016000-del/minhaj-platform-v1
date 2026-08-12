import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Payment from '../models/payment.model';
import Invoice from '../models/invoice.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, assertCanAccessStudent } from '../utils/tenant-scope';
import ensureStudentRecord from '../utils/ensure-student';
import { collectPaymentService, recalcStudentBalance } from '../services/billing.service';

// ---------------------------------------------------------------------------
// POST /payments — Record an ad-hoc payment for a single student (walk-in
// cash, a donation, anything not tied to a pre-existing invoice). Thin
// wrapper around collectPaymentService — that service auto-creates a minimal
// invoice to hold this payment, so it still counts toward the student's
// balance the same way an invoice-collected payment does.
// ---------------------------------------------------------------------------

export const recordPayment = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, amount, discount, type, method, notes, idempotencyKey } = req.body;

  if (!studentId || amount === undefined || amount <= 0) {
    throw new BadRequestError('studentId and a valid amount are required');
  }

  const student = await Student.findById(studentId);
  if (!student) throw new NotFoundError('Student');
  assertOwnsOrg(req, student, 'school');

  const payDiscount = discount || 0;
  const effectiveAmount = Math.max(0, amount - payDiscount);

  const { payment } = await collectPaymentService({
    studentId,
    schoolId: student.school,
    amount,
    discount: payDiscount,
    type: type || 'tuition',
    method: method || 'cash',
    notes,
    recordedBy: req.user!.userId,
    idempotencyKey,
  });

  // Return updated student balance
  const updatedStudent = await Student.findById(studentId).select('totalFees totalFeesPaid totalFeesDue discount').lean();

  const populated = await Payment.findById(payment._id)
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId totalFees totalFeesPaid totalFeesDue discount' })
    .populate('recordedBy', 'email')
    .lean();

  return ApiResponse.created(res, {
    payment: populated,
    balance: {
      totalFees: (updatedStudent as any)?.totalFees || 0,
      discount: (updatedStudent as any)?.discount || 0,
      totalPaid: (updatedStudent as any)?.totalFeesPaid || 0,
      totalDue: (updatedStudent as any)?.totalFeesDue || 0,
      effectiveAmount,
    },
  }, 'Payment recorded successfully');
};

// ---------------------------------------------------------------------------
// PUT /payments/set-fees/:studentId — Assign a total fee amount to a student.
// Keeps writing the legacy display fields (totalFees/discount, still read by
// some admin UI), but the amount now also becomes an actual ad-hoc pending
// Invoice, so it's collectible through the normal flow instead of silently
// not affecting totalFeesDue.
// ---------------------------------------------------------------------------

export const setStudentFees = async (req: Request, res: Response): Promise<Response> => {
  const { totalFees, discount } = req.body;

  if (totalFees === undefined || totalFees < 0) {
    throw new BadRequestError('totalFees is required and must be >= 0');
  }

  const student = await Student.findById(req.params.studentId);
  if (!student) throw new NotFoundError('Student');
  assertOwnsOrg(req, student, 'school');

  student.totalFees = totalFees;
  if (discount !== undefined && discount >= 0) {
    student.discount = discount;
  }
  await student.save();

  const netAmount = Math.max(0, totalFees - (student.discount || 0));
  if (netAmount > 0) {
    await Invoice.create({
      student: student._id,
      school: student.school || null,
      feeStructure: null,
      title: 'Manual Fee Assignment',
      period: `manual-${new Date().toISOString().slice(0, 10)}`,
      lineItems: [{ description: 'Manually assigned fee', amount: netAmount }],
      amount: netAmount,
      amountPaid: 0,
      status: 'pending',
      paymentType: 'tuition',
      dueDate: new Date(),
      issueDate: new Date(),
      generatedBy: req.user!.userId,
    });
  }

  await recalcStudentBalance(student._id as mongoose.Types.ObjectId);

  const updated = await Student.findById(req.params.studentId)
    .select('studentId totalFees totalFeesPaid totalFeesDue discount')
    .populate('profile', 'firstName lastName')
    .lean();

  return ApiResponse.success(res, updated, 'Student fees updated');
};

// ---------------------------------------------------------------------------
// GET /payments/student-balances — Full balance view for all students
// ---------------------------------------------------------------------------

export const getStudentBalances = async (req: Request, res: Response): Promise<Response> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');
  (filter as any).status = { $in: ['active', 'inactive'] };
  (filter as any).approvalStatus = 'approved';

  const { search, classId, sort = 'due' } = req.query;

  if (classId) (filter as any).class = classId;
  if (search) {
    const regex = { $regex: search, $options: 'i' };
    (filter as any).$or = [
      { studentId: regex },
    ];
  }

  const students = await Student.find(filter)
    .populate('profile', 'firstName lastName')
    .populate('school', 'name')
    .populate('class', 'title section')
    .select('studentId profile school class totalFees totalFeesPaid totalFeesDue discount status')
    .sort(sort === 'paid' ? { totalFeesPaid: -1 } : { totalFeesDue: -1 })
    .lean();

  // Post-filter by name if search (since name is in populated profile)
  let result = students;
  if (search) {
    const s = (search as string).toLowerCase();
    result = students.filter((st: any) => {
      const name = `${st.profile?.firstName || ''} ${st.profile?.lastName || ''}`.toLowerCase();
      return name.includes(s) || (st.studentId || '').toLowerCase().includes(s);
    });
  }

  // Aggregate
  const aggregateFees = result.reduce((sum, s: any) => sum + (s.totalFees || 0), 0);
  const aggregatePaid = result.reduce((sum, s: any) => sum + (s.totalFeesPaid || 0), 0);
  const aggregateDue = result.reduce((sum, s: any) => sum + (s.totalFeesDue || 0), 0);

  return ApiResponse.success(res, {
    students: result.map((s: any) => ({
      _id: s._id,
      studentId: s.studentId,
      profile: s.profile,
      school: s.school,
      class: s.class,
      totalFees: s.totalFees || 0,
      discount: s.discount || 0,
      totalFeesPaid: s.totalFeesPaid || 0,
      totalFeesDue: s.totalFeesDue || 0,
      status: s.status,
    })),
    summary: {
      totalStudents: result.length,
      aggregateFees,
      aggregatePaid,
      aggregateDue,
      collectionRate: aggregateFees > 0 ? Math.round((aggregatePaid / aggregateFees) * 100) : 0,
    },
  });
};

// ---------------------------------------------------------------------------
// GET /payments — List all payments with filters, search, pagination
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, status, type, method, page = '1', limit = '20', search, school } = req.query;

  const filter: Record<string, unknown> = {};
  if (studentId) filter.student = studentId;
  if (school) filter.school = school;
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
      { $group: { _id: null, totalFees: { $sum: '$totalFees' }, totalPaid: { $sum: '$totalFeesPaid' }, totalDue: { $sum: '$totalFeesDue' }, totalDiscount: { $sum: '$discount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: paymentFilter },
      { $group: { _id: null, totalTransactions: { $sum: 1 }, totalAmount: { $sum: '$amount' }, totalDiscount: { $sum: '$discount' } } },
    ]),
    Student.countDocuments({ ...studentFilter, totalFeesDue: { $gt: 0 } }),
    Student.countDocuments({ ...studentFilter, totalFeesDue: 0, totalFeesPaid: { $gt: 0 } }),
  ]);

  const s = stats[0] || { totalFees: 0, totalPaid: 0, totalDue: 0, totalDiscount: 0, count: 0 };

  return ApiResponse.success(res, {
    totalFees: s.totalFees || 0,
    totalDiscount: s.totalDiscount || 0,
    totalPaid: s.totalPaid || 0,
    totalDue: s.totalDue || 0,
    totalStudents: s.count || 0,
    studentsWithDebt,
    fullyPaid,
    collectionRate: (s.totalFees || 0) > 0 ? Math.round((s.totalPaid / s.totalFees) * 100) : 0,
    totalTransactions: paymentCounts[0]?.totalTransactions || 0,
    totalAmountProcessed: paymentCounts[0]?.totalAmount || 0,
    totalDiscountsGiven: paymentCounts[0]?.totalDiscount || 0,
  });
};

// ---------------------------------------------------------------------------
// GET /payments/student/:studentId — Get a student's payment history
// ---------------------------------------------------------------------------

export const getStudentPayments = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.studentId)
    .select('studentId school user enrolledCourses totalFees totalFeesPaid totalFeesDue discount')
    .populate('profile', 'firstName lastName')
    .lean();

  if (!student) throw new NotFoundError('Student');
  await assertCanAccessStudent(req, student);

  const payments = await Payment.find({ student: req.params.studentId })
    .populate('recordedBy', 'email')
    .sort({ createdAt: -1 })
    .lean();

  return ApiResponse.success(res, {
    student: {
      studentId: (student as any).studentId,
      name: `${(student as any).profile?.firstName} ${(student as any).profile?.lastName}`,
      totalFees: (student as any)?.totalFees || 0,
      discount: (student as any)?.discount || 0,
      totalFeesPaid: (student as any)?.totalFeesPaid || 0,
      totalFeesDue: (student as any)?.totalFeesDue || 0,
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
    totalFees: (student as any).totalFees || 0,
    discount: (student as any).discount || 0,
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
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId totalFeesPaid totalFeesDue totalFees discount' })
    .populate('recordedBy', 'email')
    .lean();

  if (!payment) throw new NotFoundError('Payment');

  // Recalculate student balance after status change
  const studentId = (payment as any).student?._id;
  if (studentId) {
    await recalcStudentBalance(studentId);
  }

  return ApiResponse.success(res, payment, `Payment status updated to ${status}`);
};