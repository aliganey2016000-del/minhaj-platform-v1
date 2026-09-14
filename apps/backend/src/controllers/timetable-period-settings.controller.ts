import { Request, Response } from 'express';
import mongoose from 'mongoose';
import TimetablePeriodSettings from '../models/timetable-period-settings.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError } from '../utils/api-error';
import { resolveOrgIdForCreate } from '../utils/tenant-scope';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DEFAULT_SCHOOL_PERIODS = [
  { label: 'Period 1', startTime: '08:00', endTime: '08:45', isBreak: false },
  { label: 'Period 2', startTime: '08:45', endTime: '09:30', isBreak: false },
  { label: 'Break', startTime: '09:30', endTime: '09:50', isBreak: true },
  { label: 'Period 3', startTime: '09:50', endTime: '10:35', isBreak: false },
  { label: 'Period 4', startTime: '10:35', endTime: '11:20', isBreak: false },
];

function schoolId(req: Request): string {
  const requested = String(req.query.school || req.body?.school || '');
  const resolved = String(resolveOrgIdForCreate(req, requested) || '');
  if (!resolved || !mongoose.isValidObjectId(resolved)) throw new BadRequestError('School is required');
  return resolved;
}

function validatePeriods(input: unknown) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 30) throw new BadRequestError('Add between 1 and 30 periods');
  const periods = input.map((item: any, index) => ({
    label: String(item?.label || '').trim(),
    startTime: String(item?.startTime || '').slice(0, 5),
    endTime: String(item?.endTime || '').slice(0, 5),
    isBreak: item?.isBreak === true,
    index,
  }));
  for (const period of periods) {
    if (!period.label) throw new BadRequestError(`Row ${period.index + 1}: label is required`);
    if (!TIME.test(period.startTime) || !TIME.test(period.endTime) || period.endTime <= period.startTime) {
      throw new BadRequestError(`Row ${period.index + 1}: end time must be after start time`);
    }
  }
  const sorted = [...periods].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startTime < sorted[index - 1].endTime) throw new BadRequestError(`${sorted[index].label} overlaps ${sorted[index - 1].label}`);
  }
  return sorted.map(({ index: _index, ...period }) => period);
}

export const getPeriodSettings = async (req: Request, res: Response): Promise<Response> => {
  const school = schoolId(req);
  const existing = await TimetablePeriodSettings.findOne({ school }).lean();
  return ApiResponse.success(res, { school, periods: existing?.periods?.length ? existing.periods : DEFAULT_SCHOOL_PERIODS });
};

export const savePeriodSettings = async (req: Request, res: Response): Promise<Response> => {
  const school = schoolId(req);
  const periods = validatePeriods(req.body?.periods);
  const settings = await TimetablePeriodSettings.findOneAndUpdate(
    { school },
    { $set: { periods, updatedBy: req.user!.userId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  return ApiResponse.success(res, settings, 'Timetable period settings saved');
};
