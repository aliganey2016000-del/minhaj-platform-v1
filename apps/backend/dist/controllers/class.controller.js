"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSchedule = exports.updateStatus = exports.remove = exports.update = exports.create = exports.getAll = void 0;
const class_model_1 = __importDefault(require("../models/class.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// ---------------------------------------------------------------------------
// GET /classes — List all with optional filters
// ---------------------------------------------------------------------------
const getAll = async (req, res) => {
    const { schoolId, status, page = '1', limit = '50', search } = req.query;
    const filter = {};
    if (schoolId)
        filter.school = schoolId;
    if (status && ['active', 'inactive', 'completed'].includes(status))
        filter.status = status;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const [classes, total] = await Promise.all([
        class_model_1.default.find(filter)
            .populate('school', 'name')
            .populate('course', 'title.en slug category')
            .populate('teacher', 'teacherId')
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean(),
        class_model_1.default.countDocuments(filter),
    ]);
    let result = classes;
    if (search) {
        const s = search.toLowerCase();
        result = classes.filter((c) => {
            const title = (c.title || '').toLowerCase();
            const room = (c.room || '').toLowerCase();
            const section = (c.section || '').toLowerCase();
            const schoolName = (c.school?.name || '').toLowerCase();
            return title.includes(s) || room.includes(s) || section.includes(s) || schoolName.includes(s);
        });
    }
    return api_response_1.default.paginated(res, result, {
        page: pageNum,
        limit: limitNum,
        total: search ? result.length : total,
    });
};
exports.getAll = getAll;
// ---------------------------------------------------------------------------
// POST /classes — Create
// ---------------------------------------------------------------------------
const create = async (req, res) => {
    const cls = await class_model_1.default.create(req.body);
    const populated = await class_model_1.default.findById(cls._id)
        .populate('school', 'name')
        .populate('course', 'title.en slug category')
        .populate('teacher', 'teacherId')
        .lean();
    return api_response_1.default.created(res, populated, 'Class created successfully');
};
exports.create = create;
// ---------------------------------------------------------------------------
// PATCH /classes/:id — Update
// ---------------------------------------------------------------------------
const update = async (req, res) => {
    const cls = await class_model_1.default.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    })
        .populate('school', 'name')
        .populate('course', 'title.en slug category')
        .populate('teacher', 'teacherId')
        .lean();
    if (!cls)
        throw new api_error_1.NotFoundError('Class');
    return api_response_1.default.success(res, cls, 'Class updated successfully');
};
exports.update = update;
// ---------------------------------------------------------------------------
// DELETE /classes/:id
// ---------------------------------------------------------------------------
const remove = async (req, res) => {
    const cls = await class_model_1.default.findByIdAndDelete(req.params.id);
    if (!cls)
        throw new api_error_1.NotFoundError('Class');
    return api_response_1.default.noContent(res, 'Class deleted');
};
exports.remove = remove;
// ---------------------------------------------------------------------------
// PATCH /classes/:id/status — Quick status toggle
// ---------------------------------------------------------------------------
const updateStatus = async (req, res) => {
    const { status } = req.body;
    if (!status || !['active', 'inactive', 'completed'].includes(status)) {
        throw new api_error_1.BadRequestError('Valid status required: active, inactive, or completed');
    }
    const cls = await class_model_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true })
        .populate('school', 'name')
        .populate('course', 'title.en slug')
        .lean();
    if (!cls)
        throw new api_error_1.NotFoundError('Class');
    return api_response_1.default.success(res, cls, `Class status updated to ${status}`);
};
exports.updateStatus = updateStatus;
// ---------------------------------------------------------------------------
// GET /classes/schedule/:courseId — Weekly schedule grouped by day
// ---------------------------------------------------------------------------
const getSchedule = async (req, res) => {
    const classes = await class_model_1.default.find({ course: req.params.courseId })
        .populate('teacher', 'teacherId')
        .sort({ dayOfWeek: 1, startTime: 1 })
        .lean();
    const schedule = days.map((day, i) => ({
        day,
        dayIndex: i,
        classes: classes.filter((c) => c.dayOfWeek === i),
    }));
    return api_response_1.default.success(res, schedule);
};
exports.getSchedule = getSchedule;
//# sourceMappingURL=class.controller.js.map