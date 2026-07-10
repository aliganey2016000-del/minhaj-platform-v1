"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStatus = exports.getStudentPayments = exports.getPaymentStats = exports.getAll = exports.recordPayment = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const payment_model_1 = __importDefault(require("../models/payment.model"));
const student_model_1 = __importDefault(require("../models/student.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
// ---------------------------------------------------------------------------
// POST /payments — Record a payment with full transaction history
// ---------------------------------------------------------------------------
const recordPayment = async (req, res) => {
    const { studentId, amount, type, method, notes, dueDate, status } = req.body;
    if (!studentId || !amount || amount <= 0) {
        throw new api_error_1.BadRequestError('studentId and a valid amount are required');
    }
    const student = await student_model_1.default.findById(studentId);
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    // Create payment record
    const payment = await payment_model_1.default.create({
        student: studentId,
        amount,
        type: type || 'tuition',
        method: method || 'cash',
        status: status || 'completed',
        notes: notes || '',
        recordedBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
        dueDate: dueDate || undefined,
    });
    // Update student balance
    if (status === 'completed' || !status) {
        student.totalFeesPaid = (student.totalFeesPaid || 0) + amount;
        student.totalFeesDue = Math.max(0, (student.totalFeesDue || 0) - amount);
        await student.save();
    }
    const populated = await payment_model_1.default.findById(payment._id)
        .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId totalFeesPaid totalFeesDue' })
        .populate('recordedBy', 'email')
        .lean();
    return api_response_1.default.created(res, populated, 'Payment recorded successfully');
};
exports.recordPayment = recordPayment;
// ---------------------------------------------------------------------------
// GET /payments — List all payments with filters, search, pagination
// ---------------------------------------------------------------------------
const getAll = async (req, res) => {
    const { studentId, status, type, method, page = '1', limit = '20', search } = req.query;
    const filter = {};
    if (studentId)
        filter.student = studentId;
    if (status && ['completed', 'pending', 'refunded'].includes(status))
        filter.status = status;
    if (type && ['tuition', 'registration', 'exam', 'material', 'donation', 'other'].includes(type))
        filter.type = type;
    if (method && ['cash', 'bank_transfer', 'mobile_money', 'online'].includes(method))
        filter.method = method;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const [payments, total] = await Promise.all([
        payment_model_1.default.find(filter)
            .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId totalFeesPaid totalFeesDue' })
            .populate('recordedBy', 'email')
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean(),
        payment_model_1.default.countDocuments(filter),
    ]);
    let result = payments;
    if (search) {
        const s = search.toLowerCase();
        result = payments.filter((p) => {
            const name = `${p.student?.profile?.firstName || ''} ${p.student?.profile?.lastName || ''}`.toLowerCase();
            const sid = (p.student?.studentId || '').toLowerCase();
            const notes = (p.notes || '').toLowerCase();
            return name.includes(s) || sid.includes(s) || notes.includes(s);
        });
    }
    return api_response_1.default.paginated(res, result, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};
exports.getAll = getAll;
// ---------------------------------------------------------------------------
// GET /payments/stats — Payment statistics
// ---------------------------------------------------------------------------
const getPaymentStats = async (_req, res) => {
    const [stats, paymentCounts] = await Promise.all([
        student_model_1.default.aggregate([
            {
                $group: {
                    _id: null,
                    totalPaid: { $sum: '$totalFeesPaid' },
                    totalDue: { $sum: '$totalFeesDue' },
                    count: { $sum: 1 },
                },
            },
        ]),
        payment_model_1.default.aggregate([
            {
                $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                },
            },
        ]),
    ]);
    const studentsWithDebt = await student_model_1.default.countDocuments({ totalFeesDue: { $gt: 0 } });
    const fullyPaid = await student_model_1.default.countDocuments({ totalFeesDue: 0, totalFeesPaid: { $gt: 0 } });
    const s = stats[0] || { totalPaid: 0, totalDue: 0, count: 0 };
    const total = s.totalPaid + s.totalDue;
    return api_response_1.default.success(res, {
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
exports.getPaymentStats = getPaymentStats;
// ---------------------------------------------------------------------------
// GET /payments/student/:studentId — Get student payment history
// ---------------------------------------------------------------------------
const getStudentPayments = async (req, res) => {
    const student = await student_model_1.default.findById(req.params.studentId)
        .select('studentId totalFeesPaid totalFeesDue')
        .populate('profile', 'firstName lastName')
        .lean();
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    const payments = await payment_model_1.default.find({ student: req.params.studentId })
        .populate('recordedBy', 'email')
        .sort({ createdAt: -1 })
        .lean();
    return api_response_1.default.success(res, {
        student: {
            studentId: student.studentId,
            name: `${student.profile?.firstName} ${student.profile?.lastName}`,
            totalFeesPaid: student.totalFeesPaid || 0,
            totalFeesDue: student.totalFeesDue || 0,
        },
        payments,
    });
};
exports.getStudentPayments = getStudentPayments;
// ---------------------------------------------------------------------------
// PATCH /payments/:id/status — Update payment status
// ---------------------------------------------------------------------------
const updateStatus = async (req, res) => {
    const { status } = req.body;
    if (!status || !['completed', 'pending', 'refunded'].includes(status)) {
        throw new api_error_1.BadRequestError('Valid status required: completed, pending, or refunded');
    }
    const payment = await payment_model_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true })
        .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId totalFeesPaid totalFeesDue' })
        .populate('recordedBy', 'email')
        .lean();
    if (!payment)
        throw new api_error_1.NotFoundError('Payment');
    // Recalculate student balance
    const studentId = payment.student?._id;
    if (studentId) {
        const completedPayments = await payment_model_1.default.find({ student: studentId, status: 'completed' }).lean();
        const total = completedPayments.reduce((sum, p) => sum + p.amount, 0);
        await student_model_1.default.findByIdAndUpdate(studentId, { totalFeesPaid: total });
    }
    return api_response_1.default.success(res, payment, `Payment status updated to ${status}`);
};
exports.updateStatus = updateStatus;
//# sourceMappingURL=payment.controller.js.map