import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Invoice from '../models/invoice.model';
import FeeStructure from '../models/fee-structure.model';
import Student from '../models/student.model';
import ClassModel from '../models/class.model';
import Payment from '../models/payment.model';
import User from '../models/user.model';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';
import { applyOrgFilter, assertOwnsOrg, assertCanAccessStudent } from '../utils/tenant-scope';
import { collectPaymentService } from '../services/billing.service';
import { notifyUsers } from '../utils/notify';
import ensureStudentRecord from '../utils/ensure-student';

const INVOICE_STATUSES = ['pending', 'partial', 'paid', 'void'];

// Maps a FeeStructure's feeType to the closest Payment.type value, since
// Payment's type enum is narrower than FeeStructure's feeType enum.
const FEE_TYPE_TO_PAYMENT_TYPE: Record<string, string> = {
  tuition: 'tuition',
  registration: 'registration',
  exam: 'exam',
  material: 'material',
  transport: 'other',
  library: 'other',
  activity: 'other',
  uniform: 'other',
  other: 'other',
};

// ---------------------------------------------------------------------------
// GET /invoices — List invoices (admin/org_admin, org-scoped)
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { page = '1', limit = '20', status, studentId, feeStructureId, classId, period, school, search } = req.query;

  const filter: Record<string, unknown> = {};
  if (status && INVOICE_STATUSES.includes(status as string)) filter.status = status;
  if (studentId) filter.student = studentId;
  if (feeStructureId) filter.feeStructure = feeStructureId;
  if (period) filter.period = period;
  if (school) filter.school = school;

  if (classId) {
    const studentIds = await Student.find({ class: classId }).distinct('_id');
    filter.student = { $in: studentIds };
  }

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [invoices, total] = await Promise.all([
    Invoice.find(scopedFilter)
      .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
      .populate('feeStructure', 'title feeType')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean({ virtuals: true }),
    Invoice.countDocuments(scopedFilter),
  ]);

  let result = invoices;
  if (search) {
    const s = (search as string).toLowerCase();
    result = invoices.filter((inv: any) => {
      const name = `${inv.student?.profile?.firstName || ''} ${inv.student?.profile?.lastName || ''}`.toLowerCase();
      const sid = (inv.student?.studentId || '').toLowerCase();
      const title = (inv.title || '').toLowerCase();
      return name.includes(s) || sid.includes(s) || title.includes(s);
    });
  }

  return ApiResponse.paginated(res, result, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};

// ---------------------------------------------------------------------------
// GET /invoices/:id — Invoice detail + the payments collected against it
// ---------------------------------------------------------------------------

export const getOne = async (req: Request, res: Response): Promise<Response> => {
  const invoice = await Invoice.findById(req.params.id)
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .populate('feeStructure', 'title feeType')
    .populate('school', 'name')
    .populate('generatedBy', 'email');
  if (!invoice) throw new NotFoundError('Invoice');
  assertOwnsOrg(req, invoice, 'school');

  const payments = await Payment.find({ invoice: invoice._id }).sort({ createdAt: -1 }).lean();

  return ApiResponse.success(res, { invoice, payments });
};

// ---------------------------------------------------------------------------
// POST /invoices — Manual/ad-hoc single invoice
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { studentId, feeStructureId, title, period, lineItems, dueDate, academicYear, paymentType, notes } = req.body;

  if (!studentId) throw new BadRequestError('studentId is required');
  if (!title || !String(title).trim()) throw new BadRequestError('Title is required');
  if (!period || !String(period).trim()) throw new BadRequestError('Period is required');
  if (!Array.isArray(lineItems) || lineItems.length === 0) throw new BadRequestError('At least one line item is required');
  if (!dueDate) throw new BadRequestError('dueDate is required');

  for (const item of lineItems) {
    if (!item.description || !String(item.description).trim()) throw new BadRequestError('Each line item needs a description');
    if (item.amount === undefined || !Number.isFinite(Number(item.amount)) || Number(item.amount) < 0) throw new BadRequestError('Each line item needs a valid amount');
  }

  const student = await Student.findById(studentId).select('school');
  if (!student) throw new NotFoundError('Student');
  assertOwnsOrg(req, student, 'school');

  let resolvedPaymentType = paymentType;
  if (!resolvedPaymentType && feeStructureId) {
    const structure = await FeeStructure.findById(feeStructureId).select('feeType');
    if (structure) resolvedPaymentType = FEE_TYPE_TO_PAYMENT_TYPE[structure.feeType] || 'other';
  }

  const amount = lineItems.reduce((sum: number, item: any) => sum + Number(item.amount), 0);

  try {
    const invoice = await Invoice.create({
      student: studentId,
      school: student.school || null,
      feeStructure: feeStructureId || null,
      title: String(title).trim(),
      period: String(period).trim(),
      lineItems,
      amount,
      status: 'pending',
      paymentType: resolvedPaymentType || 'tuition',
      dueDate: new Date(dueDate),
      academicYear: academicYear ? String(academicYear).trim() : '',
      generatedBy: req.user!.userId,
      notes: notes || '',
    });

    return ApiResponse.created(res, invoice, 'Invoice created successfully');
  } catch (err: any) {
    if (err.code === 11000) {
      throw new ConflictError('An invoice already exists for this student, fee structure, and period.');
    }
    throw err;
  }
};

// ---------------------------------------------------------------------------
// POST /invoices/generate-bulk — the manual, admin-triggered fan-out.
// One FeeStructure + one period per call; idempotent per (student, period).
// ---------------------------------------------------------------------------

export const generateBulk = async (req: Request, res: Response): Promise<Response> => {
  const { feeStructureId, period, dueDate, academicYear } = req.body;

  if (!feeStructureId) throw new BadRequestError('feeStructureId is required');
  if (!period || !String(period).trim()) throw new BadRequestError('period is required');

  const structure = await FeeStructure.findById(feeStructureId);
  if (!structure) throw new NotFoundError('Fee structure');
  assertOwnsOrg(req, structure, 'school');
  if (!structure.isActive) throw new BadRequestError('This fee structure is inactive');

  // ── Resolve eligible students with one query, branching on scope ──
  let eligibleIds: mongoose.Types.ObjectId[];
  if (structure.scopeType === 'class') {
    eligibleIds = await Student.find({
      school: structure.school,
      class: structure.scopeRef,
      status: 'active',
      approvalStatus: 'approved',
    }).distinct('_id');
  } else if (structure.scopeType === 'department') {
    // Student.department is a plain string enum, while Class.department is
    // an ObjectId ref to a real Department document — a pre-existing
    // mismatch in this codebase. Department-scoped eligibility must always
    // be resolved via each student's class, never via Student.department.
    const classIds = await ClassModel.find({ school: structure.school, department: structure.scopeRef }).distinct('_id');
    eligibleIds = await Student.find({
      school: structure.school,
      class: { $in: classIds },
      status: 'active',
      approvalStatus: 'approved',
    }).distinct('_id');
  } else {
    eligibleIds = await Student.find({
      school: structure.school,
      status: 'active',
      approvalStatus: 'approved',
    }).distinct('_id');
  }

  const periodTrimmed = String(period).trim();

  if (eligibleIds.length === 0) {
    return ApiResponse.success(res, { eligible: 0, alreadyBilled: 0, created: 0, failed: 0 }, 'No eligible students found for this fee structure');
  }

  // ── Skip students already billed for this (feeStructure, period) ──
  const alreadyBilledIds = await Invoice.find({ feeStructure: structure._id, period: periodTrimmed }).distinct('student');
  const alreadyBilledSet = new Set(alreadyBilledIds.map((id) => id.toString()));
  const targets = eligibleIds.filter((id) => !alreadyBilledSet.has(id.toString()));

  if (targets.length === 0) {
    return ApiResponse.success(
      res,
      { eligible: eligibleIds.length, alreadyBilled: alreadyBilledIds.length, created: 0, failed: 0 },
      'All eligible students already have an invoice for this period'
    );
  }

  const batchId = `gen-${structure._id}-${Date.now().toString(36)}`;
  const resolvedDueDate = dueDate ? new Date(dueDate) : new Date(Date.now() + structure.dueDayOffset * 86400000);
  const paymentType = FEE_TYPE_TO_PAYMENT_TYPE[structure.feeType] || 'other';

  const docs = targets.map((studentId) => ({
    student: studentId,
    school: structure.school,
    feeStructure: structure._id,
    title: `${structure.title} — ${periodTrimmed}`,
    period: periodTrimmed,
    lineItems: [{ description: structure.title, amount: structure.amount }],
    amount: structure.amount,
    amountPaid: 0,
    status: 'pending',
    paymentType,
    dueDate: resolvedDueDate,
    issueDate: new Date(),
    academicYear: (academicYear || structure.academicYear || '').trim(),
    batchId,
    generatedBy: req.user!.userId,
  }));

  let created = 0;
  try {
    const result = await Invoice.insertMany(docs, { ordered: false });
    created = result.length;
  } catch (err: any) {
    // ordered:false still inserts every doc that didn't collide with the
    // unique (student, feeStructure, period) index — a duplicate-click race
    // just silently skips the colliding rows instead of failing the batch.
    created = err.result?.nInserted ?? err.insertedDocs?.length ?? 0;
  }

  return ApiResponse.created(
    res,
    { batchId, feeStructureTitle: structure.title, period: periodTrimmed, eligible: eligibleIds.length, alreadyBilled: alreadyBilledIds.length, created, failed: targets.length - created },
    `Generated ${created} invoice(s) for ${periodTrimmed}`
  );
};

// ---------------------------------------------------------------------------
// POST /invoices/:id/collect-payment
// Thin wrapper around collectPaymentService (billing.service.ts) — that
// service creates the Payment (linked via Payment.invoice), atomically
// updates this invoice's amountPaid/status, and recalculates
// Student.totalFeesPaid/totalFeesDue from all of the student's invoices, so
// the two figures can never drift apart.
// ---------------------------------------------------------------------------

export const collectPayment = async (req: Request, res: Response): Promise<Response> => {
  const { amount, method, notes, idempotencyKey } = req.body;

  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new NotFoundError('Invoice');
  assertOwnsOrg(req, invoice, 'school');

  const { payment, invoice: updatedInvoice } = await collectPaymentService({
    studentId: invoice.student,
    schoolId: invoice.school,
    invoiceId: invoice._id as mongoose.Types.ObjectId,
    amount,
    method: method || 'cash',
    type: invoice.paymentType,
    notes: notes || `Payment for invoice: ${invoice.title}`,
    recordedBy: req.user!.userId,
    idempotencyKey,
  });

  const populatedPayment = await Payment.findById(payment._id)
    .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
    .lean();

  return ApiResponse.created(res, { payment: populatedPayment, invoice: updatedInvoice }, 'Payment collected against invoice');
};

// ---------------------------------------------------------------------------
// POST /invoices/collect-bulk
// Collects payment (defaulting to each invoice's full remaining balance)
// against every pending/partial invoice matching the given filters — the
// correctly-scoped replacement for the old bulk-charge flow. Loops
// collectPaymentService per invoice; the atomic guard inside it still
// protects each one individually even without a multi-document transaction.
// ---------------------------------------------------------------------------

export const collectBulk = async (req: Request, res: Response): Promise<Response> => {
  const { feeStructureId, period, classId, schoolId, amount, method, notes } = req.body;

  const filter: Record<string, unknown> = { status: { $in: ['pending', 'partial'] } };
  if (feeStructureId) filter.feeStructure = feeStructureId;
  if (period) filter.period = period;
  if (schoolId) filter.school = schoolId;

  if (classId) {
    const studentIds = await Student.find({ class: classId }).distinct('_id');
    filter.student = { $in: studentIds };
  }

  const scopedFilter = applyOrgFilter(req, filter, 'school');
  const invoices = await Invoice.find(scopedFilter).select('_id student school amount amountPaid paymentType title');

  if (invoices.length === 0) {
    return ApiResponse.success(res, { collected: 0, failed: 0, totalAmount: 0 }, 'No matching invoices found');
  }

  const recordedBy = req.user!.userId;
  let collected = 0;
  let failed = 0;
  let totalAmount = 0;

  for (const inv of invoices) {
    const remaining = inv.amount - inv.amountPaid;
    const payAmount = amount ? Math.min(Number(amount), remaining) : remaining;
    if (payAmount <= 0) continue;
    try {
      await collectPaymentService({
        studentId: inv.student,
        schoolId: inv.school,
        invoiceId: inv._id as mongoose.Types.ObjectId,
        amount: payAmount,
        method: method || 'cash',
        type: inv.paymentType,
        notes: notes || `Bulk collection — ${inv.title}`,
        recordedBy,
      });
      collected++;
      totalAmount += payAmount;
    } catch {
      failed++;
    }
  }

  return ApiResponse.success(
    res,
    { collected, failed, totalAmount },
    `Collected payment against ${collected} invoice(s)`
  );
};

// ---------------------------------------------------------------------------
// PATCH /invoices/:id/void — the only terminal state; there is no delete
// endpoint for Invoice at all, since these are financial records.
// ---------------------------------------------------------------------------

export const voidInvoice = async (req: Request, res: Response): Promise<Response> => {
  const invoice = await Invoice.findById(req.params.id);
  if (!invoice) throw new NotFoundError('Invoice');
  assertOwnsOrg(req, invoice, 'school');

  if (invoice.status === 'void') throw new BadRequestError('Invoice is already void');
  if (invoice.amountPaid > 0) throw new BadRequestError('Cannot void an invoice with payments already collected against it.');

  invoice.status = 'void';
  invoice.voidedAt = new Date();
  invoice.voidedBy = new mongoose.Types.ObjectId(req.user!.userId);
  invoice.voidReason = req.body?.reason || '';
  await invoice.save();

  return ApiResponse.success(res, invoice, 'Invoice voided');
};

// ---------------------------------------------------------------------------
// GET /invoices/my — student self-service, same pattern as
// payment.controller.ts's getMyPayments (resolves the caller's own Student
// record rather than requiring them to know their own studentId).
// ---------------------------------------------------------------------------

export const getMyInvoices = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const invoices = await Invoice.find({ student: student._id, status: { $ne: 'void' } })
    .sort({ dueDate: 1 })
    .lean({ virtuals: true });

  return ApiResponse.success(res, invoices);
};

// ---------------------------------------------------------------------------
// GET /invoices/student/:studentId — a student's own invoices (self-service,
// for the parent/student "what do I owe and when" view). Same
// admin/org_admin/parent/student access rule as payment.routes.ts's
// GET /payments/student/:studentId.
// ---------------------------------------------------------------------------

export const getStudentInvoices = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.studentId).select('studentId school user enrolledCourses').lean();
  if (!student) throw new NotFoundError('Student');
  await assertCanAccessStudent(req, student);

  const invoices = await Invoice.find({ student: req.params.studentId, status: { $ne: 'void' } })
    .sort({ dueDate: 1 })
    .lean({ virtuals: true });

  return ApiResponse.success(res, invoices);
};

// ---------------------------------------------------------------------------
// POST /invoices/:id/request-payment — parent/student self-service "I want
// to pay this." There is no payment gateway wired into this app (that's a
// real business/compliance decision, not something to bolt on silently), so
// this doesn't move any money — it notifies the school's own admins so they
// can follow up (call, arrange a bank transfer, take cash in person, etc.),
// giving the parent/student SOME way to act instead of a dead end.
// ---------------------------------------------------------------------------

export const requestPayment = async (req: Request, res: Response): Promise<Response> => {
  const invoice = await Invoice.findById(req.params.id).populate({
    path: 'student',
    select: 'studentId school user enrolledCourses',
    populate: { path: 'profile', select: 'firstName lastName' },
  });
  if (!invoice) throw new NotFoundError('Invoice');
  await assertCanAccessStudent(req, invoice.student);

  if (invoice.status === 'void' || invoice.status === 'paid') {
    throw new BadRequestError('This invoice is not awaiting payment.');
  }

  const orgAdmins = await User.find({ role: 'org_admin', organizationId: invoice.school }).select('_id').lean();
  let recipientIds = orgAdmins.map((u) => (u._id as mongoose.Types.ObjectId).toString());
  if (recipientIds.length === 0) {
    const globalAdmins = await User.find({ role: 'admin' }).select('_id').lean();
    recipientIds = globalAdmins.map((u) => (u._id as mongoose.Types.ObjectId).toString());
  }

  if (recipientIds.length === 0) {
    // Don't claim success when nobody was actually notified — a school with
    // no org_admin assigned yet (and no global admin left) is a real
    // misconfiguration the parent/student needs to know about, not a silent
    // no-op that looks identical to a successful request.
    throw new BadRequestError('No school staff are available to notify right now — please contact your school directly.');
  }

  const student = invoice.student as any;
  const studentName = student?.profile ? `${student.profile.firstName} ${student.profile.lastName}` : student?.studentId || 'A student';
  const remaining = invoice.amount - invoice.amountPaid;

  await notifyUsers(recipientIds, {
    title: 'Payment request',
    message: `${studentName} would like to pay "${invoice.title}" (${remaining.toLocaleString()} remaining). Please follow up with them.`,
    type: 'info',
    link: '/admin/payments/invoices',
  });

  return ApiResponse.success(res, null, 'The office has been notified and will follow up with you shortly.');
};
