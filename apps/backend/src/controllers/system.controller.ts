import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Setting from '../models/setting.model';
import ActivityLog from '../models/activity-log.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';

// ── Settings ──
export const getSettings = async (_req: Request, res: Response) => {
  const settings = await Setting.find().lean();
  return ApiResponse.success(res, settings);
};

export const updateSettings = async (req: Request, res: Response) => {
  const { settings } = req.body; // [{ key, value, description }]
  if (!Array.isArray(settings)) throw new BadRequestError('settings array required');
  for (const s of settings) {
    await Setting.findOneAndUpdate({ key: s.key }, { value: s.value, description: s.description || '', updatedBy: new mongoose.Types.ObjectId(req.user!.userId) }, { upsert: true, new: true });
  }
  const all = await Setting.find().lean();
  return ApiResponse.success(res, all, 'Settings updated');
};

// ── Activity Logs ──
export const getLogs = async (req: Request, res: Response) => {
  const { action, user, page = '1', limit = '30', search } = req.query;
  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;
  if (user) filter.user = user;
  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 30));
  const [logs, total] = await Promise.all([
    ActivityLog.find(filter).populate('user', 'email role').sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  let result = logs;
  if (search) {
    const s = (search as string).toLowerCase();
    result = logs.filter((l: any) => (l.resource || '').toLowerCase().includes(s) || (l.details || '').toLowerCase().includes(s) || (l.user?.email || '').toLowerCase().includes(s));
  }
  return ApiResponse.paginated(res, result, { page: pageNum, limit: limitNum, total: search ? result.length : total });
};

export const clearLogs = async (_req: Request, res: Response) => {
  await ActivityLog.deleteMany({});
  return ApiResponse.success(res, null, 'All logs cleared');
};