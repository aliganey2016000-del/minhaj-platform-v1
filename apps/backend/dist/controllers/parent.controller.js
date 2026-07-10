"use strict";
/**
 * Parent Controller
 * Full CRUD for parents. Admin only.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlinkChild = exports.linkChild = exports.getChildren = exports.updateStatus = exports.remove = exports.update = exports.create = exports.getById = exports.getAll = void 0;
const parent_model_1 = __importDefault(require("../models/parent.model"));
const user_model_1 = __importDefault(require("../models/user.model"));
const profile_model_1 = __importDefault(require("../models/profile.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
const student_model_1 = __importDefault(require("../models/student.model"));
// ---------------------------------------------------------------------------
// GET /parents — List all with optional filters
// ---------------------------------------------------------------------------
const getAll = async (req, res) => {
    const { status, search, page = '1', limit = '10' } = req.query;
    const filter = {};
    if (status && ['active', 'inactive'].includes(status)) {
        filter.status = status;
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const [parents, total] = await Promise.all([
        parent_model_1.default.find(filter)
            .populate('user', 'email isVerified isActive')
            .populate('profile', 'firstName lastName gender')
            .populate('children', 'studentId')
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean(),
        parent_model_1.default.countDocuments(filter),
    ]);
    let result = parents;
    if (search) {
        const s = search.toLowerCase();
        result = parents.filter((p) => {
            const fullName = `${p.profile?.firstName || ''} ${p.profile?.lastName || ''}`.toLowerCase();
            const email = (p.user?.email || '').toLowerCase();
            const pid = (p.parentId || '').toLowerCase();
            return fullName.includes(s) || email.includes(s) || pid.includes(s);
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
// GET /parents/:id
// ---------------------------------------------------------------------------
const getById = async (req, res) => {
    const parent = await parent_model_1.default.findById(req.params.id)
        .populate('user', 'email isVerified isActive preferredLanguage')
        .populate('profile')
        .populate('children', 'studentId');
    if (!parent)
        throw new api_error_1.NotFoundError('Parent');
    return api_response_1.default.success(res, parent);
};
exports.getById = getById;
// ---------------------------------------------------------------------------
// POST /parents — Create parent (User + Profile + Parent)
// ---------------------------------------------------------------------------
const create = async (req, res) => {
    const { email, password, firstName, lastName, gender, phone, occupation, relationship, address, } = req.body;
    if (!email || !password || !firstName || !lastName || !gender) {
        throw new api_error_1.BadRequestError('email, password, firstName, lastName, and gender are required');
    }
    const existing = await user_model_1.default.findOne({ email: email.toLowerCase() });
    if (existing)
        throw new api_error_1.ConflictError('A user with this email already exists');
    const user = await user_model_1.default.create({
        email: email.toLowerCase(),
        password,
        role: 'parent',
        phone: phone || undefined,
        isVerified: true,
        preferredLanguage: 'en',
    });
    const profile = await profile_model_1.default.create({ user: user._id, firstName, lastName, gender });
    const count = await parent_model_1.default.countDocuments();
    const parentId = `PRN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const parent = await parent_model_1.default.create({
        user: user._id,
        profile: profile._id,
        parentId,
        occupation: occupation || '',
        relationship: relationship || 'father',
        address: address || '',
        children: [],
    });
    const populated = await parent_model_1.default.findById(parent._id)
        .populate('user', 'email isVerified isActive')
        .populate('profile', 'firstName lastName gender')
        .populate('children', 'studentId');
    return api_response_1.default.created(res, populated, 'Parent created successfully');
};
exports.create = create;
// ---------------------------------------------------------------------------
// PATCH /parents/:id — Update parent info
// ---------------------------------------------------------------------------
const update = async (req, res) => {
    const parent = await parent_model_1.default.findById(req.params.id);
    if (!parent)
        throw new api_error_1.NotFoundError('Parent');
    const { firstName, lastName, gender, occupation, relationship, address, status } = req.body;
    if (firstName || lastName || gender) {
        const profileUpdate = {};
        if (firstName)
            profileUpdate.firstName = firstName;
        if (lastName)
            profileUpdate.lastName = lastName;
        if (gender)
            profileUpdate.gender = gender;
        await profile_model_1.default.findByIdAndUpdate(parent.profile, profileUpdate);
    }
    if (occupation !== undefined)
        parent.occupation = occupation;
    if (relationship !== undefined)
        parent.relationship = relationship;
    if (address !== undefined)
        parent.address = address;
    if (status !== undefined)
        parent.status = status;
    await parent.save();
    const updated = await parent_model_1.default.findById(parent._id)
        .populate('user', 'email isVerified isActive')
        .populate('profile')
        .populate('children', 'studentId');
    return api_response_1.default.success(res, updated, 'Parent updated successfully');
};
exports.update = update;
// ---------------------------------------------------------------------------
// DELETE /parents/:id — Delete parent
// ---------------------------------------------------------------------------
const remove = async (req, res) => {
    const parent = await parent_model_1.default.findById(req.params.id);
    if (!parent)
        throw new api_error_1.NotFoundError('Parent');
    // Unlink children
    if (parent.children.length > 0) {
        await student_model_1.default.updateMany({ _id: { $in: parent.children } }, { $unset: { parent: '' } });
    }
    await Promise.all([
        user_model_1.default.findByIdAndDelete(parent.user),
        profile_model_1.default.findByIdAndDelete(parent.profile),
        parent_model_1.default.findByIdAndDelete(parent._id),
    ]);
    return api_response_1.default.noContent(res, 'Parent deleted successfully');
};
exports.remove = remove;
// ---------------------------------------------------------------------------
// PATCH /parents/:id/status — Quick status toggle
// ---------------------------------------------------------------------------
const updateStatus = async (req, res) => {
    const { status } = req.body;
    if (!status || !['active', 'inactive'].includes(status)) {
        throw new api_error_1.BadRequestError('Valid status required: active or inactive');
    }
    const parent = await parent_model_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate('profile', 'firstName lastName');
    if (!parent)
        throw new api_error_1.NotFoundError('Parent');
    return api_response_1.default.success(res, parent, `Parent status updated to ${status}`);
};
exports.updateStatus = updateStatus;
// ---------------------------------------------------------------------------
// GET /parents/:id/children — Get parent's linked children
// ---------------------------------------------------------------------------
const getChildren = async (req, res) => {
    const parent = await parent_model_1.default.findById(req.params.id)
        .populate({
        path: 'children',
        populate: [
            { path: 'profile', select: 'firstName lastName' },
            { path: 'enrolledCourses', select: 'title slug' },
        ],
        select: 'studentId status attendancePercentage gpa',
    })
        .lean();
    if (!parent)
        throw new api_error_1.NotFoundError('Parent');
    return api_response_1.default.success(res, parent.children || []);
};
exports.getChildren = getChildren;
// ---------------------------------------------------------------------------
// POST /parents/:id/link-child — Link a student to parent
// ---------------------------------------------------------------------------
const linkChild = async (req, res) => {
    const { childId } = req.body;
    if (!childId)
        throw new api_error_1.BadRequestError('childId is required');
    const student = await student_model_1.default.findById(childId);
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    const parent = await parent_model_1.default.findById(req.params.id);
    if (!parent)
        throw new api_error_1.NotFoundError('Parent');
    // Add child if not already linked
    if (!parent.children.includes(childId)) {
        parent.children.push(childId);
        await parent.save();
    }
    // Link parent to student
    student.parent = parent._id;
    await student.save();
    const updated = await parent_model_1.default.findById(parent._id)
        .populate('user', 'email')
        .populate('profile', 'firstName lastName')
        .populate('children', 'studentId');
    return api_response_1.default.success(res, updated, 'Child linked successfully');
};
exports.linkChild = linkChild;
// ---------------------------------------------------------------------------
// POST /parents/:id/unlink-child — Unlink a student from parent
// ---------------------------------------------------------------------------
const unlinkChild = async (req, res) => {
    const { childId } = req.body;
    if (!childId)
        throw new api_error_1.BadRequestError('childId is required');
    const parent = await parent_model_1.default.findById(req.params.id);
    if (!parent)
        throw new api_error_1.NotFoundError('Parent');
    parent.children = parent.children.filter((c) => c.toString() !== childId);
    await parent.save();
    await student_model_1.default.findByIdAndUpdate(childId, { $unset: { parent: '' } });
    const updated = await parent_model_1.default.findById(parent._id)
        .populate('user', 'email')
        .populate('profile', 'firstName lastName')
        .populate('children', 'studentId');
    return api_response_1.default.success(res, updated, 'Child unlinked successfully');
};
exports.unlinkChild = unlinkChild;
//# sourceMappingURL=parent.controller.js.map