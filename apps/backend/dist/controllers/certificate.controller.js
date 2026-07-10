"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyCertificates = exports.remove = exports.updateStatus = exports.update = exports.create = exports.getAll = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const certificate_model_1 = __importDefault(require("../models/certificate.model"));
const student_model_1 = __importDefault(require("../models/student.model"));
const course_model_1 = __importDefault(require("../models/course.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
const ensure_student_1 = __importDefault(require("../utils/ensure-student"));
// GET /certificates — List all with filters, search, pagination
const getAll = async (req, res) => {
    const { studentId, courseId, status, page = '1', limit = '20', search } = req.query;
    const filter = {};
    if (studentId)
        filter.student = studentId;
    if (courseId)
        filter.course = courseId;
    if (status && ['issued', 'revoked', 'expired'].includes(status))
        filter.status = status;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const [certs, total] = await Promise.all([
        certificate_model_1.default.find(filter)
            .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
            .populate('course', 'title.en slug category')
            .populate('issuedBy', 'email')
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean(),
        certificate_model_1.default.countDocuments(filter),
    ]);
    let result = certs;
    if (search) {
        const s = search.toLowerCase();
        result = certs.filter((c) => {
            const name = `${c.student?.profile?.firstName || ''} ${c.student?.profile?.lastName || ''}`.toLowerCase();
            const sid = (c.student?.studentId || '').toLowerCase();
            const certNum = (c.certificateNumber || '').toLowerCase();
            const title = (c.title || '').toLowerCase();
            return name.includes(s) || sid.includes(s) || certNum.includes(s) || title.includes(s);
        });
    }
    return api_response_1.default.paginated(res, result, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};
exports.getAll = getAll;
// POST /certificates — Issue a new certificate
const create = async (req, res) => {
    const { title, student: studentId, course: courseId, issueDate, expiryDate, grade, notes } = req.body;
    if (!title || !studentId || !courseId) {
        throw new api_error_1.BadRequestError('title, student, and course are required');
    }
    const [student, course] = await Promise.all([
        student_model_1.default.findById(studentId).lean(),
        course_model_1.default.findById(courseId).lean(),
    ]);
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    if (!course)
        throw new api_error_1.NotFoundError('Course');
    const cert = await certificate_model_1.default.create({
        title,
        student: studentId,
        course: courseId,
        issueDate: issueDate || new Date(),
        expiryDate: expiryDate || undefined,
        grade: grade || '',
        notes: notes || '',
        status: 'issued',
        issuedBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
    });
    const populated = await certificate_model_1.default.findById(cert._id)
        .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
        .populate('course', 'title.en slug category')
        .populate('issuedBy', 'email')
        .lean();
    return api_response_1.default.created(res, populated, 'Certificate issued successfully');
};
exports.create = create;
// PATCH /certificates/:id
const update = async (req, res) => {
    const cert = await certificate_model_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
        .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
        .populate('course', 'title.en slug category')
        .populate('issuedBy', 'email')
        .lean();
    if (!cert)
        throw new api_error_1.NotFoundError('Certificate');
    return api_response_1.default.success(res, cert, 'Certificate updated');
};
exports.update = update;
// PATCH /certificates/:id/status
const updateStatus = async (req, res) => {
    const { status } = req.body;
    if (!status || !['issued', 'revoked', 'expired'].includes(status)) {
        throw new api_error_1.BadRequestError('Valid status required: issued, revoked, or expired');
    }
    const cert = await certificate_model_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true })
        .populate({ path: 'student', populate: { path: 'profile', select: 'firstName lastName' }, select: 'studentId' })
        .populate('course', 'title.en slug')
        .lean();
    if (!cert)
        throw new api_error_1.NotFoundError('Certificate');
    return api_response_1.default.success(res, cert, `Certificate status updated to ${status}`);
};
exports.updateStatus = updateStatus;
// DELETE /certificates/:id
const remove = async (req, res) => {
    const cert = await certificate_model_1.default.findByIdAndDelete(req.params.id);
    if (!cert)
        throw new api_error_1.NotFoundError('Certificate');
    return api_response_1.default.noContent(res, 'Certificate deleted');
};
exports.remove = remove;
// GET /certificates/my — Student's own certificates
const getMyCertificates = async (req, res) => {
    const student = await (0, ensure_student_1.default)(req.user.userId);
    const certs = await certificate_model_1.default.find({ student: student._id })
        .populate('course', 'title.en slug category')
        .populate('issuedBy', 'email')
        .sort({ createdAt: -1 })
        .lean();
    return api_response_1.default.success(res, certs);
};
exports.getMyCertificates = getMyCertificates;
//# sourceMappingURL=certificate.controller.js.map