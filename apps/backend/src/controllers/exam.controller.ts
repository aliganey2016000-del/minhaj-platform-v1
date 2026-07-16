import { Request, Response } from 'express';
import Exam from '../models/exam.model';
import Course from '../models/course.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, getOwnTeacherRecord, assertOwnsExamIfTeacher } from '../utils/tenant-scope';

// GET /exams — List all with optional filters
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, status, page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {};
  if (courseId) filter.course = courseId as string;
  if (status && ['scheduled', 'ongoing', 'completed', 'cancelled'].includes(status as string))
    filter.status = status;

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  // Teacher: assigned-only access — only exams for courses assigned to them.
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const teacherCourseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    scopedFilter.course = { $in: teacherCourseIds };
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));

  const [exams, total] = await Promise.all([
    Exam.find(scopedFilter)
      .populate('course', 'title.en slug category')
      .populate('createdBy', 'email')
      .sort({ examDate: 1, startTime: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Exam.countDocuments(scopedFilter),
  ]);

  let result = exams;
  if (search) {
    const s = (search as string).toLowerCase();
    result = exams.filter((e: any) => {
      const title = (e.title || '').toLowerCase();
      const courseName = (e.course?.title?.en || '').toLowerCase();
      const room = (e.room || '').toLowerCase();
      return title.includes(s) || courseName.includes(s) || room.includes(s);
    });
  }

  return ApiResponse.paginated(res, result, {
    page: pageNum,
    limit: limitNum,
    total: search ? result.length : total,
  });
};

// GET /exams/:id
export const getById = async (req: Request, res: Response): Promise<Response> => {
  const exam = await Exam.findById(req.params.id)
    .populate('course', 'title.en slug category enrolledStudents maxStudents teacher')
    .populate('createdBy', 'email')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  assertOwnsOrg(req, exam, 'school');
  await assertOwnsExamIfTeacher(req, exam);

  return ApiResponse.success(res, exam);
};

// POST /exams
export const create = async (req: Request, res: Response): Promise<Response> => {
  const { course: courseId } = req.body;
  if (!courseId) throw new BadRequestError('course is required');

  const course = await Course.findById(courseId).select('school teacher');
  if (!course) throw new NotFoundError('Course');
  assertOwnsOrg(req, course, 'school');
  await assertOwnsExamIfTeacher(req, { course });

  const payload = {
    ...req.body,
    // Always stamped from the course's own org — never trust the client here.
    school: course.school || null,
    createdBy: req.user!.userId,
  };
  const exam = await Exam.create(payload);
  const populated = await Exam.findById(exam._id)
    .populate('course', 'title.en slug category')
    .populate('createdBy', 'email')
    .lean();

  return ApiResponse.created(res, populated, 'Exam created successfully');
};

// PATCH /exams/:id
export const update = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Exam.findById(req.params.id).populate('course', 'school teacher');
  if (!existing) throw new NotFoundError('Exam');
  assertOwnsOrg(req, existing, 'school');
  await assertOwnsExamIfTeacher(req, existing);

  // Nobody may move an exam to a different course/org via this endpoint —
  // that would bypass the ownership checks above. Delete the exam and
  // create a new one instead if it truly needs to move.
  const updates = { ...req.body };
  delete updates.course;
  delete updates.school;
  delete updates.createdBy;

  const exam = await Exam.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  })
    .populate('course', 'title.en slug category')
    .populate('createdBy', 'email')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  return ApiResponse.success(res, exam, 'Exam updated successfully');
};

// DELETE /exams/:id
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const existing = await Exam.findById(req.params.id).populate('course', 'school teacher');
  if (!existing) throw new NotFoundError('Exam');
  assertOwnsOrg(req, existing, 'school');
  await assertOwnsExamIfTeacher(req, existing);

  await Exam.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Exam deleted');
};

// GET /exams/my — Student's exams from enrolled courses
export const getMyExams = async (req: Request, res: Response): Promise<Response> => {
  const student = await ensureStudentRecord(req.user!.userId);

  const courseIds = (student.enrolledCourses || []).map((id: any) => id);
  const exams = await Exam.find({ course: { $in: courseIds } })
    .populate('course', 'title.en slug category')
    .populate('createdBy', 'email')
    .sort({ examDate: 1, startTime: 1 })
    .lean();

  return ApiResponse.success(res, exams);
};

// PATCH /exams/:id/status
export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['scheduled', 'ongoing', 'completed', 'cancelled'].includes(status)) {
    throw new BadRequestError('Valid status required: scheduled, ongoing, completed, or cancelled');
  }

  const existing = await Exam.findById(req.params.id).populate('course', 'school teacher');
  if (!existing) throw new NotFoundError('Exam');
  assertOwnsOrg(req, existing, 'school');
  await assertOwnsExamIfTeacher(req, existing);

  const exam = await Exam.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  )
    .populate('course', 'title.en slug')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  return ApiResponse.success(res, exam, `Exam status updated to ${status}`);
};

// PATCH /exams/:id/publish-results — Reveal (or hide) this exam's results to students
export const publishResults = async (req: Request, res: Response): Promise<Response> => {
  const { published } = req.body;
  if (typeof published !== 'boolean') throw new BadRequestError('published must be true or false');

  const existing = await Exam.findById(req.params.id).populate('course', 'school teacher');
  if (!existing) throw new NotFoundError('Exam');
  assertOwnsOrg(req, existing, 'school');
  await assertOwnsExamIfTeacher(req, existing);

  const exam = await Exam.findByIdAndUpdate(
    req.params.id,
    { resultsPublished: published },
    { new: true }
  )
    .populate('course', 'title.en slug')
    .lean();

  if (!exam) throw new NotFoundError('Exam');
  return ApiResponse.success(res, exam, published ? 'Results published to students' : 'Results hidden from students');
};
