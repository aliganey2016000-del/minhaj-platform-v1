import mongoose from 'mongoose';
import { Request, Response } from 'express';
import School from '../models/school.model';
import SchoolCalendarDay from '../models/school-calendar-day.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { resolveViewableOrgId } from '../utils/tenant-scope';

const TYPES = new Set(['instructional', 'holiday', 'closure', 'exam', 'special']);

function normalizeDate(raw: unknown): Date {
  const value = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestError('Date must use YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new BadRequestError('A valid date is required.');
  date.setHours(0, 0, 0, 0);
  return date;
}

async function schoolIdFor(req: Request): Promise<string> {
  const requested = req.query.school ?? req.body?.school;
  const id = resolveViewableOrgId(req, requested);
  if (!id || !mongoose.isValidObjectId(id)) throw new BadRequestError('School is required.');
  const school = await School.findById(id).select('_id').lean();
  if (!school) throw new NotFoundError('School');
  return String(school._id);
}

export const listCalendarDays = async (req: Request, res: Response): Promise<Response> => {
  const school = await schoolIdFor(req);
  const from = req.query.from ? normalizeDate(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = req.query.to ? normalizeDate(req.query.to) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  to.setHours(23, 59, 59, 999);
  const rows = await SchoolCalendarDay.find({ school, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean();
  return ApiResponse.success(res, rows);
};

export const upsertCalendarDay = async (req: Request, res: Response): Promise<Response> => {
  const school = await schoolIdFor(req);
  if (!['admin', 'org_admin'].includes(req.user?.role || '')) throw new ForbiddenError('Only administrators can manage the school calendar.');

  const date = normalizeDate(req.body?.date);
  const type = String(req.body?.type || 'instructional').trim();
  if (!TYPES.has(type)) throw new BadRequestError('Invalid calendar day type.');
  const name = String(req.body?.name || '').trim();
  if (!name) throw new BadRequestError('Calendar day name is required.');
  const isInstructional = typeof req.body?.isInstructional === 'boolean'
    ? req.body.isInstructional
    : !['holiday', 'closure'].includes(type);

  const row = await SchoolCalendarDay.findOneAndUpdate(
    { school, date },
    {
      $set: {
        type,
        name: name.slice(0, 150),
        isInstructional,
        notes: String(req.body?.notes || '').trim().slice(0, 500),
        createdBy: new mongoose.Types.ObjectId(req.user!.userId),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return ApiResponse.success(res, row, 'School calendar day saved');
};

export const deleteCalendarDay = async (req: Request, res: Response): Promise<Response> => {
  const school = await schoolIdFor(req);
  if (!['admin', 'org_admin'].includes(req.user?.role || '')) throw new ForbiddenError('Only administrators can manage the school calendar.');
  if (!mongoose.isValidObjectId(req.params.id)) throw new BadRequestError('A valid calendar day id is required.');
  const deleted = await SchoolCalendarDay.findOneAndDelete({ _id: req.params.id, school });
  if (!deleted) throw new NotFoundError('Calendar day');
  return ApiResponse.success(res, { _id: deleted._id }, 'School calendar day removed');
};
