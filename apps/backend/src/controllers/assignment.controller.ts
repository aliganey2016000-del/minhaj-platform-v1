/**
 * Assignment Management Controller
 *
 * Handles CRUD for Assignments. Scoped per tenant:
 *   - Super Admin: sees all assignments across all organizations
 *   - Org Admin:   sees only assignments for courses in their own organization
 *   - Teacher:     sees only assignments for their own courses
 *   - Student:     sees only assignments for their enrolled courses (getMyAssignments)
 *
 * The GET / endpoint supports a `tab` query param to filter by temporal status:
 *   - "active":    startDate <= now && dueDate >= now
 *   - "upcoming":  startDate > now
 *   - "past":      dueDate < now
 *   - omitted:     returns all (paginated)
 */

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import Assignment from '../models/assignment.model';
import AssignmentSubmission from '../models/assignment-submission.model';
import Course from '../models/course.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { getOwnTeacherRecord } from '../utils/tenant-scope';

// ---------------------------------------------------------------------------
// POST / — Create assignment (admin / org_admin / teacher)
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response) => {
  const { title, description, course, class: classId, startDate, dueDate, totalMarks, allowLateSubmission, attachments } = req.body;

  if (!title || !course || !dueDate) {
    throw new BadRequestError('Title, course, and due date are required');
  }

  // Tenant scope: org_admin must create assignments for courses in their own org.
  // Teacher must create assignments for their own courses.
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    if (!teacher) throw new ForbiddenError('Teacher record not found');
    const courseDoc = await Course.findById(course).select('teacher').lean();
    if (!courseDoc || (courseDoc as any).teacher?.toString() !== teacher._id.toString()) {
      throw new ForbiddenError('You can only create assignments for your own courses');
    }
  }

  if (req.user?.role === 'org_admin') {
    const courseDoc = await Course.findById(course).select('school').lean();
    if (!courseDoc || (courseDoc as any).school?.toString() !== req.user.organizationId) {
      throw new ForbiddenError('You can only create assignments for courses in your organization');
    }
  }

  const payload = {
    title,
    description: description || '',
    course: new mongoose.Types.ObjectId(course),
    class: classId ? new mongoose.Types.ObjectId(classId) : undefined,
    startDate: startDate || new Date(),
    dueDate: new Date(dueDate),
    totalMarks: totalMarks || 100,
    allowLateSubmission: allowLateSubmission || false,
    attachments: attachments || [],
    createdBy: new mongoose.Types.ObjectId(req.user!.userId),
  };

  const item = await Assignment.create(payload);
  const populated = await Assignment.findById(item._id)
    .populate('course', 'title.en slug')
    .populate('class', 'title section')
    .populate('createdBy', 'email')
    .lean();

  return ApiResponse.created(res, populated, 'Assignment created');
};

// ---------------------------------------------------------------------------
// GET /my — Student sees assignments for their enrolled courses
// ---------------------------------------------------------------------------

export const getMyAssignments = async (req: Request, res: Response) => {
  const student = await ensureStudentRecord(req.user!.userId);

  const courseIds = (student.enrolledCourses || []).map((id: any) => id);
  const assignments = await Assignment.find({ course: { $in: courseIds }, status: 'active' })
    .populate('course', 'title.en slug category thumbnail')
    .sort({ dueDate: 1 })
    .lean();

  const now = new Date();
  const withStatus = assignments.map((a: any) => {
    const start = a.startDate ? new Date(a.startDate) : null;
    const due = new Date(a.dueDate);

    return {
      ...a,
      isActive: (start === null || start <= now) && due >= now,
      isUpcoming: start !== null && start > now,
      isOverdue: due < now,
    };
  });

  return ApiResponse.success(res, withStatus);
};

// ---------------------------------------------------------------------------
// GET /:id — Single assignment detail (any authenticated user)
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response) => {
  const assignment = await Assignment.findById(req.params.id)
    .populate('course', 'title.en slug category thumbnail')
    .populate('class', 'title section')
    .lean();

  if (!assignment) throw new NotFoundError('Assignment');

  // Student check: scoped to enrolled courses
  if (req.user?.role === 'student') {
    const student = await ensureStudentRecord(req.user.userId);
    const enrolledIds = (student.enrolledCourses || []).map((id: any) => id.toString());
    const courseId = (assignment.course as any)?._id?.toString();
    if (courseId && !enrolledIds.includes(courseId)) {
      throw new ForbiddenError('You can only view assignments for your enrolled courses');
    }
  }

  const now = new Date();
  const start = (assignment as any).startDate ? new Date((assignment as any).startDate) : null;
  const due = new Date((assignment as any).dueDate);

  return ApiResponse.success(res, {
    ...assignment,
    isActive: (start === null || start <= now) && due >= now,
    isUpcoming: start !== null && start > now,
    isOverdue: due < now,
  });
};

// ---------------------------------------------------------------------------
// POST /:id/submit — Student submits (or resubmits) their work
// ---------------------------------------------------------------------------

export const submitAssignment = async (req: Request, res: Response) => {
  const { answer, fileUrl } = req.body as { answer?: string; fileUrl?: string };
  if (!answer?.trim() && !fileUrl) {
    throw new BadRequestError('Provide an answer or a file to submit');
  }

  const assignment = await Assignment.findById(req.params.id).lean();
  if (!assignment) throw new NotFoundError('Assignment');

  const student = await ensureStudentRecord(req.user!.userId);
  const enrolledIds = (student.enrolledCourses || []).map((id: any) => id.toString());
  if (!enrolledIds.includes((assignment as any).course.toString())) {
    throw new ForbiddenError('You are not enrolled in this course');
  }

  const now = new Date();
  const isLate = now > new Date((assignment as any).dueDate);
  if (isLate && !(assignment as any).allowLateSubmission) {
    throw new ForbiddenError('The due date has passed and late submissions are not allowed for this assignment');
  }

  const submission = await AssignmentSubmission.findOneAndUpdate(
    { assignment: assignment._id, student: student._id },
    {
      assignment: assignment._id,
      student: student._id,
      course: (assignment as any).course,
      answer: answer?.trim() || '',
      fileUrl: fileUrl || '',
      isLate,
      submittedAt: now,
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  return ApiResponse.success(res, submission, isLate ? 'Submitted (late)' : 'Submitted successfully');
};

// ---------------------------------------------------------------------------
// GET / — Admin / Org Admin / Teacher list
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response) => {
  const { courseId, status, tab, page = '1', limit = '20', search } = req.query;
  const now = new Date();

  const filter: Record<string, unknown> = {};

  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    if (!teacher) throw new ForbiddenError('Teacher record not found');
    const ownCourses = await Course.find({ teacher: teacher._id }).select('_id').lean();
    const ownCourseIds = ownCourses.map((c: any) => c._id);
    filter.course = { $in: ownCourseIds };
  }

  if (req.user?.role === 'org_admin') {
    const orgCourses = await Course.find({ school: req.user.organizationId }).select('_id').lean();
    const orgCourseIds = orgCourses.map((c: any) => c._id);
    filter.course = { $in: orgCourseIds };
  }

  if (courseId) filter.course = courseId;
  if (status) filter.status = status;

  if (tab === 'active') {
    filter.$and = [
      { $or: [{ startDate: { $lte: now } }, { startDate: null }] },
      { dueDate: { $gte: now } },
    ];
  } else if (tab === 'upcoming') {
    filter.startDate = { $gt: now };
    filter.$and = [
      { startDate: { $exists: true, $ne: null } },
      { startDate: { $gt: now } },
    ];
  } else if (tab === 'past') {
    filter.dueDate = { $lt: now };
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [items, total] = await Promise.all([
    Assignment.find(filter)
      .populate('course', 'title.en slug category level thumbnail school')
      .populate({ path: 'course', populate: { path: 'school', select: 'name' } })
      .populate({ path: 'course', populate: { path: 'teacher', select: 'teacherId profile', populate: { path: 'profile', select: 'firstName lastName' } } })
      .populate('class', 'title section')
      .populate('createdBy', 'email')
      .sort({ dueDate: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Assignment.countDocuments(filter),
  ]);

  let result = items;
  if (search) {
    const s = (search as string).toLowerCase();
    result = items.filter((a: any) => (a.title || '').toLowerCase().includes(s) || (a.description || '').toLowerCase().includes(s));
  }

  const enriched = result.map((a: any) => ({
    ...a,
    tab: new Date(a.dueDate) < now ? 'past' : new Date(a.startDate || a.createdAt) > now ? 'upcoming' : 'active',
  }));

  return ApiResponse.paginated(res, enriched, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};

// ---------------------------------------------------------------------------
// PATCH /:id — Update assignment
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response) => {
  const item = await Assignment.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate('course', 'title.en slug')
    .populate('class', 'title section')
    .lean();

  if (!item) throw new NotFoundError('Assignment');
  return ApiResponse.success(res, item, 'Updated');
};

// ---------------------------------------------------------------------------
// PATCH /:id/status — Toggle active/inactive
// ---------------------------------------------------------------------------

export const updateStatus = async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!status) throw new BadRequestError('Status required');
  const item = await Assignment.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
  if (!item) throw new NotFoundError('Assignment');
  return ApiResponse.success(res, item, `Status updated to ${status}`);
};

// ---------------------------------------------------------------------------
// DELETE /:id — Remove assignment
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response) => {
  const item = await Assignment.findByIdAndDelete(req.params.id);
  if (!item) throw new NotFoundError('Assignment');
  return ApiResponse.noContent(res, 'Deleted');
};

// ---------------------------------------------------------------------------
// POST /upload — Upload assignment attachment file
// ---------------------------------------------------------------------------

export const uploadAttachment = async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('No file provided');

  const uploadsDir = path.join(process.cwd(), 'uploads', 'assignments');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const timestamp = Date.now();
  const safeName = (req.file.originalname || 'file').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const filename = `${timestamp}-${safeName}`;
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, req.file.buffer);

  const url = `/uploads/assignments/${filename}`;
  const name = req.file.originalname || filename;
  const allowDownload = req.body?.allowDownload === 'true' || req.body?.allowDownload === true;

  return ApiResponse.success(res, { url, name, size: req.file.size, allowDownload }, 'File uploaded');
};

// ---------------------------------------------------------------------------
// GET /materials/:id/view — Stream assignment attachment securely
// ---------------------------------------------------------------------------

export const viewMaterial = async (req: Request, res: Response) => {
  const assignmentId = req.query.assignmentId as string;
  if (!assignmentId) throw new BadRequestError('assignmentId query parameter is required');

  const assignment = await Assignment.findById(assignmentId).select('attachments course').lean();
  if (!assignment) throw new NotFoundError('Assignment');

  const attachIndex = parseInt(req.params.id, 10);
  if (isNaN(attachIndex) || attachIndex < 0 || attachIndex >= (assignment.attachments?.length || 0)) {
    throw new NotFoundError('Attachment not found');
  }

  const attachment = assignment.attachments[attachIndex];
  const filePath = path.join(process.cwd(), attachment.url.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) throw new NotFoundError('File not found on disk');

  const ext = path.extname(attachment.name || attachment.url).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.txt': 'text/plain',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  if (attachment.allowDownload) {
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.name || 'file')}"`);
  } else {
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.name || 'file')}"`);
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
};