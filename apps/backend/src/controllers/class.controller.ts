import { Request, Response } from 'express';
import ClassModel from '../models/class.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, resolveOrgIdForCreate } from '../utils/tenant-scope';

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

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(200, parseInt(limit as string, 10) || 50));

  const [classes, total] = await Promise.all([
    ClassModel.find(scopedFilter)
      .populate('school', 'name')
      .populate('course', 'title.en slug category')
      .populate('teacher', 'teacherId')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    ClassModel.countDocuments(scopedFilter),
  ]);

  let result = classes;
  if (search) {
    const s = (search as string).toLowerCase();
    result = classes.filter((c: any) => {
      const title = (c.title || '').toLowerCase();
      const room = (c.room || '').toLowerCase();
      const section = (c.section || '').toLowerCase();
      const schoolName = (c.school?.name || '').toLowerCase();
      return title.includes(s) || room.includes(s) || section.includes(s) || schoolName.includes(s);
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
    .lean();

  return ApiResponse.created(res, populated, 'Class created successfully');
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
    .lean();

  if (!cls) throw new NotFoundError('Class');
  return ApiResponse.success(res, cls, 'Class updated successfully');
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