/**
 * Teacher Controller
 * Full CRUD for teachers. Admin only.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Teacher from '../models/teacher.model';
import User from '../models/user.model';
import Profile from '../models/profile.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

// ---------------------------------------------------------------------------
// GET /teachers — List all teachers with optional filters
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { status, search, page = '1', limit = '10', school } = req.query;

  const filter: any = {};

  if (status && ['active', 'inactive', 'on_leave'].includes(status as string)) {
    filter.status = status;
  }

  // org_admin can never widen the filter to another org via ?school=; their
  // own organization always wins (applied below, after the client's value).
  if (school && req.user?.role !== 'org_admin') {
    filter.school = school as string;
  }

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  // For text search we'll filter after population on profile name
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 10));
  const skip = (pageNum - 1) * limitNum;

  let query = Teacher.find(scopedFilter)
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
    Teacher.countDocuments(scopedFilter),
  ]);

  // Apply search filter in-memory on profile name / email / teacherId
  let filteredTeachers = teachers;
  if (search) {
    const s = (search as string).toLowerCase();
    filteredTeachers = teachers.filter((t: any) => {
      const fullName = `${t.profile?.firstName || ''} ${t.profile?.lastName || ''}`.toLowerCase();
      const email = (t.user?.email || '').toLowerCase();
      const tid = (t.teacherId || '').toLowerCase();
      return fullName.includes(s) || email.includes(s) || tid.includes(s);
    });
  }

  return ApiResponse.paginated(res, filteredTeachers, {
    page: pageNum,
    limit: limitNum,
    total: search ? filteredTeachers.length : total,
  });
};

// ---------------------------------------------------------------------------
// GET /teachers/:id — Get single teacher by ID
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await Teacher.findById(req.params.id)
    .populate('user', 'email isVerified isActive preferredLanguage')
    .populate('profile')
    .populate('school', 'name')
    .populate('courses', 'title.en slug category status');

  if (!teacher) throw new NotFoundError('Teacher');
  assertOwnsOrg(req, teacher, 'school');

  return ApiResponse.success(res, teacher);
};

// ---------------------------------------------------------------------------
// POST /teachers — Create a new teacher (with User + Profile)
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const {
    email,
    password,
    firstName,
    lastName,
    gender,
    phone,
    school,
    qualification,
    specialization,
    experience,
    bio,
    joiningDate,
  } = req.body;

  if (!email || !password || !firstName || !lastName || !gender) {
    throw new BadRequestError('email, password, firstName, lastName, and gender are required');
  }

  // 1. Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ConflictError('A user with this email already exists');
  }

  // 2. Create User (teacher role, auto-verified)
  const user = await User.create({
    email: email.toLowerCase(),
    password,
    role: 'teacher',
    phone: phone || undefined,
    isVerified: true, // admin-created teachers are pre-verified
    preferredLanguage: 'en',
  });

  // 3. Create Profile
  const profile = await Profile.create({
    user: user._id,
    firstName,
    lastName,
    gender,
  });

  // 4. Generate teacherId
  const count = await Teacher.countDocuments();
  const teacherId = `TCH-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

  // 5. Create Teacher
  const teacher = await Teacher.create({
    user: user._id,
    profile: profile._id,
    teacherId,
    school: resolveOrgIdForCreate(req, school) || undefined,
    qualification: qualification || '',
    specialization: specialization || [],
    experience: experience || 0,
    bio: bio || '',
    joiningDate: joiningDate || new Date(),
    status: 'active',
  });

  const populated = await Teacher.findById(teacher._id)
    .populate('user', 'email isVerified isActive')
    .populate('profile', 'firstName lastName gender')
    .populate('school', 'name');

  return ApiResponse.created(res, populated, 'Teacher created successfully');
};

// ---------------------------------------------------------------------------
// PATCH /teachers/:id — Update teacher info
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) throw new NotFoundError('Teacher');
  assertOwnsOrg(req, teacher, 'school');

  const {
    firstName,
    lastName,
    gender,
    school,
    qualification,
    specialization,
    experience,
    bio,
    status,
    joiningDate,
  } = req.body;

  // Update profile if name/gender changed
  if (firstName || lastName || gender) {
    const profileUpdate: any = {};
    if (firstName) profileUpdate.firstName = firstName;
    if (lastName) profileUpdate.lastName = lastName;
    if (gender) profileUpdate.gender = gender;

    await Profile.findByIdAndUpdate(teacher.profile, profileUpdate);
  }

  // Update teacher fields — org_admin can never move a teacher to another org.
  if (school !== undefined && req.user?.role !== 'org_admin') teacher.school = school || null;
  if (qualification !== undefined) teacher.qualification = qualification;
  if (specialization !== undefined) teacher.specialization = specialization;
  if (experience !== undefined) teacher.experience = experience;
  if (bio !== undefined) teacher.bio = bio;
  if (status !== undefined) teacher.status = status;
  if (joiningDate !== undefined) teacher.joiningDate = new Date(joiningDate);

  await teacher.save();

  const updated = await Teacher.findById(teacher._id)
    .populate('user', 'email isVerified isActive')
    .populate('profile')
    .populate('school', 'name')
    .populate('courses', 'title.en slug category status');

  return ApiResponse.success(res, updated, 'Teacher updated successfully');
};

// ---------------------------------------------------------------------------
// DELETE /teachers/:id — Delete teacher (also removes User + Profile)
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) throw new NotFoundError('Teacher');
  assertOwnsOrg(req, teacher, 'school');

  // Check if teacher has active courses
  const Course = mongoose.model('Course');
  const activeCourses = await Course.countDocuments({
    teacher: teacher._id,
    status: { $in: ['published', 'draft'] },
  });

  if (activeCourses > 0) {
    throw new BadRequestError(
      `Cannot delete teacher. They are assigned to ${activeCourses} active course(s). Reassign or remove courses first.`
    );
  }

  // Delete User, Profile, and Teacher
  await Promise.all([
    User.findByIdAndDelete(teacher.user),
    Profile.findByIdAndDelete(teacher.profile),
    Teacher.findByIdAndDelete(teacher._id),
  ]);

  return ApiResponse.noContent(res, 'Teacher deleted successfully');
};

// ---------------------------------------------------------------------------
// PATCH /teachers/:id/status — Quick status toggle (active/inactive/on_leave)
// ---------------------------------------------------------------------------

export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['active', 'inactive', 'on_leave'].includes(status)) {
    throw new BadRequestError('Valid status required: active, inactive, or on_leave');
  }

  const existing = await Teacher.findById(req.params.id);
  if (!existing) throw new NotFoundError('Teacher');
  assertOwnsOrg(req, existing, 'school');

  const teacher = await Teacher.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  )
    .populate('profile', 'firstName lastName')
    .populate('school', 'name');

  if (!teacher) throw new NotFoundError('Teacher');

  return ApiResponse.success(res, teacher, `Teacher status updated to ${status}`);
};