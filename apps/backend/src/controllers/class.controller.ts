import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import ClassModel from '../models/class.model';
import { buildXlsxBuffer } from '../utils/xlsx-buffer';
import Department from '../models/department.model';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate, getOwnTeacherRecord } from '../utils/tenant-scope';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------------------
// GET /classes — List all with optional filters
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const { schoolId, status, page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {};
  // org_admin can't widen the filter to another org via ?schoolId=; their
  // own organization always wins (applied below via applyOrgFilter).
  if (schoolId && req.user?.role !== 'org_admin') filter.school = schoolId as string;
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

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const existing = await ClassModel.findById(req.params.id);
  if (!existing) throw new NotFoundError('Class');
  assertOwnsOrg(req, existing, 'school');

  await ClassModel.findByIdAndDelete(req.params.id);
  return ApiResponse.noContent(res, 'Class deleted');
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

  const headers = ['Class Name', 'Section', 'Organization', 'Department', 'Room', 'Shift / Learning Mode'];
  const rows = classes.map((c: any) => {
    const departmentValue = typeof c.department === 'string' ? c.department : c.department?.name || '';
    return [c.title || '', c.section || '', c.school?.name || '', departmentValue || 'Primary', c.room || '', c.shiftMode || 'Morning'];
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
  const headers = ['Class Name', 'Section', 'Department', 'Room', 'Shift / Learning Mode'];
  const rows = [['Grade 3', 'A', 'Primary', 'Room 5', 'Morning']];
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

      if (!className) throw new Error('Class Name is required');
      if (!section) throw new Error('Section is required');
      if (!room) throw new Error('Room is required');
      if (!departmentRaw) throw new Error('Department is required');

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
          errors.push({ row: we.index + 2, message: we.errmsg || 'Insert error' });
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
