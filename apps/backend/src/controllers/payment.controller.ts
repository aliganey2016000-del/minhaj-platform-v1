import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Payment from '../models/payment.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, assertCanAccessStudent } from '../utils/tenant-scope';
import ensureStudentRecord from '../utils/ensure-student';

// ---------------------------------------------------------------------------
// Helper: recalculate a student's totalFeesPaid & totalFeesDue from payments
// ---------------------------------------------------------------------------

async function recalculateStudentBalance(studentId: mongoose.Types.ObjectId): Promise<void> {
  const completedPayments = await Payment.find({ student: studentId, status: 'completed' }).lean();

  const totalPaid = completedPayments.reduce((sum, p) => sum + ((p as any).amount || 0) - ((p as any).discount || 0), 0);

  const student = await Student.findById(studentId).select('totalFees discount');
  const totalFees = (student as any)?.totalFees || 0;
  const discount = (student as any)?.discount || 0;
  const netExpected = Math.max(0, totalFees - discount);
  const totalFeesDue = Math.max(0, netExpected - totalPaid);

  await Student.findByIdAndUpdate(studentId, {
    totalFeesPaid: totalPaid,
    totalFeesDue,
  });
}

// ---------------------------------------------------------------------------
// POST /payments — Record a payment with discount support
// ---------------------------------------------------------------------------

export const recordPayment = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, amount, discount, type, method, notes, dueDate, status } = req.body;

  if (!studentId || amount === undefined || amount < 0) {
    throw new BadRequestError('studentId and a valid amount are required');
  }

  const student = await Student.findById(studentId);
  if (!student) throw new NotFoundError('Student');
  assertOwnsOrg(req, student, 'school');

  const payDiscount = discount || 0;
  const effectiveAmount = Math.max(0, amount - payDiscount);

  const payment = await Payment.create({
    student: studentId,
    school: student.school || null,
    amount,
    discount: payDiscount,
    type: type || 'tuition',
    method: method || 'cash',
    status: status || 'completed',
    notes: notes || '',
    recordedBy: new mongoose.Types.ObjectId(req.user!.userId),
    dueDate: dueDate || undefined,
  });

  // Recalculate student balance
  await recalculateStudentBalance(new mongoose.Types.ObjectId(studentId));

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
// PUT /payments/set-fees/:studentId — Set total fees & discount for a student
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

  await recalculateStudentBalance(new mongoose.Types.ObjectId(req.params.studentId));

  const updated = await Student.findById(req.params.studentId)
    .select('studentId totalFees totalFeesPaid totalFeesDue discount')
    .populate('profile', 'firstName lastName')
    .lean();

  return ApiResponse.success(res, updated, 'Student fees updated');
};

// ---------------------------------------------------------------------------
// POST /payments/bulk-charge — Bulk charge all students in an org/class
// ---------------------------------------------------------------------------

export const bulkCharge = async (req: Request, res: Response): Promise<Response> => {
  const { amount, type, method, notes, schoolId, classId, discount: globalDiscount } = req.body;

  if (!amount || amount <= 0) {
    throw new BadRequestError('A valid amount is required for bulk charge');
  }

  // Build student filter — org-scoped
  const studentFilter: Record<string, unknown> = {};
  if (schoolId) studentFilter.school = schoolId;
  if (classId) studentFilter.class = classId;

  const scopedFilter = applyOrgFilter(req, studentFilter, 'school');
  // Only active/approved students
  scopedFilter.status = 'active';
  scopedFilter.approvalStatus = 'approved';

  const students = await Student.find(scopedFilter).select('_id studentId school totalFees totalFeesPaid totalFeesDue discount').lean();
  if (students.length === 0) {
    throw new BadRequestError('No eligible students found for bulk charge');
  }

  const userId = new mongoose.Types.ObjectId(req.user!.userId);
  const payDiscount = globalDiscount || 0;

  // Create payments for all students
  const paymentDocs = students.map((s: any) => ({
    student: s._id,
    school: s.school || null,
    amount,
    discount: payDiscount,
    type: type || 'tuition',
    method: method || 'cash',
    status: 'completed',
    notes: notes || `Bulk charge — ${new Date().toLocaleDateString()}`,
    recordedBy: userId,
  }));

  await Payment.insertMany(paymentDocs);

  // Recalculate balance for all affected students
  for (const s of students) {
    await recalculateStudentBalance(s._id);
  }

  // Get updated totals
  const updatedStudents = await Student.find(scopedFilter)
    .select('totalFees totalFeesPaid totalFeesDue discount')
    .lean();

  const totalCharged = students.length * (amount - payDiscount);
  const aggregateFees = updatedStudents.reduce((sum, s: any) => sum + (s.totalFees || 0), 0);
  const aggregatePaid = updatedStudents.reduce((sum, s: any) => sum + (s.totalFeesPaid || 0), 0);
  const aggregateDue = updatedStudents.reduce((sum, s: any) => sum + (s.totalFeesDue || 0), 0);

  return ApiResponse.created(res, {
    studentsCharged: students.length,
    amountPerStudent: amount,
    discountPerStudent: payDiscount,
    effectivePerStudent: amount - payDiscount,
    totalCharged,
    aggregateFees,
    aggregatePaid,
    aggregateDue,
    collectionRate: aggregateFees > 0 ? Math.round((aggregatePaid / aggregateFees) * 100) : 0,
  }, `Bulk charge applied to ${students.length} students`);
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
// GET /payments/outstanding — Students with an outstanding balance (org-scoped)
// ---------------------------------------------------------------------------

export const getOutstanding = async (req: Request, res: Response): Promise<Response> => {
  const filter = applyOrgFilter(req, { totalFeesDue: { $gt: 0 } }, 'school');

  const students = await Student.find(filter)
    .populate('profile', 'firstName lastName')
    .populate('school', 'name')
    .populate('class', 'title section')
    .select('studentId profile school class totalFees totalFeesPaid totalFeesDue discount')
    .sort({ totalFeesDue: -1 })
    .lean();

  return ApiResponse.success(res, students);
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
    await recalculateStudentBalance(studentId);
  }

  return ApiResponse.success(res, payment, `Payment status updated to ${status}`);
};