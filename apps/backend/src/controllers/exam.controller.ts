import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import Exam from '../models/exam.model';
import Course from '../models/course.model';
import School from '../models/school.model';
import ClassModel from '../models/class.model';
import ExamPaper from '../models/exam-paper.model';
import ExamAttempt from '../models/exam-attempt.model';
import ExamAppeal from '../models/exam-appeal.model';
import { getAutoScheduleWindow } from '../utils/exam-eligibility';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import ensureStudentRecord from '../utils/ensure-student';
import { applyOrgFilter, assertOwnsOrg, getOwnTeacherRecord, assertOwnsExamIfTeacher, resolveOrgIdForCreate } from '../utils/tenant-scope';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';

// GET /exams — List all with optional filters
export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { courseId, status, school, page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {};
  if (courseId) filter.course = courseId as string;
  if (status && ['scheduled', 'ongoing', 'completed', 'cancelled'].includes(status as string))
    filter.status = status;
  // applyOrgFilter below auto-scopes org_admin to their own org and leaves
  // admin/teacher unrestricted — `school` lets a super admin (role 'admin')
  // narrow the platform-wide exam list down to one organization, e.g. for
  // Papers & Approval's org picker.
  if (school) filter.school = school as string;

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
      .populate({
        path: 'course',
        select: 'title.en slug category teacher class school thumbnail enrolledStudents',
        populate: [
          { path: 'teacher', select: 'profile', populate: { path: 'profile', select: 'firstName lastName' } },
          { path: 'class', select: 'title section department', populate: { path: 'department', select: 'name' } },
          { path: 'school', select: 'name' },
        ],
      })
      .populate('school', 'name')
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

  // Attach each exam's paper status (draft/submitted/approved/rejected, or
  // null if no paper exists yet) in one batched lookup — lets callers like
  // Papers & Approval filter/tab by review status without an N+1 fetch.
  const papers = await ExamPaper.find({ exam: { $in: result.map((e: any) => e._id) } })
    .select('exam status')
    .lean();
  const paperStatusByExam: Record<string, string> = {};
  for (const p of papers) paperStatusByExam[p.exam.toString()] = p.status;
  result = result.map((e: any) => ({ ...e, paperStatus: paperStatusByExam[e._id.toString()] || null }));

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
    .populate({
      path: 'course',
      select: 'title.en slug category thumbnail class school teacher enrolledStudents',
      populate: [
        { path: 'class', select: 'title section department', populate: { path: 'department', select: 'name' } },
        { path: 'school', select: 'name' },
        { path: 'teacher', select: 'profile', populate: { path: 'profile', select: 'firstName lastName' } },
      ],
    })
    .populate('school', 'name')
    .populate('createdBy', 'email')
    .sort({ examDate: 1, startTime: 1 })
    .lean();

  // Join in this student's own attempt status per exam — lets the frontend
  // tell "time's up, you submitted" (completed) apart from "time's up, you
  // never took it" (missed), which the Exam document alone can't express.
  const attempts = await ExamAttempt.find({ exam: { $in: exams.map((e: any) => e._id) }, student: student._id })
    .select('exam status')
    .lean();
  const attemptStatusByExam: Record<string, string> = {};
  for (const a of attempts) attemptStatusByExam[a.exam.toString()] = a.status;

  // Auto-scheduled exams have no shared calendar date — each student gets
  // their own personal window instead, computed from the moment THEY met
  // the prerequisites (see exam-eligibility.ts).
  const windows = await Promise.all(
    exams.map((e: any) => (e.autoSchedule ? getAutoScheduleWindow(e, student._id) : Promise.resolve(null)))
  );

  // A student's own retake requests — lets the frontend show "pending
  // admin approval" or "not allowed, contact administration" instead of
  // just silently re-showing the Request Retake button. Only the latest
  // request per exam matters (an approved one already reopened the window
  // and reset via the ExamAppeal controller, so a stale rejected one from
  // before that shouldn't keep blocking the student).
  const retakeRequests = await ExamAppeal.find({ student: student._id, type: 'retake_request' })
    .select('exam status createdAt')
    .sort({ createdAt: -1 })
    .lean();
  const retakeStatusByExam: Record<string, string> = {};
  for (const r of retakeRequests) {
    const key = r.exam.toString();
    if (!(key in retakeStatusByExam)) retakeStatusByExam[key] = r.status;
  }

  const result = exams.map((e: any, i: number) => {
    const win = windows[i];
    return {
      ...e,
      myAttemptStatus: attemptStatusByExam[e._id.toString()] || null,
      myScheduledStart: win?.scheduledStart || null,
      myScheduledEnd: win?.scheduledEnd || null,
      myMetPrerequisites: win?.metPrerequisites ?? null,
      myRetakeRequestStatus: retakeStatusByExam[e._id.toString()] || null,
    };
  });

  // The student's own class/school — lets the frontend default to "My
  // Class" (course.class._id === myClass._id) instead of the full
  // enrolledCourses list, and seeds the Department dropdown's org scope
  // for browsing other classes (see browseExams below). Fetched separately
  // since ensureStudentRecord() returns an unpopulated document.
  const studentRecord = student as any;
  const [myClass, mySchool] = await Promise.all([
    studentRecord.class ? ClassModel.findById(studentRecord.class).select('title section department').populate('department', 'name').lean() : null,
    studentRecord.school ? School.findById(studentRecord.school).select('name').lean() : null,
  ]);

  return ApiResponse.success(res, { exams: result, myClass, mySchool });
};

// ---------------------------------------------------------------------------
// GET /exams/browse?classId=<id> — Student-only, read-only exam calendar for
// a class the caller does NOT belong to. Returns only public schedule
// fields (no myAttemptStatus/myScheduledStart/myMetPrerequisites/
// myRetakeRequestStatus — those are specific to the caller's own access,
// which this endpoint deliberately never grants). Auto-scheduled exams have
// no shared date to show here at all — each student's own window is
// computed individually — so those come back with just their autoSchedule/
// milestone flags and no date/time.
// ---------------------------------------------------------------------------

export const browseExams = async (req: Request, res: Response): Promise<Response> => {
  const classId = req.query.classId as string | undefined;
  if (!classId) throw new BadRequestError('classId is required');

  const student = await ensureStudentRecord(req.user!.userId);
  const studentSchool = (student as any).school;

  const targetClass = await ClassModel.findById(classId).select('title section department school').lean();
  if (!targetClass) throw new NotFoundError('Class');
  if (!studentSchool || String((targetClass as any).school) !== String(studentSchool)) {
    throw new NotFoundError('Class');
  }

  const courseIds = await Course.find({ class: classId }).distinct('_id');
  const exams = await Exam.find({ course: { $in: courseIds } })
    .select('title course examDate startTime endTime duration totalMarks passingMarks room status autoSchedule milestone')
    .populate({ path: 'course', select: 'title.en slug category thumbnail class school teacher', populate: [
      { path: 'class', select: 'title section department', populate: { path: 'department', select: 'name' } },
      { path: 'school', select: 'name' },
      { path: 'teacher', select: 'profile', populate: { path: 'profile', select: 'firstName lastName' } },
    ] })
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

// ---------------------------------------------------------------------------
// POST /exams/bulk-delete — Delete many exams in one request
// ---------------------------------------------------------------------------

export const bulkRemove = async (req: Request, res: Response): Promise<Response> => {
  const ids: string[] = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  if (ids.length === 0) throw new BadRequestError('No exam ids provided');

  const filter: Record<string, unknown> = applyOrgFilter(req, { _id: { $in: ids } }, 'school');

  // Teacher: only their own courses' exams — same scoping assertOwnsExamIfTeacher
  // enforces per-document on the single-delete path above, applied as a
  // query filter here so a stray id for someone else's course is silently
  // excluded rather than aborting the whole batch.
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const teacherCourseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    filter.course = { $in: teacherCourseIds };
  }

  const result = await Exam.deleteMany(filter);
  return ApiResponse.success(res, { deleted: result.deletedCount }, `Deleted ${result.deletedCount} exam(s)`);
};

// ---------------------------------------------------------------------------
// GET /exams/export — Export scoped exams as formatted XLSX
// ---------------------------------------------------------------------------

export const exportData = async (req: Request, res: Response): Promise<void> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const teacherCourseIds = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    filter.course = { $in: teacherCourseIds };
  }

  const exams = await Exam.find(filter)
    .populate('course', 'title.en')
    .populate('school', 'name')
    .sort({ examDate: 1, startTime: 1 })
    .lean();

  const headers = ['Organization', 'Course', 'Exam Title', 'Exam Date', 'Start Time', 'End Time', 'Duration (min)', 'Total Marks', 'Passing Marks', 'Room', 'Status', 'Scheduling'];
  const rows = exams.map((e: any) => [
    e.school?.name || '',
    e.course?.title?.en || '',
    e.title,
    e.autoSchedule ? '' : (e.examDate ? new Date(e.examDate).toLocaleDateString() : ''),
    e.autoSchedule ? '' : (e.startTime || ''),
    e.autoSchedule ? '' : (e.endTime || ''),
    e.duration,
    e.totalMarks,
    e.passingMarks,
    e.room || '',
    e.status,
    e.autoSchedule ? 'Automatic' : 'Manual',
  ]);

  const buffer = buildXlsxBuffer(headers, rows, 'Exams');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=exams-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// GET /exams/template — Download bulk-import template (XLSX)
//
// Scoped to MANUAL scheduling only — an auto-scheduled exam has no fixed
// date/time of its own (see the `autoSchedule` branch on the model), which
// doesn't fit a "one row = one dated exam" spreadsheet; those are still
// set up individually via "+ Schedule Exam".
// ---------------------------------------------------------------------------

export const downloadTemplate = async (req: Request, res: Response): Promise<void> => {
  const isOrgAdmin = req.user?.role === 'org_admin';
  const headers = isOrgAdmin
    ? ['Course Title', 'Exam Title', 'Exam Date (YYYY-MM-DD)', 'Start Time (HH:MM)', 'End Time (HH:MM)', 'Duration (minutes)', 'Total Marks', 'Passing Marks', 'Room', 'Instructions']
    : ['Organization', 'Course Title', 'Exam Title', 'Exam Date (YYYY-MM-DD)', 'Start Time (HH:MM)', 'End Time (HH:MM)', 'Duration (minutes)', 'Total Marks', 'Passing Marks', 'Room', 'Instructions'];
  const sampleRow = isOrgAdmin
    ? ['Quran Recitation', 'Mid-Term Exam', '2026-03-15', '09:00', '11:00', '120', '100', '50', 'Room 12', '']
    : ['Madrasa Al-Noor', 'Quran Recitation', 'Mid-Term Exam', '2026-03-15', '09:00', '11:00', '120', '100', '50', 'Room 12', ''];

  const buffer = buildXlsxBuffer(headers, [sampleRow], 'Exams Template');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=exams-template.xlsx');
  res.end(buffer);
};

function getExamImportField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const target = name.toLowerCase();
    const key = keys.find((k) => k.trim().toLowerCase() === target) ?? keys.find((k) => k.trim().toLowerCase().startsWith(target));
    if (key !== undefined) return row[key];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// POST /exams/import — Bulk import manually-scheduled exams from Excel/CSV
// ---------------------------------------------------------------------------

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel or CSV file is required (field name "file")');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const ownOrgId = resolveOrgIdForCreate(req) as string | undefined;
  const createdBy = req.user!.userId;

  // Batch-resolve every distinct School/Course referenced up front instead
  // of a query per row — same fix already applied to Class Schedules'
  // importer (sequential per-row lookups against a remote cluster don't
  // scale to large files).
  let schoolIdByName: Map<string, string> | null = null;
  if (!ownOrgId) {
    const allSchools = await School.find({}, { name: 1 }).lean();
    schoolIdByName = new Map(allSchools.map((s: any) => [String(s.name).trim().toLowerCase(), s._id.toString()]));
  }
  const relevantSchoolIds = ownOrgId ? [ownOrgId] : Array.from(schoolIdByName!.values());
  const allCourses = await Course.find({ school: { $in: relevantSchoolIds } }, { title: 1, school: 1 }).lean();
  const courseByKey = new Map<string, any>();
  for (const c of allCourses as any[]) courseByKey.set(`${c.school}|||${String((c as any).title?.en || '').trim().toLowerCase()}`, c);

  // Teacher caller: only allowed to import exams for their own courses.
  let teacherCourseIdSet: Set<string> | null = null;
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    const ids = teacher ? await Course.find({ teacher: teacher._id }).distinct('_id') : [];
    teacherCourseIdSet = new Set(ids.map((id: any) => id.toString()));
  }

  const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const errors: { row: number; message: string }[] = [];
  const documents: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // header is row 1
    const row = rows[i];

    try {
      const cellValues = Object.values(row).map((v) => String(v ?? '').trim());
      if (cellValues.every((v) => v === '')) continue; // blank row

      const schoolName = String(getExamImportField(row, 'Organization', 'School') ?? '').trim();
      const courseTitle = String(getExamImportField(row, 'Course Title', 'Course') ?? '').trim();
      const examTitle = String(getExamImportField(row, 'Exam Title', 'Title') ?? '').trim();
      const examDateRaw = getExamImportField(row, 'Exam Date', 'Date');
      const startTime = String(getExamImportField(row, 'Start Time', 'Start') ?? '').trim();
      const endTime = String(getExamImportField(row, 'End Time', 'End') ?? '').trim();
      const durationRaw = getExamImportField(row, 'Duration');
      const totalMarksRaw = getExamImportField(row, 'Total Marks');
      const passingMarksRaw = getExamImportField(row, 'Passing Marks');
      const room = String(getExamImportField(row, 'Room') ?? '').trim();
      const instructions = String(getExamImportField(row, 'Instructions') ?? '').trim();

      if (!courseTitle) throw new Error('Course Title is required');
      if (!examTitle) throw new Error('Exam Title is required');
      if (!examDateRaw) throw new Error('Exam Date is required');
      if (!startTime) throw new Error('Start Time is required');
      if (!endTime) throw new Error('End Time is required');

      let schoolId: string | undefined = ownOrgId;
      if (!schoolId) {
        if (!schoolName) throw new Error('Organization is required');
        schoolId = schoolIdByName!.get(schoolName.toLowerCase());
        if (!schoolId) throw new Error(`Organization "${schoolName}" not found`);
      }

      const courseDoc = courseByKey.get(`${schoolId}|||${courseTitle.toLowerCase()}`);
      if (!courseDoc) throw new Error(`Course "${courseTitle}" not found`);
      if (teacherCourseIdSet && !teacherCourseIdSet.has(String(courseDoc._id))) {
        throw new Error(`You are not the assigned teacher for "${courseTitle}"`);
      }

      const examDate = new Date(examDateRaw as any);
      if (isNaN(examDate.getTime())) throw new Error(`Invalid Exam Date "${examDateRaw}"`);
      if (!HHMM.test(startTime)) throw new Error(`Invalid Start Time "${startTime}" (expected HH:MM)`);
      if (!HHMM.test(endTime)) throw new Error(`Invalid End Time "${endTime}" (expected HH:MM)`);
      if (endTime <= startTime) throw new Error('End Time must be after Start Time');

      const duration = Number(durationRaw);
      if (!duration || duration <= 0) throw new Error('Duration must be a positive number of minutes');
      const totalMarks = Number(totalMarksRaw);
      if (!totalMarks || totalMarks <= 0) throw new Error('Total Marks must be a positive number');
      const passingMarks = Number(passingMarksRaw);
      if (!passingMarks || passingMarks <= 0) throw new Error('Passing Marks must be a positive number');

      documents.push({
        title: examTitle,
        course: courseDoc._id,
        school: courseDoc.school || null,
        examDate,
        startTime,
        endTime,
        duration,
        totalMarks,
        passingMarks,
        room: room || '',
        instructions: instructions || '',
        createdBy,
      });
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || 'Unknown error' });
    }
  }

  // No transaction — this deployment's MongoDB is a standalone instance (no
  // replica set); insertMany with ordered:false continues past individual
  // row/document errors and reports what succeeded.
  let inserted = 0;
  if (documents.length > 0) {
    try {
      const result = await Exam.insertMany(documents, { ordered: false });
      inserted = result.length;
    } catch (txErr: any) {
      if (txErr.insertedDocs) inserted = txErr.insertedDocs.length;
      if (txErr.writeErrors) {
        txErr.writeErrors.forEach((we: any) => {
          errors.push({ row: 0, message: we.err?.errmsg || we.errmsg || 'Insert error' });
        });
      } else if (inserted === 0) {
        errors.push({ row: 0, message: txErr.message || 'Import failed.' });
      }
    }
  }

  return ApiResponse.success(res, {
    totalRows: rows.length,
    created: inserted,
    failed: errors.length,
    errors,
  }, `Imported ${inserted} of ${rows.length} exams`);
};
