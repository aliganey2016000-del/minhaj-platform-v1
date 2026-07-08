/**
 * Student Controller
 * Handles student-related HTTP requests:
 * CRUD operations, profile access, parent tracking,
 * attendance, results, and payment lookups.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Student from '../models/student.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../utils/api-error';
import ApiResponse from '../utils/api-response';

// ---------------------------------------------------------------------------
// List Students (Admin & Teacher only)
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 20));
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const filter: Record<string, unknown> = {};

  if (status && ['active', 'inactive', 'graduated', 'suspended'].includes(status)) {
    filter.status = status;
  }

  if (req.user?.role === 'teacher') {
    // In production, filter by teacher's assigned courses
  }

  if (search) {
    filter.$or = [
      { studentId: { $regex: search, $options: 'i' } },
    ];
  }

  let allStudents: any[];
  let total: number;

  if (search) {
    const [students, count] = await Promise.all([
      Student.find(filter)
        .populate('user', 'email role isActive isVerified preferredLanguage')
        .populate('profile', 'firstName lastName avatar gender')
        .populate('parent', 'user profile')
        .populate('enrolledCourses', 'title slug')
        .sort({ createdAt: -1 })
        .lean(),
      Student.countDocuments(filter),
    ]);

    const s = search.toLowerCase();
    const filtered = students.filter((st: any) => {
      const fullName = `${st.profile?.firstName || ''} ${st.profile?.lastName || ''}`.toLowerCase();
      const email = (st.user?.email || '').toLowerCase();
      const sid = (st.studentId || '').toLowerCase();
      return fullName.includes(s) || email.includes(s) || sid.includes(s);
    });

    total = filtered.length;
    allStudents = filtered.slice((page - 1) * limit, page * limit);
  } else {
    const [students, count] = await Promise.all([
      Student.find(filter)
        .populate('user', 'email role isActive isVerified preferredLanguage')
        .populate('profile', 'firstName lastName avatar gender')
        .populate('parent', 'user profile')
        .populate('enrolledCourses', 'title slug')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Student.countDocuments(filter),
    ]);
    allStudents = students;
    total = count;
  }

  return ApiResponse.paginated(res, allStudents, { page, limit, total });
};

// ---------------------------------------------------------------------------
// Get Single Student
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id)
    .populate('user', 'email role isActive isVerified preferredLanguage')
    .populate('profile', 'firstName lastName avatar gender dateOfBirth address emergencyContact')
    .populate('parent', 'user profile children')
    .populate('enrolledCourses', 'title slug category level status')
    .lean();

  if (!student) throw new NotFoundError('Student');

  const userId = req.user?.userId;
  const role = req.user?.role;

  if (role === 'student' && (student as any).user?._id?.toString() !== userId) {
    throw new ForbiddenError('You can only view your own profile');
  }

  if (role === 'parent') {
    const parentId = (student as any).parent?._id?.toString();
    if (!parentId) throw new ForbiddenError('You can only view your linked children');
  }

  return ApiResponse.success(res, student);
};

// ---------------------------------------------------------------------------
// Create Student (Admin only)
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { email, password, firstName, lastName, gender, phone, enrollmentDate, grade, medicalNotes, parentId, preferredLanguage } = req.body;

  const user = await User.create({
    email: email.toLowerCase(), password, role: 'student',
    phone: phone || undefined, preferredLanguage: preferredLanguage || 'en', isVerified: true,
  });

  const profile = await Profile.create({ user: user._id, firstName, lastName, gender });

  const student = await Student.create({
    user: user._id, profile: profile._id, parent: parentId || undefined,
    enrollmentDate: enrollmentDate || new Date(), grade: grade || undefined, medicalNotes: medicalNotes || undefined,
  });

  const populated = await Student.findById(student._id)
    .populate('user', 'email role isActive preferredLanguage')
    .populate('profile', 'firstName lastName avatar gender')
    .populate('parent', 'user profile').lean();

  return ApiResponse.created(res, populated, 'Student created successfully');
};

// ---------------------------------------------------------------------------
// Update Student (Admin only)
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new NotFoundError('Student');

  const { firstName, lastName, gender, grade, medicalNotes, parent, enrollmentDate, status, attendancePercentage, gpa, totalFeesPaid, totalFeesDue } = req.body;

  if (firstName || lastName || gender) {
    const profileUpdate: any = {};
    if (firstName) profileUpdate.firstName = firstName;
    if (lastName) profileUpdate.lastName = lastName;
    if (gender) profileUpdate.gender = gender;
    await Profile.findByIdAndUpdate(student.profile, profileUpdate);
  }

  if (grade !== undefined) student.grade = grade;
  if (medicalNotes !== undefined) student.medicalNotes = medicalNotes;
  if (parent !== undefined) student.parent = parent || undefined;
  if (enrollmentDate !== undefined) student.enrollmentDate = new Date(enrollmentDate);
  if (status !== undefined) student.status = status;
  if (attendancePercentage !== undefined) student.attendancePercentage = attendancePercentage;
  if (gpa !== undefined) student.gpa = gpa;
  if (totalFeesPaid !== undefined) student.totalFeesPaid = totalFeesPaid;
  if (totalFeesDue !== undefined) student.totalFeesDue = totalFeesDue;

  await student.save();

  const updated = await Student.findById(student._id)
    .populate('user', 'email role isActive isVerified preferredLanguage')
    .populate('profile', 'firstName lastName avatar gender')
    .populate('parent', 'user profile')
    .populate('enrolledCourses', 'title slug');

  return ApiResponse.success(res, updated, 'Student updated successfully');
};

// ---------------------------------------------------------------------------
// Quick Status Toggle
// ---------------------------------------------------------------------------

export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['active', 'inactive', 'graduated', 'suspended'].includes(status)) {
    throw new BadRequestError('Valid status required: active, inactive, graduated, or suspended');
  }

  const student = await Student.findByIdAndUpdate(req.params.id, { status }, { new: true })
    .populate('profile', 'firstName lastName');

  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, student, `Student status updated to ${status}`);
};

// ---------------------------------------------------------------------------
// Delete Student (soft delete)
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new NotFoundError('Student');

  await User.findByIdAndUpdate(student.user, { isActive: false });
  student.status = 'inactive';
  await student.save();

  return ApiResponse.noContent(res, 'Student deleted (deactivated) successfully');
};

// ---------------------------------------------------------------------------
// Student Dashboard Summary (self-service)
// ---------------------------------------------------------------------------

export const getMyDashboard = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findOne({ user: req.user!.userId })
    .populate('enrolledCourses', 'title slug category level status thumbnail')
    .lean();

  // Return empty/default data if student record doesn't exist yet
  return ApiResponse.success(res, {
    studentId: (student as any)?.studentId || 'N/A',
    status: (student as any)?.status || 'active',
    enrolledCourses: (student as any)?.enrolledCourses || [],
    coursesCount: (student as any)?.enrolledCourses?.length || 0,
    attendancePercentage: (student as any)?.attendancePercentage || 0,
    gpa: (student as any)?.gpa || 0,
    totalFeesPaid: (student as any)?.totalFeesPaid || 0,
    totalFeesDue: (student as any)?.totalFeesDue || 0,
  });
};

// ---------------------------------------------------------------------------
// Student's Enrolled Courses
// ---------------------------------------------------------------------------

export const getCourses = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id)
    .populate({ path: 'enrolledCourses', select: 'title slug description category level status teacher thumbnail', populate: { path: 'teacher', select: 'user profile' } })
    .lean();

  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, (student as any).enrolledCourses || []);
};

// ---------------------------------------------------------------------------
// Get My Courses (self)
// ---------------------------------------------------------------------------

export const getMyCourses = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findOne({ user: req.user!.userId })
    .populate({ path: 'enrolledCourses', select: 'title slug description category level status teacher thumbnail duration fee', populate: { path: 'teacher', select: 'user profile', populate: { path: 'profile', select: 'firstName lastName' } } })
    .lean();

  return ApiResponse.success(res, (student as any)?.enrolledCourses || []);
};

// ---------------------------------------------------------------------------
// Attendance Summary
// ---------------------------------------------------------------------------

export const getAttendance = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id).select('attendancePercentage').lean();
  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, { attendancePercentage: (student as any).attendancePercentage || 0 });
};

// ---------------------------------------------------------------------------
// Results Summary
// ---------------------------------------------------------------------------

export const getResults = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id).select('gpa').lean();
  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, { gpa: (student as any).gpa || 0 });
};

// ---------------------------------------------------------------------------
// Payments Summary
// ---------------------------------------------------------------------------

export const getPayments = async (req: Request, res: Response): Promise<Response> => {
  const student = await Student.findById(req.params.id).select('totalFeesPaid totalFeesDue').lean();
  if (!student) throw new NotFoundError('Student');
  return ApiResponse.success(res, { totalFeesPaid: (student as any).totalFeesPaid || 0, totalFeesDue: (student as any).totalFeesDue || 0 });
};

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export const getCertificates = async (_req: Request, res: Response): Promise<Response> => {
  return ApiResponse.success(res, { certificates: [] });
};

// ---------------------------------------------------------------------------
// Bulk Import / Export (placeholders)
// ---------------------------------------------------------------------------

export const bulkImport = async (_req: Request, _res: Response): Promise<Response> => {
  throw new BadRequestError('Bulk import not yet implemented');
};

export const exportStudents = async (_req: Request, _res: Response): Promise<Response> => {
  throw new BadRequestError('Export not yet implemented');
};