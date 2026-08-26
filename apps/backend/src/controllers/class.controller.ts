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
import { moveToTrash, moveManyToTrash } from '../utils/trash';
import ensureStudentRecord from '../utils/ensure-student';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------------------
// GET /classes/browse?department=<id> — Minimal, read-only class list for a
// department, open to students too (unlike the admin/teacher-only GET /
// below) — just enough to populate the "browse another class's exams"
// cascade dropdown on the student Exams page. Verifies the department
// belongs to the caller's own school; a student can never be shown another
// organization's classes this way.
// ---------------------------------------------------------------------------

export const browseClasses = async (req: Request, res: Response): Promise<Response> => {
  const departmentId = req.query.department as string | undefined;
  if (!departmentId) throw new BadRequestError('department is required');

  const dept = await Department.findById(departmentId).select('school').lean();
  if (!dept) throw new NotFoundError('Department');

  if (req.user?.role === 'student') {
    const student = await ensureStudentRecord(req.user!.userId);
    const studentSchool = (student as any).school;
    if (!studentSchool || String((dept as any).school) !== String(studentSchool)) {
      throw new NotFoundError('Department');
    }
  } else {
    assertOwnsOrg(req, dept, 'school');
  }

  const classes = await ClassModel.find({ department: departmentId, status: 'active' })
    .select('title section')
    .sort({ title: 1, section: 1 })
    .lean();

  return ApiResponse.success(res, classes);
};

// ---------------------------------------------------------------------------
// GET /classes — List all with optional filters
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId, department, status, page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {};
  // org_admin can't widen the filter to another org via ?schoolId=; their
  // own organization always wins (applied below via applyOrgFilter).
  if (schoolId && req.user?.role !== 'org_admin') filter.school = schoolId as string;
  // Accepts either a single department id or a comma-separated list (the
  // Classes table's Department column filter can have multiple checked).
  if (department) {
    const deptIds = String(department).split(',').map((s) => s.trim()).filter(Boolean);
    if (deptIds.length === 1) filter.department = deptIds[0];
    else if (deptIds.length > 1) filter.department = { $in: deptIds };
  }
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

  // Resolve every matching class in ONE query, then do a single Trash
  // insertMany + one deleteMany instead of looping deleteClassToTrash per
  // id — that per-id loop was slow enough against the remote Atlas cluster
  // to blow past the browser/proxy request timeout on large batches.
  const classes = await ClassModel.find({ _id: { $in: ids } });
  const foundIds = new Set(classes.map((c) => String(c._id)));
  const notFoundIds = ids.filter((id) => !foundIds.has(id));

  const allowed: (typeof classes)[number][] = [];
  const forbiddenIds: string[] = [];
  for (const c of classes) {
    try {
      assertOwnsOrg(req, c, 'school');
      allowed.push(c);
    } catch {
      forbiddenIds.push(String(c._id));
    }
  }

  const results: { id: string; success: boolean; error?: string }[] = [
    ...notFoundIds.map((id) => ({ id, success: false, error: 'Not found' })),
    ...forbiddenIds.map((id) => ({ id, success: false, error: 'Not permitted' })),
  ];

  if (allowed.length > 0) {
    const trashEntries = allowed.map((c) => ({
      entityType: 'Class' as const,
      label: c.section ? `${c.title} — ${c.section}` : c.title,
      school: c.school,
      snapshots: [{ modelName: 'Class', data: c.toObject() }],
    }));

    await moveManyToTrash(trashEntries, req);
    await ClassModel.deleteMany({ _id: { $in: allowed.map((c) => c._id) } });

    results.push(...allowed.map((c) => ({ id: String(c._id), success: true })));
  }

  const deleted = allowed.length;
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

