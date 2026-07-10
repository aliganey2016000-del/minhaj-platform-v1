"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStatus = exports.getMyExams = exports.remove = exports.update = exports.create = exports.getById = exports.getAll = void 0;
const exam_model_1 = __importDefault(require("../models/exam.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
const ensure_student_1 = __importDefault(require("../utils/ensure-student"));
// GET /exams — List all with optional filters
const getAll = async (req, res) => {
    const { courseId, status, page = '1', limit = '50', search } = req.query;
    const filter = {};
    if (courseId)
        filter.course = courseId;
    if (status && ['scheduled', 'ongoing', 'completed', 'cancelled'].includes(status))
        filter.status = status;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const [exams, total] = await Promise.all([
        exam_model_1.default.find(filter)
            .populate('course', 'title.en slug category')
            .populate('createdBy', 'email')
            .sort({ examDate: 1, startTime: 1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean(),
        exam_model_1.default.countDocuments(filter),
    ]);
    let result = exams;
    if (search) {
        const s = search.toLowerCase();
        result = exams.filter((e) => {
            const title = (e.title || '').toLowerCase();
            const courseName = (e.course?.title?.en || '').toLowerCase();
            const room = (e.room || '').toLowerCase();
            return title.includes(s) || courseName.includes(s) || room.includes(s);
        });
    }
    return api_response_1.default.paginated(res, result, {
        page: pageNum,
        limit: limitNum,
        total: search ? result.length : total,
    });
};
exports.getAll = getAll;
// GET /exams/:id
const getById = async (req, res) => {
    const exam = await exam_model_1.default.findById(req.params.id)
        .populate('course', 'title.en slug category enrolledStudents maxStudents')
        .populate('createdBy', 'email')
        .lean();
    if (!exam)
        throw new api_error_1.NotFoundError('Exam');
    return api_response_1.default.success(res, exam);
};
exports.getById = getById;
// POST /exams
const create = async (req, res) => {
    const payload = { ...req.body, createdBy: req.user.userId };
    const exam = await exam_model_1.default.create(payload);
    const populated = await exam_model_1.default.findById(exam._id)
        .populate('course', 'title.en slug category')
        .populate('createdBy', 'email')
        .lean();
    return api_response_1.default.created(res, populated, 'Exam created successfully');
};
exports.create = create;
// PATCH /exams/:id
const update = async (req, res) => {
    const exam = await exam_model_1.default.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    })
        .populate('course', 'title.en slug category')
        .populate('createdBy', 'email')
        .lean();
    if (!exam)
        throw new api_error_1.NotFoundError('Exam');
    return api_response_1.default.success(res, exam, 'Exam updated successfully');
};
exports.update = update;
// DELETE /exams/:id
const remove = async (req, res) => {
    const exam = await exam_model_1.default.findByIdAndDelete(req.params.id);
    if (!exam)
        throw new api_error_1.NotFoundError('Exam');
    return api_response_1.default.noContent(res, 'Exam deleted');
};
exports.remove = remove;
// GET /exams/my — Student's exams from enrolled courses
const getMyExams = async (req, res) => {
    const student = await (0, ensure_student_1.default)(req.user.userId);
    const courseIds = (student.enrolledCourses || []).map((id) => id);
    const exams = await exam_model_1.default.find({ course: { $in: courseIds } })
        .populate('course', 'title.en slug category')
        .populate('createdBy', 'email')
        .sort({ examDate: 1, startTime: 1 })
        .lean();
    return api_response_1.default.success(res, exams);
};
exports.getMyExams = getMyExams;
// PATCH /exams/:id/status
const updateStatus = async (req, res) => {
    const { status } = req.body;
    if (!status || !['scheduled', 'ongoing', 'completed', 'cancelled'].includes(status)) {
        throw new api_error_1.BadRequestError('Valid status required: scheduled, ongoing, completed, or cancelled');
    }
    const exam = await exam_model_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true })
        .populate('course', 'title.en slug')
        .lean();
    if (!exam)
        throw new api_error_1.NotFoundError('Exam');
    return api_response_1.default.success(res, exam, `Exam status updated to ${status}`);
};
exports.updateStatus = updateStatus;
//# sourceMappingURL=exam.controller.js.map