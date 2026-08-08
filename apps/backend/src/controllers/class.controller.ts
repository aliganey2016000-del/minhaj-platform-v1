import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import ClassModel from '../models/class.model';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import Department from '../models/department.model';
import School from '../models/school.model';
import Student from '../models/student.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate, getOwnTeacherRecord } from '../utils/tenant-scope';
import { moveToTrash } from '../utils/trash';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------------------
// GET /classes — List all with optional filters
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId, department, status, page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {};
  // org_admin can't widen the filter to another org via ?schoolId=; their
  // own organization always wins (applied below via applyOrgFilter).
  if (schoolId && req.user?.role !== 'org_admin') filter.school = schoolId as string;
  if (department) filter.department = department as string;
  if (status && ['active', 'inactive', 'completed'].includes(status as string)) filter.status = status;

  const scopedFilter = applyOrgFilter(req, filter, 'school');

  // Teacher: confined to their own school's classes.
  if (req.user?.role === 'teacher') {
    const teacher = await getOwnTeacherRecord(req);
    scopedFilter.school = teacher?.school || null;
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));

  const [classes, total] = await Promise.all([
    ClassModel.find(scopedFilter)
      .populate('school', 'name')
      .populate('course', 'title.en slug category')
      .populate('teacher', 'teacherId')
      .populate('department', 'name code')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    ClassModel.countDocuments(scopedFilter),
  ]);

  const normalizedClasses = (classes as any[]).map((c: any) => ({
    ...c,
    department: typeof c.department === 'string' ? c.department : c.department?.name || '',
    departmentId: typeof c.department === 'object' && c.department?._id ? c.department._id.toString() : undefined,
  }));

  let result = normalizedClasses;
  if (search) {
    const s = (search as string).toLowerCase();
    result = normalizedClasses.filter((c: any) => {
      const title = (c.title || '').toLowerCase();
      const room = (c.room || '').toLowerCase();
      const section = (c.section || '').toLowerCase();
      const schoolName = (c.school?.name || '').toLowerCase();
      const department = (c.department || '').toLowerCase();
      return title.includes(s) || room.includes(s) || section.includes(s) || schoolName.includes(s) || department.includes(s);
    });
  }

  return ApiResponse.paginated(res, result, {
    page: pageNum,
    limit: limitNum,
    total: search ? result.length : total,
  });
};

// ---------------------------------------------------------------------------
// POST /classes — Create
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const payload = {
    ...req.body,
    school: resolveOrgIdForCreate(req, req.body.school),
  };
  const cls = await ClassModel.create(payload);
  const populated = await ClassModel.findById(cls._id)
    .populate('school', 'name')
    .populate('course', 'title.en slug category')
    .populate('teacher', 'teacherId')
    .populate('department', 'name code')
    .lean();

  const response = {
    ...populated,
    department: typeof (populated as any)?.department === 'string' ? (populated as any).department : (populated as any)?.department?.name || '',
    departmentId: typeof (populated as any)?.department === 'object' && (populated as any).department?._id ? (populated as any).department._id.toString() : undefined,
  };
  return ApiResponse.created(res, response, 'Class created successfully');
};

// ---------------------------------------------------------------------------
// PATCH /classes/:id — Update
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const existing = await ClassModel.findById(req.params.id);
  if (!existing) throw new NotFoundError('Class');
  assertOwnsOrg(req, existing, 'school');

  const updates = { ...req.body };
  // org_admin can never move a class to a different organization.
  if (req.user?.role === 'org_admin') delete updates.school;

  const cls = await ClassModel.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  })
    .populate('school', 'name')
    .populate('course', 'title.en slug category')
    .populate('teacher', 'teacherId')
    .populate('department', 'name code')
    .lean();

  if (!cls) throw new NotFoundError('Class');
  const response = {
    ...cls,
    department: typeof (cls as any).department === 'string' ? (cls as any).department : (cls as any)?.department?.name || '',
    departmentId: typeof (cls as any).department === 'object' && (cls as any).department?._id ? (cls as any).department._id.toString() : undefined,
  };
  return ApiResponse.success(res, response, 'Class updated successfully');
};

// ---------------------------------------------------------------------------
// DELETE /classes/:id
// ---------------------------------------------------------------------------

async function deleteClassToTrash(classId: string, req: Request): Promise<void> {
  const existing = await ClassModel.findById(classId);
  if (!existing) throw new NotFoundError('Class');
  assertOwnsOrg(req, existing, 'school');

  await moveToTrash({
    entityType: 'Class',
    label: existing.section ? `${existing.title} — ${existing.section}` : existing.title,
    school: existing.school,
    snapshots: [{ modelName: 'Class', data: existing.toObject() }],
    req,
  });

  await ClassModel.findByIdAndDelete(classId);
}

export const remove = async (req: Request, res: Response): Promise<Response> => {
  await deleteClassToTrash(req.params.id, req);
  return ApiResponse.noContent(res, 'Class deleted');
};

// ---------------------------------------------------------------------------
// DELETE /classes/bulk — body: { ids: string[] } or { selectAll: true, filters }
// ---------------------------------------------------------------------------

export const bulkRemove = async (req: Request, res: Response): Promise<Response> => {
  let ids: string[];

  if (req.body?.selectAll === true) {
    const filters = (req.body?.filters || {}) as { schoolId?: string; department?: string; status?: string; search?: string };
    const filter: Record<string, unknown> = {};
    if (filters.schoolId && req.user?.role !== 'org_admin') filter.school = filters.schoolId;
    if (filters.department) filter.department = filters.department;
    if (filters.status && ['active', 'inactive', 'completed'].includes(filters.status)) filter.status = filters.status;
    const scopedFilter = applyOrgFilter(req, filter, 'school');

    const matches = await ClassModel.find(scopedFilter)
      .select('_id title room section')
      .populate('school', 'name')
      .populate('department', 'name')
      .lean();

    let candidates = matches as any[];
    if (filters.search) {
      const s = filters.search.toLowerCase();
      candidates = candidates.filter((c) => {
        const title = (c.title || '').toLowerCase();
        const room = (c.room || '').toLowerCase();
        const section = (c.section || '').toLowerCase();
        const schoolName = (c.school?.name || '').toLowerCase();
        const department = (typeof c.department === 'string' ? c.department : c.department?.name || '').toLowerCase();
        return title.includes(s) || room.includes(s) || section.includes(s) || schoolName.includes(s) || department.includes(s);
      });
    }
    ids = candidates.map((c) => String(c._id));

    if (ids.length === 0) {
      return ApiResponse.success(res, { deleted: 0, matched: 0 }, 'No matching classes to delete');
    }
  } else {
    ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
    if (ids.length === 0) throw new BadRequestError('At least one class id is required');
  }

  const results: { id: string; success: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      await deleteClassToTrash(id, req);
      results.push({ id, success: true });
    } catch (err: any) {
      results.push({ id, success: false, error: err.message || 'Failed to delete' });
    }
  }

  const deleted = results.filter((r) => r.success).length;
  return ApiResponse.success(res, { results, deleted }, `Deleted ${deleted} of ${ids.length} class(es)`);
};

// ---------------------------------------------------------------------------
// PATCH /classes/:id/status — Quick status toggle
// ---------------------------------------------------------------------------

export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;
  if (!status || !['active', 'inactive', 'completed'].includes(status)) {
    throw new BadRequestError('Valid status required: active, inactive, or completed');
  }

  const existing = await ClassModel.findById(req.params.id);
  if (!existing) throw new NotFoundError('Class');
  assertOwnsOrg(req, existing, 'school');

  const cls = await ClassModel.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  )
    .populate('school', 'name')
    .populate('course', 'title.en slug')
    .lean();

  if (!cls) throw new NotFoundError('Class');
  return ApiResponse.success(res, cls, `Class status updated to ${status}`);
};

// ---------------------------------------------------------------------------
// GET /classes/schedule/:courseId — Weekly schedule grouped by day
// ---------------------------------------------------------------------------

export const getSchedule = async (req: Request, res: Response): Promise<Response> => {
  const classes = await ClassModel.find({ course: req.params.courseId })
    .populate('teacher', 'teacherId')
    .sort({ dayOfWeek: 1, startTime: 1 })
    .lean();

  const schedule = days.map((day, i) => ({
    day,
    dayIndex: i,
    classes: classes.filter((c: any) => c.dayOfWeek === i),
  }));

  return ApiResponse.success(res, schedule);
};

// ---------------------------------------------------------------------------
// GET /classes/export — Export all classes as formatted XLSX
// ---------------------------------------------------------------------------

export const exportClasses = async (req: Request, res: Response): Promise<void> => {
  const filter: Record<string, unknown> = applyOrgFilter(req, {}, 'school');

  const classes = await ClassModel.find(filter)
    .populate('school', 'name')
    .sort({ createdAt: -1 })
    .lean();

  const headers = ['Organization', 'Batch Number', 'Grade Level', 'Academic Year', 'Final Grade (Yes/No)', 'Entry Grade (Yes/No)', 'Department', 'Class Name', 'Section', 'Room', 'Shift / Learning Mode'];
  const rows = classes.map((c: any) => {
    const departmentValue = typeof c.department === 'string' ? c.department : c.department?.name || '';
    return [
      c.school?.name || '',
      c.batch || '',
      c.gradeLevel !== null && c.gradeLevel !== undefined ? String(c.gradeLevel) : '',
      c.academicYear || '',
      c.isGraduatingGrade ? 'Yes' : 'No',
      c.isEntryGrade ? 'Yes' : 'No',
      departmentValue || 'Primary',
      c.title || '',
      c.section || '',
      c.room || '',
      c.shiftMode || 'Morning',
    ];
  });

  const buffer = buildXlsxBuffer(headers, rows, 'Classes');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=classes-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// GET /classes/template — Download empty structured template (XLSX)
// ---------------------------------------------------------------------------

export const downloadTemplate = async (_req: Request, res: Response): Promise<void> => {
  const headers = ['Organization', 'Batch Number', 'Grade Level', 'Academic Year', 'Final Grade (Yes/No)', 'Entry Grade (Yes/No)', 'Department', 'Class Name', 'Section', 'Room', 'Shift / Learning Mode'];
  const rows = [['', '10026', '3', '2026-2027', 'No', 'No', 'Primary', 'Grade 3', 'A', 'Room 5', 'Morning']];
  const buffer = buildXlsxBuffer(headers, rows, 'Class Template');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=classes-template.xlsx');
  res.end(buffer);
};

// ---------------------------------------------------------------------------
// Helpers for import
// ---------------------------------------------------------------------------

function getField(row: Record<string, any>, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function esc(val: string): string {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const VALID_SHIFT_MODES = ['Morning', 'Afternoon', 'Evening', 'Virtual'];

function isTruthy(val: unknown): boolean {
  return /^(y|yes|true|1)$/i.test(String(val ?? '').trim());
}

// ---------------------------------------------------------------------------
// POST /classes/import — Transactional bulk import
// ---------------------------------------------------------------------------

export const bulkImport = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) throw new BadRequestError('An Excel file is required (field name "file")');

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new BadRequestError('The uploaded file has no sheets');

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
  if (rows.length === 0) throw new BadRequestError('The uploaded file has no data rows');

  const ownOrgId = resolveOrgIdForCreate(req) as string | undefined;
  const isOrgAdmin = req.user?.role === 'org_admin';

  const errors: { row: number; message: string }[] = [];
  const documents: any[] = [];

  // In-memory cache for resolved department IDs during this import batch
  const deptCache = new Map<string, mongoose.Types.ObjectId>();

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];

    try {
      const className = String(getField(row, 'Class Name', 'Class') ?? '').trim();
      const section = String(getField(row, 'Section') ?? '').trim();
      const room = String(getField(row, 'Room') ?? '').trim();
      const departmentRaw = String(getField(row, 'Department') ?? '').trim();
      const shiftRaw = String(getField(row, 'Shift / Learning Mode', 'Shift Mode', 'Shift') ?? 'Morning').trim();
      const batch = String(getField(row, 'Batch Number', 'Batch') ?? '').trim();
      const gradeLevelRaw = String(getField(row, 'Grade Level', 'Grade') ?? '').trim();
      const academicYear = String(getField(row, 'Academic Year', 'Year') ?? '').trim();
      const isGraduatingGrade = isTruthy(getField(row, 'Final Grade (Yes/No)', 'Final Grade', 'Graduating Grade', 'Is Graduating Grade'));
      const isEntryGrade = isTruthy(getField(row, 'Entry Grade (Yes/No)', 'Entry Grade', 'Is Entry Grade'));

      if (!className) throw new Error('Class Name is required');
      if (!room) throw new Error('Room is required');
      if (!departmentRaw) throw new Error('Department is required');
      // These three mirror the required fields on the manual "Add Class"
      // form — without them a class can't be picked up by "Promote All
      // Classes" (which matches on department + gradeLevel + academicYear).
      if (!batch) throw new Error('Batch Number is required');
      if (!gradeLevelRaw) throw new Error('Grade Level is required');
      const gradeLevel = Number(gradeLevelRaw);
      if (!Number.isFinite(gradeLevel) || gradeLevel < 0 || gradeLevel > 30) throw new Error('Grade Level must be a number between 0 and 30');
      if (!academicYear) throw new Error('Academic Year is required');

      const shiftMode = VALID_SHIFT_MODES.includes(shiftRaw) ? shiftRaw : 'Morning';

      let schoolId: string | undefined = ownOrgId;
      if (!schoolId) {
        const schoolName = String(getField(row, 'School', 'Organization') ?? '').trim();
        if (!schoolName) throw new Error('School is required for super admin');
        const school = await School.findOne({ name: new RegExp(`^${esc(schoolName)}$`, 'i') }).lean();
        if (!school) throw new Error(`School "${schoolName}" not found`);
        schoolId = school._id.toString();
      }

      // Auto-provision department: case-insensitive lookup, upsert if missing.
      const cacheKey = `${schoolId}::${departmentRaw.toLowerCase()}`;
      let deptId = deptCache.get(cacheKey);
      if (!deptId) {
        const dept = await Department.findOneAndUpdate(
          { tenantId: new mongoose.Types.ObjectId(schoolId), name: new RegExp(`^${esc(departmentRaw)}$`, 'i') },
          { $setOnInsert: { name: departmentRaw, tenantId: new mongoose.Types.ObjectId(schoolId) } },
          { upsert: true, new: true, lean: true },
        );
        if (!dept) throw new Error(`Failed to resolve or create department "${departmentRaw}"`);
        deptId = dept._id;
        deptCache.set(cacheKey, deptId);
      }

      documents.push({
        school: new mongoose.Types.ObjectId(schoolId),
        department: deptId,
        title: className,
        section,
        room,
        shiftMode,
        status: 'active',
        batch,
        gradeLevel,
        academicYear,
        isGraduatingGrade,
        isEntryGrade,
      });
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message || 'Unknown error' });
    }
  }

  // No multi-document transaction — this deployment's MongoDB runs as a
  // standalone instance (no replica set configured), which doesn't support
  // transactions at all. `session.withTransaction()` throws immediately
  // ("Transaction numbers are only allowed on a replica set member or
  // mongos"); confirmed directly against production that every "successful"
  // import under that code path inserted zero documents. insertMany with
  // ordered:false still gives proper per-row error reporting without a session.
  let inserted = 0;
  if (documents.length > 0) {
    try {
      const result = await ClassModel.insertMany(documents, { ordered: false });
      inserted = result.length;
    } catch (txErr: any) {
      if (txErr.insertedDocs) inserted = txErr.insertedDocs.length;
      if (txErr.writeErrors) {
        txErr.writeErrors.forEach((we: any) => {
          errors.push({ row: we.index + 2, message: we.err?.errmsg || we.errmsg || 'Insert error' });
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
  }, `Imported ${inserted} of ${rows.length} classes`);
};

// ---------------------------------------------------------------------------
// Year-end promotion — bump every class's students to the next grade in one
// action, keeping their cohort `batch` code fixed and every historical
// record (attendance, results, gradebook) intact on the OLD class document.
// ---------------------------------------------------------------------------

// Bumps the trailing grade number in a free-text title ("Grade 3" -> "Grade
// 4"). Titles without a trailing number just get a suffix an admin can fix.
function bumpTitleGrade(title: string, newGradeLevel: number): string {
  if (/\d+(?!.*\d)/.test(title)) {
    return title.replace(/\d+(?!.*\d)/, String(newGradeLevel));
  }
  return `${title} (Promoted)`;
}

// The academic year "one after whichever is currently active" — Aug(month
// index 7)+ counts as already inside a new academic year.
function nextAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  const startY = now.getMonth() >= 7 ? y : y - 1;
  return `${startY + 1}-${startY + 2}`;
}

// ---------------------------------------------------------------------------
// GET /classes/promotion-preview — dry-run report of what "Promote All"
// would do for one organization, without changing anything.
// ---------------------------------------------------------------------------

export const getPromotionPreview = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = resolveOrgIdForCreate(req, req.query.schoolId) as string | undefined;
  if (!schoolId) throw new BadRequestError('An organization must be selected');
  // Testing-only override (see promoteAll below) — normally an
  // already-promoted class, or one already tagged with the target year, is
  // reported as skipped rather than promotable. Checking this in the UI
  // lifts BOTH guards so QA can repeatedly re-run promotion (including
  // across several academic years in a row) against the same test data;
  // production runs must always leave it off so both guards stay active.
  const allowRepromote = req.query.allowRepromote === 'true';

  const suggestedAcademicYear = nextAcademicYear();
  // Mirror whatever the admin currently has typed into "Target Academic
  // Year" so the preview matches what Confirm will actually do; fall back
  // to the suggestion before they've edited the field.
  const targetAcademicYear = (req.query.targetAcademicYear as string) || suggestedAcademicYear;

  const classes = await ClassModel.find({ school: schoolId, status: 'active' })
    .sort({ gradeLevel: 1, title: 1 })
    .lean();

  const groups: Record<string, unknown>[] = [];
  const missingGradeLevel: Record<string, unknown>[] = [];
  const sameYearSkipped: Record<string, unknown>[] = [];

  // Section (A/B/C) is intentionally NOT part of the promotion match — every
  // section of a grade promotes into ONE shared next-grade class, same as
  // promoteAll below. Precompute one auto-generated title per (department,
  // next grade) group so every section previews the same merged target.
  const targetTitleByKey = new Map<string, string>();
  for (const cls of classes as any[]) {
    if ((cls.promotedAt && !allowRepromote) || cls.isGraduatingGrade || cls.gradeLevel === null || cls.gradeLevel === undefined || (cls.academicYear === targetAcademicYear && !allowRepromote)) continue;
    const key = `${cls.department}::${cls.gradeLevel + 1}`;
    if (!targetTitleByKey.has(key)) targetTitleByKey.set(key, bumpTitleGrade(cls.title, cls.gradeLevel + 1));
  }

  for (const cls of classes as any[]) {
    if (cls.promotedAt && !allowRepromote) {
      groups.push({ classId: cls._id, title: cls.title, section: cls.section, action: 'already-promoted' });
      continue;
    }
    if (cls.gradeLevel === null || cls.gradeLevel === undefined) {
      missingGradeLevel.push({ classId: cls._id, title: cls.title, section: cls.section });
      continue;
    }
    // A class already tagged with the target year is presumably one of
    // next year's classes (e.g. set up ahead of time, or a previous
    // promotion's target) — it must NEVER be treated as a "current year"
    // class needing promotion in this same run, or a chain of pre-existing
    // next-grade classes gets cascaded through several grade levels in a
    // single click instead of moving each grade up exactly once. The
    // testing override lifts this too, since a tester may deliberately
    // want to re-promote through several years of the same fixture data.
    if (cls.academicYear === targetAcademicYear && !allowRepromote) {
      sameYearSkipped.push({ classId: cls._id, title: cls.title, section: cls.section });
      continue;
    }

    const studentCount = await Student.countDocuments({ class: cls._id, status: 'active' });

    // An entry-grade class (e.g. Grade 1) opens a fresh same-grade intake
    // for the target year regardless of whether it also promotes/graduates
    // this cycle's cohort — a school needs new Grade 1 seats every year.
    const opensNewIntake = !!cls.isEntryGrade;

    if (cls.isGraduatingGrade) {
      groups.push({ classId: cls._id, title: cls.title, section: cls.section, batch: cls.batch, gradeLevel: cls.gradeLevel, studentCount, action: 'graduate', opensNewIntake });
      continue;
    }

    const nextGradeLevel = cls.gradeLevel + 1;
    const existingTarget = await ClassModel.findOne({
      school: schoolId, department: cls.department,
      gradeLevel: nextGradeLevel, academicYear: targetAcademicYear,
    }).select('title').lean();

    groups.push({
      classId: cls._id, title: cls.title, section: cls.section, batch: cls.batch, gradeLevel: cls.gradeLevel, studentCount,
      action: existingTarget ? 'promote-existing' : 'promote-new',
      targetTitle: existingTarget ? (existingTarget as any).title : targetTitleByKey.get(`${cls.department}::${nextGradeLevel}`),
      opensNewIntake,
    });
  }

  return ApiResponse.success(res, { suggestedAcademicYear, groups, missingGradeLevel, sameYearSkipped });
};

// ---------------------------------------------------------------------------
// POST /classes/promote-all — executes the promotion in one shot: for each
// eligible class, find-or-create its next-grade class (carrying the batch
// code forward) and bulk-move active students into it; graduating-grade
// classes instead mark their students `graduated`. The source class is
// never deleted or mutated beyond `status`/`promotedAt`/`promotedTo`, so
// every historical record tied to its ID stays intact.
//
// Section (A/B/C) is deliberately excluded from the match key — every
// section of a grade shares ONE next-grade class (department + gradeLevel +
// academicYear only), so e.g. Grade 1-A, Grade 1-B, and Grade 1-C all merge
// into a single new Grade 2 class rather than needing per-section targets.
// ---------------------------------------------------------------------------

export const promoteAll = async (req: Request, res: Response): Promise<Response> => {
  const schoolId = resolveOrgIdForCreate(req, req.body.schoolId) as string | undefined;
  if (!schoolId) throw new BadRequestError('An organization must be selected');
  const targetAcademicYear = String(req.body.targetAcademicYear || '').trim();
  if (!targetAcademicYear) throw new BadRequestError('Target academic year is required');
  // Testing-only override — normally BOTH (a) a class already promoted
  // this cycle (`promotedAt` set) and (b) a class already tagged with the
  // target academic year are excluded, so a cohort can never be moved
  // twice and a chain of pre-existing next-grade classes can never
  // cascade through several grade levels in one click. Checking this lifts
  // both guards so QA can repeatedly re-run promotion — including across
  // several academic years in a row — against the same fixture data. The
  // frontend only sends this when the admin explicitly checks the
  // "testing" box in the Promote All dialog; it must stay off by default.
  const allowRepromote = req.body.allowRepromote === true;

  const classFilter: Record<string, unknown> = { school: schoolId, status: 'active' };
  if (!allowRepromote) {
    classFilter.promotedAt = null;
    // See the comment above `getPromotionPreview`'s equivalent check — a
    // class already tagged with the target year must never be treated as
    // a "current year" class needing promotion outside of testing.
    classFilter.academicYear = { $ne: targetAcademicYear };
  }
  const classes = await ClassModel.find(classFilter).sort({ gradeLevel: 1 });

  const sameYearSkipped = allowRepromote ? 0 : await ClassModel.countDocuments({
    school: schoolId, status: 'active', academicYear: targetAcademicYear, gradeLevel: { $ne: null },
  });

  const results: Record<string, unknown>[] = [];

  let intakesOpened = 0;

  for (const cls of classes) {
    if (cls.gradeLevel === null || cls.gradeLevel === undefined) {
      results.push({ classId: cls._id, title: cls.title, action: 'skipped', reason: 'No grade level set' });
      continue;
    }

    // An entry-grade class (e.g. Grade 1) opens a fresh SAME-grade class
    // for the target year, in addition to whatever happens to this cycle's
    // cohort below — a school needs new Grade 1 seats every year, not just
    // a promoted-up Grade 2. Matched by {department, gradeLevel,
    // academicYear} (no section, same merge rule as normal targets), so
    // multiple entry-flagged sections share one fresh intake class instead
    // of creating a duplicate per section. `batch` is left blank — there's
    // no prior cohort to inherit one from — for the admin to assign once
    // the new intake actually enrolls.
    let newIntakeClassId: mongoose.Types.ObjectId | undefined;
    let newIntakeTitle: string | undefined;
    if (cls.isEntryGrade) {
      let intakeClass = await ClassModel.findOne({
        school: schoolId, department: cls.department,
        gradeLevel: cls.gradeLevel, academicYear: targetAcademicYear,
      });
      if (!intakeClass) {
        intakeClass = await ClassModel.create({
          school: cls.school, department: cls.department,
          title: cls.title, section: cls.section, room: cls.room, shiftMode: cls.shiftMode,
          teacher: cls.teacher || undefined, status: 'active',
          gradeLevel: cls.gradeLevel, academicYear: targetAcademicYear, batch: '', isEntryGrade: true,
        });
        intakesOpened += 1;
      }
      newIntakeClassId = intakeClass._id as mongoose.Types.ObjectId;
      newIntakeTitle = intakeClass.title;
    }

    if (cls.isGraduatingGrade) {
      const { modifiedCount } = await Student.updateMany({ class: cls._id, status: 'active' }, { $set: { status: 'graduated' } });
      cls.promotedAt = new Date();
      await cls.save();
      results.push({ classId: cls._id, title: cls.title, action: 'graduated', studentsMoved: modifiedCount, newIntakeClassId, newIntakeTitle });
      continue;
    }

    const nextGradeLevel = cls.gradeLevel + 1;
    let targetClass = await ClassModel.findOne({
      school: schoolId, department: cls.department,
      gradeLevel: nextGradeLevel, academicYear: targetAcademicYear,
    });

    if (!targetClass) {
      // First section to reach this grade "wins" the new class's section
      // label/room/teacher as a starting point — an admin can rename or
      // reassign it afterward; every other section just merges its
      // students into whichever class was created here.
      targetClass = await ClassModel.create({
        school: cls.school, department: cls.department,
        title: bumpTitleGrade(cls.title, nextGradeLevel),
        section: cls.section, room: cls.room, shiftMode: cls.shiftMode,
        teacher: cls.teacher || undefined, status: 'active',
        gradeLevel: nextGradeLevel, academicYear: targetAcademicYear, batch: cls.batch,
      });
    }

    const deptDoc = await Department.findById(cls.department).select('name').lean();
    const deptName = (deptDoc as any)?.name;

    const { modifiedCount } = await Student.updateMany(
      { class: cls._id, status: 'active' },
      { $set: { class: targetClass._id, department: deptName, shiftMode: targetClass.shiftMode, grade: targetClass.title } }
    );

    cls.promotedAt = new Date();
    cls.promotedTo = targetClass._id as mongoose.Types.ObjectId;
    cls.status = 'completed';
    await cls.save();

    results.push({
      classId: cls._id, title: cls.title, action: 'promoted',
      targetClassId: targetClass._id, targetTitle: targetClass.title, studentsMoved: modifiedCount,
      newIntakeClassId, newIntakeTitle,
    });
  }

  const promoted = results.filter((r) => r.action === 'promoted').length;
  const graduated = results.filter((r) => r.action === 'graduated').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;
  const studentsMoved = results.reduce((sum: number, r: any) => sum + (r.studentsMoved || 0), 0);

  return ApiResponse.success(
    res,
    { results, promoted, graduated, skipped, sameYearSkipped, studentsMoved, intakesOpened },
    `Promoted ${promoted} classes, graduated ${graduated}, moved ${studentsMoved} students` + (intakesOpened > 0 ? `, opened ${intakesOpened} new intake class(es)` : '')
  );
};
