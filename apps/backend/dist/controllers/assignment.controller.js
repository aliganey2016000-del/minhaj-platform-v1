"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.remove = exports.updateStatus = exports.update = exports.getAll = exports.getMyAssignments = exports.create = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const assignment_model_1 = __importDefault(require("../models/assignment.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
const ensure_student_1 = __importDefault(require("../utils/ensure-student"));
// POST /
const create = async (req, res) => {
    const payload = { ...req.body, createdBy: new mongoose_1.default.Types.ObjectId(req.user.userId) };
    const item = await assignment_model_1.default.create(payload);
    const populated = await assignment_model_1.default.findById(item._id).populate('course', 'title.en slug').populate('createdBy', 'email').lean();
    return api_response_1.default.created(res, populated, 'Assignment created');
};
exports.create = create;
// GET /my — Student sees assignments for their enrolled courses
const getMyAssignments = async (req, res) => {
    const student = await (0, ensure_student_1.default)(req.user.userId);
    const courseIds = (student.enrolledCourses || []).map((id) => id);
    const assignments = await assignment_model_1.default.find({ course: { $in: courseIds }, status: 'active' })
        .populate('course', 'title.en slug category')
        .sort({ dueDate: 1 })
        .lean();
    const now = new Date();
    const withStatus = assignments.map((a) => ({
        ...a,
        isDue: new Date(a.dueDate) > now,
        isOverdue: new Date(a.dueDate) < now,
    }));
    return api_response_1.default.success(res, withStatus);
};
exports.getMyAssignments = getMyAssignments;
// GET / — Admin/Teacher list
const getAll = async (req, res) => {
    const { courseId, status, page = '1', limit = '20', search } = req.query;
    const filter = {};
    if (courseId)
        filter.course = courseId;
    if (status)
        filter.status = status;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const [items, total] = await Promise.all([
        assignment_model_1.default.find(filter).populate('course', 'title.en slug').sort({ dueDate: 1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
        assignment_model_1.default.countDocuments(filter),
    ]);
    let result = items;
    if (search) {
        const s = search.toLowerCase();
        result = items.filter((a) => (a.title || '').toLowerCase().includes(s) || (a.description || '').toLowerCase().includes(s));
    }
    return api_response_1.default.paginated(res, result, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};
exports.getAll = getAll;
// PATCH /:id
const update = async (req, res) => {
    const item = await assignment_model_1.default.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('course', 'title.en slug').lean();
    if (!item)
        throw new api_error_1.NotFoundError('Assignment');
    return api_response_1.default.success(res, item, 'Updated');
};
exports.update = update;
// PATCH /:id/status
const updateStatus = async (req, res) => {
    const { status } = req.body;
    if (!status)
        throw new api_error_1.BadRequestError('Status required');
    const item = await assignment_model_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!item)
        throw new api_error_1.NotFoundError('Assignment');
    return api_response_1.default.success(res, item, `Status updated to ${status}`);
};
exports.updateStatus = updateStatus;
// DELETE /:id
const remove = async (req, res) => {
    const item = await assignment_model_1.default.findByIdAndDelete(req.params.id);
    if (!item)
        throw new api_error_1.NotFoundError('Assignment');
    return api_response_1.default.noContent(res, 'Deleted');
};
exports.remove = remove;
//# sourceMappingURL=assignment.controller.js.map