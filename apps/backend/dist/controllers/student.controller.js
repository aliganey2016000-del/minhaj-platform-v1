"use strict";
/**
 * Student Controller
 * Handles student-related HTTP requests:
 * CRUD operations, profile access, parent tracking,
 * attendance, results, and payment lookups.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reject = exports.approve = exports.exportStudents = exports.bulkImport = exports.getCertificates = exports.getPayments = exports.getResults = exports.getAttendance = exports.getMyCourses = exports.getCourses = exports.getMyDashboard = exports.remove = exports.updateStatus = exports.update = exports.create = exports.getById = exports.getAll = void 0;
const student_model_1 = __importDefault(require("../models/student.model"));
const user_model_1 = __importDefault(require("../models/user.model"));
const profile_model_1 = __importDefault(require("../models/profile.model"));
const progress_model_1 = __importDefault(require("../models/progress.model"));
const course_content_model_1 = __importDefault(require("../models/course-content.model"));
const api_error_1 = require("../utils/api-error");
const api_response_1 = __importDefault(require("../utils/api-response"));
const ensure_student_1 = __importDefault(require("../utils/ensure-student"));
// ---------------------------------------------------------------------------
// List Students (Admin & Teacher only)
// ---------------------------------------------------------------------------
const getAll = async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const status = req.query.status;
    const approvalStatus = req.query.approvalStatus;
    const search = req.query.search;
    const filter = {};
    if (status && ['active', 'inactive', 'graduated', 'suspended'].includes(status)) {
        filter.status = status;
    }
    if (approvalStatus === 'approved') {
        // Match explicitly approved OR legacy students (null/undefined) who were created before this field existed
        filter.$or = [
            { approvalStatus: 'approved' },
            { approvalStatus: { $in: [null, undefined] } },
        ];
    }
    else if (approvalStatus === 'pending') {
        filter.approvalStatus = 'pending';
    }
    else if (approvalStatus === 'rejected') {
        filter.approvalStatus = 'rejected';
    }
    if (req.user?.role === 'teacher') {
        // In production, filter by teacher's assigned courses
    }
    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        filter.$or = filter.$or || [];
        filter.$or.push({ studentId: searchRegex });
    }
    let allStudents;
    let total;
    if (search) {
        const [students, count] = await Promise.all([
            student_model_1.default.find(filter)
                .populate('user', 'email role isActive isVerified preferredLanguage')
                .populate('profile', 'firstName lastName avatar gender')
                .populate('parent', 'user profile')
                .populate('school', 'name')
                .populate('class', 'title section')
                .populate('enrolledCourses', 'title slug')
                .sort({ createdAt: -1 })
                .lean(),
            student_model_1.default.countDocuments(filter),
        ]);
        const s = search.toLowerCase();
        const filtered = students.filter((st) => {
            const fullName = `${st.profile?.firstName || ''} ${st.profile?.lastName || ''}`.toLowerCase();
            const email = (st.user?.email || '').toLowerCase();
            const sid = (st.studentId || '').toLowerCase();
            return fullName.includes(s) || email.includes(s) || sid.includes(s);
        });
        total = filtered.length;
        allStudents = filtered.slice((page - 1) * limit, page * limit);
    }
    else {
        const [students, count] = await Promise.all([
            student_model_1.default.find(filter)
                .populate('user', 'email role isActive isVerified preferredLanguage')
                .populate('profile', 'firstName lastName avatar gender')
                .populate('parent', 'user profile')
                .populate('school', 'name')
                .populate('class', 'title section')
                .populate('enrolledCourses', 'title slug')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            student_model_1.default.countDocuments(filter),
        ]);
        allStudents = students;
        total = count;
    }
    return api_response_1.default.paginated(res, allStudents, { page, limit, total });
};
exports.getAll = getAll;
// ---------------------------------------------------------------------------
// Get Single Student
// ---------------------------------------------------------------------------
const getById = async (req, res) => {
    const student = await student_model_1.default.findById(req.params.id)
        .populate('user', 'email role isActive isVerified preferredLanguage')
        .populate('profile', 'firstName lastName avatar gender dateOfBirth address emergencyContact')
        .populate('school', 'name')
        .populate('class', 'title section')
        .populate('parent', 'user profile children')
        .populate('enrolledCourses', 'title slug category level status')
        .lean();
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    const userId = req.user?.userId;
    const role = req.user?.role;
    if (role === 'student' && student.user?._id?.toString() !== userId) {
        throw new api_error_1.ForbiddenError('You can only view your own profile');
    }
    if (role === 'parent') {
        const parentId = student.parent?._id?.toString();
        if (!parentId)
            throw new api_error_1.ForbiddenError('You can only view your linked children');
    }
    return api_response_1.default.success(res, student);
};
exports.getById = getById;
// ---------------------------------------------------------------------------
// Create Student (Admin only)
// ---------------------------------------------------------------------------
const create = async (req, res) => {
    const { email, password, firstName, lastName, gender, phone, enrollmentDate, school, classId, grade, medicalNotes, parentId, preferredLanguage } = req.body;
    const user = await user_model_1.default.create({
        email: email.toLowerCase(), password, role: 'student',
        phone: phone || undefined, preferredLanguage: preferredLanguage || 'en', isVerified: true,
    });
    const profile = await profile_model_1.default.create({ user: user._id, firstName, lastName, gender });
    const student = await student_model_1.default.create({
        user: user._id, profile: profile._id, parent: parentId || undefined,
        school: school || undefined, class: classId || undefined,
        enrollmentDate: enrollmentDate || new Date(), grade: grade || undefined, medicalNotes: medicalNotes || undefined,
    });
    const populated = await student_model_1.default.findById(student._id)
        .populate('user', 'email role isActive preferredLanguage')
        .populate('profile', 'firstName lastName avatar gender')
        .populate('school', 'name')
        .populate('class', 'title section')
        .populate('parent', 'user profile').lean();
    return api_response_1.default.created(res, populated, 'Student created successfully');
};
exports.create = create;
// ---------------------------------------------------------------------------
// Update Student (Admin only)
// ---------------------------------------------------------------------------
const update = async (req, res) => {
    const student = await student_model_1.default.findById(req.params.id);
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    const { firstName, lastName, gender, school, classId, grade, medicalNotes, parent, enrollmentDate, status, attendancePercentage, gpa, totalFeesPaid, totalFeesDue } = req.body;
    if (firstName || lastName || gender) {
        const profileUpdate = {};
        if (firstName)
            profileUpdate.firstName = firstName;
        if (lastName)
            profileUpdate.lastName = lastName;
        if (gender)
            profileUpdate.gender = gender;
        await profile_model_1.default.findByIdAndUpdate(student.profile, profileUpdate);
    }
    if (school !== undefined)
        student.school = school || undefined;
    if (classId !== undefined)
        student.class = classId || undefined;
    if (grade !== undefined)
        student.grade = grade;
    if (medicalNotes !== undefined)
        student.medicalNotes = medicalNotes;
    if (parent !== undefined)
        student.parent = parent || undefined;
    if (enrollmentDate !== undefined)
        student.enrollmentDate = new Date(enrollmentDate);
    if (status !== undefined)
        student.status = status;
    if (attendancePercentage !== undefined)
        student.attendancePercentage = attendancePercentage;
    if (gpa !== undefined)
        student.gpa = gpa;
    if (totalFeesPaid !== undefined)
        student.totalFeesPaid = totalFeesPaid;
    if (totalFeesDue !== undefined)
        student.totalFeesDue = totalFeesDue;
    await student.save();
    const updated = await student_model_1.default.findById(student._id)
        .populate('user', 'email role isActive isVerified preferredLanguage')
        .populate('profile', 'firstName lastName avatar gender')
        .populate('school', 'name')
        .populate('class', 'title section')
        .populate('parent', 'user profile')
        .populate('enrolledCourses', 'title slug');
    return api_response_1.default.success(res, updated, 'Student updated successfully');
};
exports.update = update;
// ---------------------------------------------------------------------------
// Quick Status Toggle
// ---------------------------------------------------------------------------
const updateStatus = async (req, res) => {
    const { status } = req.body;
    if (!status || !['active', 'inactive', 'graduated', 'suspended'].includes(status)) {
        throw new api_error_1.BadRequestError('Valid status required: active, inactive, graduated, or suspended');
    }
    const student = await student_model_1.default.findByIdAndUpdate(req.params.id, { status }, { new: true })
        .populate('profile', 'firstName lastName');
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    return api_response_1.default.success(res, student, `Student status updated to ${status}`);
};
exports.updateStatus = updateStatus;
// ---------------------------------------------------------------------------
// Delete Student (soft delete)
// ---------------------------------------------------------------------------
const remove = async (req, res) => {
    const student = await student_model_1.default.findById(req.params.id);
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    await user_model_1.default.findByIdAndUpdate(student.user, { isActive: false });
    student.status = 'inactive';
    await student.save();
    return api_response_1.default.noContent(res, 'Student deleted (deactivated) successfully');
};
exports.remove = remove;
// ---------------------------------------------------------------------------
// Student Dashboard Summary (self-service)
// ---------------------------------------------------------------------------
const getMyDashboard = async (req, res) => {
    const student = await (0, ensure_student_1.default)(req.user.userId);
    await student.populate('enrolledCourses', 'title slug category level status thumbnail');
    return api_response_1.default.success(res, {
        studentId: student.studentId || 'N/A',
        status: student.status || 'active',
        enrolledCourses: student.enrolledCourses || [],
        coursesCount: student.enrolledCourses?.length || 0,
        attendancePercentage: student.attendancePercentage || 0,
        gpa: student.gpa || 0,
        totalFeesPaid: student.totalFeesPaid || 0,
        totalFeesDue: student.totalFeesDue || 0,
    });
};
exports.getMyDashboard = getMyDashboard;
// ---------------------------------------------------------------------------
// Student's Enrolled Courses
// ---------------------------------------------------------------------------
const getCourses = async (req, res) => {
    const student = await student_model_1.default.findById(req.params.id)
        .populate({ path: 'enrolledCourses', select: 'title slug description category level status teacher thumbnail', populate: { path: 'teacher', select: 'user profile' } })
        .lean();
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    return api_response_1.default.success(res, student.enrolledCourses || []);
};
exports.getCourses = getCourses;
// ---------------------------------------------------------------------------
// Get My Courses (self)
// ---------------------------------------------------------------------------
const getMyCourses = async (req, res) => {
    const student = await (0, ensure_student_1.default)(req.user.userId);
    const populated = await student_model_1.default.findById(student._id)
        .populate({
        path: 'enrolledCourses',
        select: 'title slug description category level status teacher thumbnail duration fee maxStudents enrolledStudents',
        populate: { path: 'teacher', select: 'user profile', populate: { path: 'profile', select: 'firstName lastName' } },
    })
        .lean();
    const enrolled = populated?.enrolledCourses || [];
    // Fetch progress records for all enrolled courses
    const courseIds = enrolled.map((c) => c._id);
    const [progressRecords, contentRecords] = await Promise.all([
        progress_model_1.default.find({ student: student._id, course: { $in: courseIds } }).lean(),
        course_content_model_1.default.find({ course: { $in: courseIds } }).select('course totalLessons totalQuizzes totalAssignments totalDuration').lean(),
    ]);
    const progressMap = {};
    for (const p of progressRecords) {
        progressMap[p.course.toString()] = p;
    }
    const contentMap = {};
    for (const c of contentRecords) {
        contentMap[c.course.toString()] = c;
    }
    // Merge progress and content stats into each course
    const coursesWithProgress = enrolled.map((course) => {
        const cid = course._id.toString();
        const prog = progressMap[cid];
        const content = contentMap[cid];
        const totalLessons = content?.totalLessons || 0;
        const totalQuizzes = content?.totalQuizzes || 0;
        const totalAssignments = content?.totalAssignments || 0;
        const totalItems = totalLessons + totalQuizzes + totalAssignments;
        const completedItems = (prog?.completedLessons || 0) + (prog?.completedQuizzes || 0) + (prog?.completedAssignments || 0);
        const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
        return {
            ...course,
            progress: {
                percent: progressPercent,
                completedLessons: prog?.completedLessons || 0,
                completedQuizzes: prog?.completedQuizzes || 0,
                completedAssignments: prog?.completedAssignments || 0,
                totalLessons,
                totalQuizzes,
                totalAssignments,
                totalItems,
                completedItems,
                status: prog?.status || 'in_progress',
                lastAccessed: prog?.lastAccessed || null,
            },
        };
    });
    return api_response_1.default.success(res, coursesWithProgress);
};
exports.getMyCourses = getMyCourses;
// ---------------------------------------------------------------------------
// Attendance Summary
// ---------------------------------------------------------------------------
const getAttendance = async (req, res) => {
    const student = await student_model_1.default.findById(req.params.id).select('attendancePercentage').lean();
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    return api_response_1.default.success(res, { attendancePercentage: student.attendancePercentage || 0 });
};
exports.getAttendance = getAttendance;
// ---------------------------------------------------------------------------
// Results Summary
// ---------------------------------------------------------------------------
const getResults = async (req, res) => {
    const student = await student_model_1.default.findById(req.params.id).select('gpa').lean();
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    return api_response_1.default.success(res, { gpa: student.gpa || 0 });
};
exports.getResults = getResults;
// ---------------------------------------------------------------------------
// Payments Summary
// ---------------------------------------------------------------------------
const getPayments = async (req, res) => {
    const student = await student_model_1.default.findById(req.params.id).select('totalFeesPaid totalFeesDue').lean();
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    return api_response_1.default.success(res, { totalFeesPaid: student.totalFeesPaid || 0, totalFeesDue: student.totalFeesDue || 0 });
};
exports.getPayments = getPayments;
// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------
const getCertificates = async (_req, res) => {
    return api_response_1.default.success(res, { certificates: [] });
};
exports.getCertificates = getCertificates;
// ---------------------------------------------------------------------------
// Bulk Import / Export (placeholders)
// ---------------------------------------------------------------------------
const bulkImport = async (_req, _res) => {
    throw new api_error_1.BadRequestError('Bulk import not yet implemented');
};
exports.bulkImport = bulkImport;
const exportStudents = async (_req, _res) => {
    throw new api_error_1.BadRequestError('Export not yet implemented');
};
exports.exportStudents = exportStudents;
// ---------------------------------------------------------------------------
// Approve / Reject Student (Admin)
// ---------------------------------------------------------------------------
const approve = async (req, res) => {
    const { school, classId } = req.body;
    if (!school)
        throw new api_error_1.BadRequestError('School is required for approval');
    if (!classId)
        throw new api_error_1.BadRequestError('Class is required for approval');
    const student = await student_model_1.default.findByIdAndUpdate(req.params.id, { approvalStatus: 'approved', school, class: classId }, { new: true })
        .populate('user', 'email role isActive preferredLanguage')
        .populate('profile', 'firstName lastName avatar gender')
        .populate('school', 'name')
        .populate('class', 'title section');
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    return api_response_1.default.success(res, student, 'Student approved successfully');
};
exports.approve = approve;
const reject = async (req, res) => {
    const student = await student_model_1.default.findByIdAndUpdate(req.params.id, { approvalStatus: 'rejected' }, { new: true })
        .populate('user', 'email')
        .populate('profile', 'firstName lastName');
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    return api_response_1.default.success(res, student, 'Student rejected');
};
exports.reject = reject;
//# sourceMappingURL=student.controller.js.map