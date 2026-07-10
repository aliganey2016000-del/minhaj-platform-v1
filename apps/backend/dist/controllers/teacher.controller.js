"use strict";
/**
 * Teacher Controller
 * Full CRUD for teachers. Admin only.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStatus = exports.remove = exports.update = exports.create = exports.getById = exports.getAll = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const teacher_model_1 = __importDefault(require("../models/teacher.model"));
const user_model_1 = __importDefault(require("../models/user.model"));
const profile_model_1 = __importDefault(require("../models/profile.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
// ---------------------------------------------------------------------------
// GET /teachers — List all teachers with optional filters
// ---------------------------------------------------------------------------
const getAll = async (req, res) => {
    const { status, search, page = '1', limit = '10', school } = req.query;
    const filter = {};
    if (status && ['active', 'inactive', 'on_leave'].includes(status)) {
        filter.status = status;
    }
    if (school) {
        filter.school = school;
    }
    // For text search we'll filter after population on profile name
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;
    let query = teacher_model_1.default.find(filter)
        .populate('user', 'email isVerified isActive')
        .populate('profile', 'firstName lastName gender')
        .populate('school', 'name')
        .populate('courses', 'title.en slug')
        .sort({ createdAt: -1 });
    if (search) {
        // We'll do the search in-memory after fetch (small dataset friendly)
        // For large datasets, switch to aggregation with $lookup + $match
    }
    const [teachers, total] = await Promise.all([
        query.skip(skip).limit(limitNum).lean(),
        teacher_model_1.default.countDocuments(filter),
    ]);
    // Apply search filter in-memory on profile name / email / teacherId
    let filteredTeachers = teachers;
    if (search) {
        const s = search.toLowerCase();
        filteredTeachers = teachers.filter((t) => {
            const fullName = `${t.profile?.firstName || ''} ${t.profile?.lastName || ''}`.toLowerCase();
            const email = (t.user?.email || '').toLowerCase();
            const tid = (t.teacherId || '').toLowerCase();
            return fullName.includes(s) || email.includes(s) || tid.includes(s);
        });
    }
    return api_response_1.default.paginated(res, filteredTeachers, {
        page: pageNum,
        limit: limitNum,
        total: search ? filteredTeachers.length : total,
    });
};
exports.getAll = getAll;
// ---------------------------------------------------------------------------
// GET /teachers/:id — Get single teacher by ID
// ---------------------------------------------------------------------------
const getById = async (req, res) => {
    const teacher = await teacher_model_1.default.findById(req.params.id)
        .populate('user', 'email isVerified isActive preferredLanguage')
        .populate('profile')
        .populate('school', 'name')
        .populate('courses', 'title.en slug category status');
    if (!teacher)
        throw new api_error_1.NotFoundError('Teacher');
    return api_response_1.default.success(res, teacher);
};
exports.getById = getById;
// ---------------------------------------------------------------------------
// POST /teachers — Create a new teacher (with User + Profile)
// ---------------------------------------------------------------------------
const create = async (req, res) => {
    const { email, password, firstName, lastName, gender, phone, school, qualification, specialization, experience, bio, joiningDate, } = req.body;
    if (!email || !password || !firstName || !lastName || !gender) {
        throw new api_error_1.BadRequestError('email, password, firstName, lastName, and gender are required');
    }
    // 1. Check if user already exists
    const existingUser = await user_model_1.default.findOne({ email: email.toLowerCase() });
    if (existingUser) {
        throw new api_error_1.ConflictError('A user with this email already exists');
    }
    // 2. Create User (teacher role, auto-verified)
    const user = await user_model_1.default.create({
        email: email.toLowerCase(),
        password,
        role: 'teacher',
        phone: phone || undefined,
        isVerified: true, // admin-created teachers are pre-verified
        preferredLanguage: 'en',
    });
    // 3. Create Profile
    const profile = await profile_model_1.default.create({
        user: user._id,
        firstName,
        lastName,
        gender,
    });
    // 4. Generate teacherId
    const count = await teacher_model_1.default.countDocuments();
    const teacherId = `TCH-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    // 5. Create Teacher
    const teacher = await teacher_model_1.default.create({
        user: user._id,
        profile: profile._id,
        teacherId,
        school: school || undefined,
        qualification: qualification || '',
        specialization: specialization || [],
        experience: experience || 0,
        bio: bio || '',
        joiningDate: joiningDate || new Date(),
        status: 'active',
    });
    const populated = await teacher_model_1.default.findById(teacher._id)
        .populate('user', 'email isVerified isActive')
        .populate('profile', 'firstName lastName gender')
        .populate('school', 'name');
    return api_response_1.default.created(res, populated, 'Teacher created successfully');
};
exports.create = create;
// ---------------------------------------------------------------------------
// PATCH /teachers/:id — Update teacher info
// ---------------------------------------------------------------------------
const update = async (req, res) => {
    const teacher = await teacher_model_1.default.findById(req.params.id);
    if (!teacher)
        throw new api_error_1.NotFoundError('Teacher');
    const { firstName, lastName, gender, school, qualification, specialization, experience, bio, status, joiningDate, } = req.body;
    // Update profile if name/gender changed
    if (firstName || lastName || gender) {
        const profileUpdate = {};
        if (firstName)
            profileUpdate.firstName = firstName;
        if (lastName)
            profileUpdate.lastName = lastName;
        if (gender)
            profileUpdate.gender = gender;
        await profile_model_1.default.findByIdAndUpdate(teacher.profile, profileUpdate);
    }
    // Update teacher fields
    if (school !== undefined)
        teacher.school = school || null;
    if (qualification !== undefined)
        teacher.qualification = qualification;
    if (specialization !== undefined)
        teacher.specialization = specialization;
    if (experience !== undefined)
        teacher.experience = experience;
    if (bio !== undefined)
        teacher.bio = bio;
    if (status !== undefined)
        teacher.status = status;
    if (joiningDate !== undefined)
        teacher.joiningDate = new Date(joiningDate);
    await teacher.save();
    const updated = await teacher_model_1.default.findById(teacher._id)
        .populate('user', 'email isVerified isActive')
        .populate('profile')
        .populate('school', 'name')
        .populate('courses', 'title.en slug category status');
    return api_response_1.default.success(res, updated, 'Teacher updated successfully');
};
exports.update = update;
// ---------------------------------------------------------------------------
// DELETE /teachers/:id — Delete teacher (also removes User + Profile)
// ---------------------------------------------------------------------------
const remove = async (req, res) => {
    const teacher = await teacher_model_1.default.findById(req.params.id);
    if (!teacher)
        throw new api_error_1.NotFoundError('Teacher');
    // Check if teacher has active courses
    const Course = mongoose_1.default.model('Course');
    const activeCourses = await Course.countDocuments({
        teacher: teacher._id,
        status: { $in: ['published', 'draft'] },
    });
    if (activeCourses > 0) {
        throw new api_error_1.BadRequestError(`Cannot delete teacher. They are assigned to ${activeCourses} active course(s). Reassign or remove courses first.`);
    }
    // Delete User, Profile, and Teacher
    await Promise.all([
        user_model_1.default.findByIdAndDelete(teacher.user),
        profile_model_1.default.findByIdAndDelete(teacher.profile),
        teacher_model_1.default.findByIdAndDelete(teacher._id),
    ]);
    return api_response_1.default.noContent(res, 'Teacher deleted successfully');
};
exports.remove = remove;
// ---------------------------------------------------------------------------
// PATCH /teachers/:id/status — Quick status toggle (active/inactive/on_leave)
// ---------------------------------------------------------------------------
const updateStatus = async (req, res) => {
    const { status } = req.body;
    if (!status || !['active', 'inactive', 'on_leave'].includes(status)) {
        throw new api_error_1.BadRequestError('Valid status required: active, inactive, or on_leave');
    }
    const teacher = await teacher_model_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true })
        .populate('profile', 'firstName lastName')
        .populate('school', 'name');
    if (!teacher)
        throw new api_error_1.NotFoundError('Teacher');
    return api_response_1.default.success(res, teacher, `Teacher status updated to ${status}`);
};
exports.updateStatus = updateStatus;
//# sourceMappingURL=teacher.controller.js.map