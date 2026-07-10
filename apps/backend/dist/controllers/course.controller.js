"use strict";
/**
 * Course Controller
 * Handles course-related HTTP requests:
 * CRUD operations, enrollment, listing.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCategories = exports.getAvailableCourses = exports.selfUnenroll = exports.selfEnroll = exports.getEnrolledStudents = exports.unenrollStudent = exports.enrollStudent = exports.remove = exports.update = exports.create = exports.getByIdAdmin = exports.getBySlug = exports.getAllAdmin = exports.getAllPublic = void 0;
const course_model_1 = __importDefault(require("../models/course.model"));
const student_model_1 = __importDefault(require("../models/student.model"));
require("../models/teacher.model"); // Register Teacher model for population
const api_error_1 = require("../utils/api-error");
const api_response_1 = __importDefault(require("../utils/api-response"));
const ensure_student_1 = __importDefault(require("../utils/ensure-student"));
// ---------------------------------------------------------------------------
// List Courses (Public — only published)
// ---------------------------------------------------------------------------
const getAllPublic = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const category = req.query.category;
    const level = req.query.level;
    const search = req.query.search;
    const filter = { status: 'published' };
    if (category)
        filter.category = category;
    if (level)
        filter.level = level;
    if (search) {
        filter.$or = [
            { 'title.en': { $regex: search, $options: 'i' } },
            { 'title.so': { $regex: search, $options: 'i' } },
            { 'title.ar': { $regex: search, $options: 'i' } },
        ];
    }
    const [courses, total] = await Promise.all([
        course_model_1.default.find(filter)
            .populate({
            path: 'teacher',
            select: 'teacherId profile',
            populate: { path: 'profile', select: 'firstName lastName' },
        })
            .populate('school', 'name')
            .populate({ path: 'class', select: 'title section' })
            .select('-syllabus')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        course_model_1.default.countDocuments(filter),
    ]);
    return api_response_1.default.paginated(res, courses, { page, limit, total });
};
exports.getAllPublic = getAllPublic;
// ---------------------------------------------------------------------------
// List Courses (Admin — all statuses)
// ---------------------------------------------------------------------------
const getAllAdmin = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const status = req.query.status;
    const category = req.query.category;
    const filter = {};
    if (status)
        filter.status = status;
    if (category)
        filter.category = category;
    const [courses, total] = await Promise.all([
        course_model_1.default.find(filter)
            .populate({
            path: 'teacher',
            select: 'teacherId profile',
            populate: { path: 'profile', select: 'firstName lastName' },
        })
            .populate('school', 'name')
            .populate({ path: 'class', select: 'title section' })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        course_model_1.default.countDocuments(filter),
    ]);
    return api_response_1.default.paginated(res, courses, { page, limit, total });
};
exports.getAllAdmin = getAllAdmin;
// ---------------------------------------------------------------------------
// Get Single Course (Public — by slug)
// ---------------------------------------------------------------------------
const getBySlug = async (req, res) => {
    const course = await course_model_1.default.findOne({ slug: req.params.slug, status: 'published' })
        .populate({
        path: 'teacher',
        select: 'teacherId profile',
        populate: { path: 'profile', select: 'firstName lastName' },
    })
        .populate('school', 'name')
        .populate({ path: 'class', select: 'title section' })
        .lean();
    if (!course) {
        throw new api_error_1.NotFoundError('Course');
    }
    return api_response_1.default.success(res, course);
};
exports.getBySlug = getBySlug;
// ---------------------------------------------------------------------------
// Get Single Course (Admin — by ID)
// ---------------------------------------------------------------------------
const getByIdAdmin = async (req, res) => {
    const course = await course_model_1.default.findById(req.params.id)
        .populate({
        path: 'teacher',
        select: 'teacherId profile',
        populate: { path: 'profile', select: 'firstName lastName' },
    })
        .populate('school', 'name')
        .populate({ path: 'class', select: 'title section' })
        .lean();
    if (!course) {
        throw new api_error_1.NotFoundError('Course');
    }
    return api_response_1.default.success(res, course);
};
exports.getByIdAdmin = getByIdAdmin;
// ---------------------------------------------------------------------------
// Create Course (Admin only)
// ---------------------------------------------------------------------------
const create = async (req, res) => {
    const { title, description, category, level, duration, fee, teacher, school, class: classId, maxStudents, syllabus, prerequisites } = req.body;
    // Generate slug from English title
    const slug = title.en
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    // Check for duplicate slug
    const existing = await course_model_1.default.findOne({ slug });
    if (existing) {
        throw new api_error_1.ConflictError('A course with this title already exists');
    }
    const course = await course_model_1.default.create({
        title,
        slug,
        description,
        category,
        level,
        duration,
        fee: fee || 0,
        teacher: teacher || null,
        school: school || null,
        class: classId || null,
        maxStudents,
        syllabus: syllabus || [],
        prerequisites: prerequisites || [],
        status: 'draft',
    });
    const populated = await course_model_1.default.findById(course._id)
        .populate({
        path: 'teacher',
        select: 'teacherId profile',
        populate: { path: 'profile', select: 'firstName lastName' },
    })
        .populate('school', 'name')
        .populate({ path: 'class', select: 'title section' })
        .lean();
    return api_response_1.default.created(res, populated, 'Course created successfully');
};
exports.create = create;
// ---------------------------------------------------------------------------
// Update Course (Admin only)
// ---------------------------------------------------------------------------
const update = async (req, res) => {
    const allowedUpdates = [
        'title', 'description', 'category', 'level', 'duration',
        'fee', 'teacher', 'school', 'class', 'maxStudents', 'syllabus', 'prerequisites', 'status',
        'startDate', 'endDate', 'thumbnail',
    ];
    const updates = {};
    for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
            updates[key] = req.body[key];
        }
    }
    // If title.en changed, regenerate slug
    if (updates.title && updates.title.en) {
        updates.slug = updates.title.en
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    const course = await course_model_1.default.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
    });
    if (!course) {
        throw new api_error_1.NotFoundError('Course');
    }
    const populated = await course_model_1.default.findById(course._id)
        .populate({
        path: 'teacher',
        select: 'teacherId profile',
        populate: { path: 'profile', select: 'firstName lastName' },
    })
        .populate('school', 'name')
        .populate({ path: 'class', select: 'title section' })
        .lean();
    return api_response_1.default.success(res, populated, 'Course updated successfully');
};
exports.update = update;
// ---------------------------------------------------------------------------
// Delete Course (Admin only)
// ---------------------------------------------------------------------------
const remove = async (req, res) => {
    const course = await course_model_1.default.findByIdAndDelete(req.params.id);
    if (!course) {
        throw new api_error_1.NotFoundError('Course');
    }
    // Remove course from enrolled students
    await student_model_1.default.updateMany({ enrolledCourses: course._id }, { $pull: { enrolledCourses: course._id } });
    return api_response_1.default.noContent(res, 'Course deleted successfully');
};
exports.remove = remove;
// ---------------------------------------------------------------------------
// Enroll Student in Course
// ---------------------------------------------------------------------------
const enrollStudent = async (req, res) => {
    const { courseId } = req.params;
    const { studentId } = req.body;
    const course = await course_model_1.default.findById(courseId);
    if (!course)
        throw new api_error_1.NotFoundError('Course');
    if (course.status !== 'published') {
        throw new api_error_1.BadRequestError('Cannot enroll in a course that is not published');
    }
    if (course.enrolledStudents >= course.maxStudents) {
        throw new api_error_1.BadRequestError('Course has reached maximum capacity');
    }
    const student = await student_model_1.default.findById(studentId);
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    if (student.enrolledCourses.some((id) => id.toString() === courseId)) {
        throw new api_error_1.ConflictError('Student is already enrolled in this course');
    }
    // Enroll
    student.enrolledCourses.push(course._id);
    course.enrolledStudents += 1;
    await Promise.all([student.save(), course.save()]);
    return api_response_1.default.success(res, null, 'Student enrolled successfully');
};
exports.enrollStudent = enrollStudent;
// ---------------------------------------------------------------------------
// Unenroll Student from Course
// ---------------------------------------------------------------------------
const unenrollStudent = async (req, res) => {
    const { courseId } = req.params;
    const { studentId } = req.body;
    const course = await course_model_1.default.findById(courseId);
    if (!course)
        throw new api_error_1.NotFoundError('Course');
    const student = await student_model_1.default.findById(studentId);
    if (!student)
        throw new api_error_1.NotFoundError('Student');
    if (!student.enrolledCourses.some((id) => id.toString() === courseId)) {
        throw new api_error_1.BadRequestError('Student is not enrolled in this course');
    }
    student.enrolledCourses = student.enrolledCourses.filter((id) => id.toString() !== courseId);
    course.enrolledStudents = Math.max(0, course.enrolledStudents - 1);
    await Promise.all([student.save(), course.save()]);
    return api_response_1.default.success(res, null, 'Student unenrolled successfully');
};
exports.unenrollStudent = unenrollStudent;
// ---------------------------------------------------------------------------
// Get Enrolled Students
// ---------------------------------------------------------------------------
const getEnrolledStudents = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const students = await student_model_1.default.find({ enrolledCourses: req.params.id })
        .populate('user', 'email role isActive')
        .populate('profile', 'firstName lastName avatar')
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
    const total = await student_model_1.default.countDocuments({ enrolledCourses: req.params.id });
    return api_response_1.default.paginated(res, students, { page, limit, total });
};
exports.getEnrolledStudents = getEnrolledStudents;
// ---------------------------------------------------------------------------
// Self-Enroll (Student enrolls themselves)
// ---------------------------------------------------------------------------
const selfEnroll = async (req, res) => {
    const student = await (0, ensure_student_1.default)(req.user.userId);
    const course = await course_model_1.default.findById(req.params.id);
    if (!course)
        throw new api_error_1.NotFoundError('Course');
    if (course.status !== 'published')
        throw new api_error_1.BadRequestError('Cannot enroll in a course that is not published');
    if (course.enrolledStudents >= course.maxStudents)
        throw new api_error_1.BadRequestError('Course has reached maximum capacity');
    if (student.enrolledCourses.some((id) => id.toString() === req.params.id))
        throw new api_error_1.ConflictError('You are already enrolled in this course');
    student.enrolledCourses.push(course._id);
    course.enrolledStudents += 1;
    await Promise.all([student.save(), course.save()]);
    return api_response_1.default.success(res, { enrolled: true }, 'Successfully enrolled in course');
};
exports.selfEnroll = selfEnroll;
// ---------------------------------------------------------------------------
// Self-Unenroll (Student unenrolls themselves)
// ---------------------------------------------------------------------------
const selfUnenroll = async (req, res) => {
    const student = await (0, ensure_student_1.default)(req.user.userId);
    const course = await course_model_1.default.findById(req.params.id);
    if (!course)
        throw new api_error_1.NotFoundError('Course');
    if (!student.enrolledCourses.some((id) => id.toString() === req.params.id))
        throw new api_error_1.BadRequestError('You are not enrolled in this course');
    student.enrolledCourses = student.enrolledCourses.filter((id) => id.toString() !== req.params.id);
    course.enrolledStudents = Math.max(0, course.enrolledStudents - 1);
    await Promise.all([student.save(), course.save()]);
    return api_response_1.default.success(res, { enrolled: false }, 'Successfully unenrolled from course');
};
exports.selfUnenroll = selfUnenroll;
// ---------------------------------------------------------------------------
// Available Courses (Student catalog with enrollment status)
// ---------------------------------------------------------------------------
const getAvailableCourses = async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 12));
    const category = req.query.category;
    const level = req.query.level;
    const search = req.query.search;
    const filter = { status: 'published' };
    if (category)
        filter.category = category;
    if (level)
        filter.level = level;
    if (search) {
        filter.$or = [
            { 'title.en': { $regex: search, $options: 'i' } },
            { 'title.so': { $regex: search, $options: 'i' } },
            { 'title.ar': { $regex: search, $options: 'i' } },
            { 'description.en': { $regex: search, $options: 'i' } },
        ];
    }
    const [courses, total] = await Promise.all([
        course_model_1.default.find(filter)
            .populate({
            path: 'teacher',
            select: 'teacherId profile',
            populate: { path: 'profile', select: 'firstName lastName' },
        })
            .populate('school', 'name')
            .populate({ path: 'class', select: 'title section' })
            .select('title slug description category level duration fee teacher maxStudents enrolledStudents thumbnail status startDate school class')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        course_model_1.default.countDocuments(filter),
    ]);
    let enrolledIds = [];
    if (req.user?.userId) {
        try {
            const student = await (0, ensure_student_1.default)(req.user.userId);
            enrolledIds = (student.enrolledCourses || []).map((id) => id.toString());
        }
        catch {
            // If student record can't be created (e.g. no profile), just show no enrollments
            enrolledIds = [];
        }
    }
    const coursesWithStatus = courses.map((c) => ({ ...c, isEnrolled: enrolledIds.includes(c._id.toString()) }));
    return api_response_1.default.paginated(res, coursesWithStatus, { page, limit, total });
};
exports.getAvailableCourses = getAvailableCourses;
// ---------------------------------------------------------------------------
// List Course Categories
// ---------------------------------------------------------------------------
const getCategories = async (_req, res) => {
    const categories = [
        { value: 'quran', label: { en: 'Quran', so: 'Qur\'aanka', ar: 'القرآن' } },
        { value: 'fiqh', label: { en: 'Fiqh', so: 'Fiqhiga', ar: 'الفقه' } },
        { value: 'aqeedah', label: { en: 'Aqeedah', so: 'Cajiidada', ar: 'العقيدة' } },
        { value: 'seerah', label: { en: 'Seerah', so: 'Siirada', ar: 'السيرة' } },
        { value: 'arabic', label: { en: 'Arabic Language', so: 'Luqadda Carabiga', ar: 'اللغة العربية' } },
        { value: 'tajweed', label: { en: 'Tajweed', so: 'Tajwiidka', ar: 'التجويد' } },
        { value: 'hadith', label: { en: 'Hadith', so: 'Xadiithka', ar: 'الحديث' } },
        { value: 'akhlaq', label: { en: 'Akhlaq', so: 'Akhlaaqda', ar: 'الأخلاق' } },
    ];
    return api_response_1.default.success(res, categories);
};
exports.getCategories = getCategories;
//# sourceMappingURL=course.controller.js.map