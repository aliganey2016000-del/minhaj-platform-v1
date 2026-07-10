/**
 * School Controller
 *
 * Handles school-related HTTP requests:
 * CRUD operations for school management.
 * Only admins can manage schools.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import School from '../models/school.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

// ---------------------------------------------------------------------------
// GET /schools — List all with pagination, search, and filters
// ---------------------------------------------------------------------------

export const getAll = async (req: Request, res: Response): Promise<Response> => {
  const {
    status,
    page = '1',
    limit = '20',
    search,
  } = req.query;

  const filter: Record<string, unknown> = {};
  if (status && ['active', 'inactive'].includes(status as string)) {
    filter.status = status;
  }

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 20));

  const [schools, total] = await Promise.all([
    School.find(filter)
      .populate('createdBy', 'email')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    School.countDocuments(filter),
  ]);

  let result = schools;
  if (search) {
    const s = (search as string).toLowerCase();
    result = schools.filter((item: any) => {
      const name = (item.name || '').toLowerCase();
      const email = (item.email || '').toLowerCase();
      const principal = (item.principalName || '').toLowerCase();
      const address = (item.address || '').toLowerCase();
      return name.includes(s) || email.includes(s) || principal.includes(s) || address.includes(s);
    });
  }

  return ApiResponse.paginated(res, result, {
    page: pageNum,
    limit: limitNum,
    total: search ? result.length : total,
  });
};

// ---------------------------------------------------------------------------
// GET /schools/:id — Get single school
// ---------------------------------------------------------------------------

export const getById = async (req: Request, res: Response): Promise<Response> => {
  const school = await School.findById(req.params.id)
    .populate('createdBy', 'email')
    .lean();

  if (!school) {
    throw new NotFoundError('School not found');
  }

  return ApiResponse.success(res, school);
};

// ---------------------------------------------------------------------------
// POST /schools — Create a new school
// ---------------------------------------------------------------------------

export const create = async (req: Request, res: Response): Promise<Response> => {
  const payload = {
    ...req.body,
    createdBy: new mongoose.Types.ObjectId(req.user!.userId),
  };

  const school = await School.create(payload);
  const populated = await School.findById(school._id)
    .populate('createdBy', 'email')
    .lean();

  return ApiResponse.created(res, populated, 'School registered successfully');
};

// ---------------------------------------------------------------------------
// PATCH /schools/:id — Update a school
// ---------------------------------------------------------------------------

export const update = async (req: Request, res: Response): Promise<Response> => {
  const school = await School.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  )
    .populate('createdBy', 'email')
    .lean();

  if (!school) {
    throw new NotFoundError('School not found');
  }

  return ApiResponse.success(res, school, 'School updated successfully');
};

// ---------------------------------------------------------------------------
// PATCH /schools/:id/status — Toggle school status
// ---------------------------------------------------------------------------

export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.body;

  if (!status || !['active', 'inactive'].includes(status)) {
    throw new BadRequestError('Status must be "active" or "inactive"');
  }

  const school = await School.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  )
    .populate('createdBy', 'email')
    .lean();

  if (!school) {
    throw new NotFoundError('School not found');
  }

  return ApiResponse.success(res, school, `School ${status === 'active' ? 'activated' : 'deactivated'}`);
};

// ---------------------------------------------------------------------------
// DELETE /schools/:id — Remove a school
// ---------------------------------------------------------------------------

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const school = await School.findByIdAndDelete(req.params.id);

  if (!school) {
    throw new NotFoundError('School not found');
  }

  return ApiResponse.success(res, null, 'School deleted successfully');
};