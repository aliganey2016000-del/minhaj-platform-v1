"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackDownload = exports.remove = exports.getAll = exports.create = exports.getMyDownloads = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const resource_model_1 = __importDefault(require("../models/resource.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
const ensure_student_1 = __importDefault(require("../utils/ensure-student"));
// GET /my — Student's downloads from enrolled courses
const getMyDownloads = async (req, res) => {
    const student = await (0, ensure_student_1.default)(req.user.userId);
    const courseIds = (student.enrolledCourses || []).map((id) => id);
    const resources = await resource_model_1.default.find({ course: { $in: courseIds }, status: 'active' })
        .populate('course', 'title.en slug')
        .sort({ createdAt: -1 })
        .lean();
    return api_response_1.default.success(res, resources);
};
exports.getMyDownloads = getMyDownloads;
// POST /
const create = async (req, res) => {
    const payload = { ...req.body, uploadedBy: new mongoose_1.default.Types.ObjectId(req.user.userId) };
    const item = await resource_model_1.default.create(payload);
    const populated = await resource_model_1.default.findById(item._id).populate('course', 'title.en slug').lean();
    return api_response_1.default.created(res, populated, 'Resource uploaded');
};
exports.create = create;
// GET / (admin)
const getAll = async (req, res) => {
    const { courseId, category, page = '1', limit = '20' } = req.query;
    const filter = {};
    if (courseId)
        filter.course = courseId;
    if (category)
        filter.category = category;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const [items, total] = await Promise.all([
        resource_model_1.default.find(filter).populate('course', 'title.en slug').sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
        resource_model_1.default.countDocuments(filter),
    ]);
    return api_response_1.default.paginated(res, items, { page: pageNum, limit: limitNum, total });
};
exports.getAll = getAll;
// DELETE /:id
const remove = async (req, res) => {
    const item = await resource_model_1.default.findByIdAndDelete(req.params.id);
    if (!item)
        throw new api_error_1.NotFoundError('Resource');
    return api_response_1.default.noContent(res, 'Deleted');
};
exports.remove = remove;
// POST /:id/download — track download
const trackDownload = async (req, res) => {
    const item = await resource_model_1.default.findByIdAndUpdate(req.params.id, { $inc: { downloads: 1 } }, { new: true }).lean();
    if (!item)
        throw new api_error_1.NotFoundError('Resource');
    return api_response_1.default.success(res, item);
};
exports.trackDownload = trackDownload;
//# sourceMappingURL=resource.controller.js.map