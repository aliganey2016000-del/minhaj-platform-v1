import { Request, Response } from 'express';
import Notification from '../models/notification.model';
import User from '../models/user.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/api-error';
import { notifyUser } from '../utils/notify';

// GET /my — Student's notifications (with unreadCount)
export const getMyNotifications = async (req: Request, res: Response) => {
  const { read, page = '1', limit = '30' } = req.query;
  const filter: Record<string, unknown> = { user: req.user!.userId };
  if (read === 'true') filter.read = true;
  else if (read === 'false') filter.read = false;

  const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit as string, 10) || 30));

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user!.userId, read: false }),
  ]);

  return res.status(200).json({
    success: true, statusCode: 200, message: 'Notifications retrieved',
    data: notifications,
    meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasNextPage: pageNum < Math.ceil(total / limitNum), hasPrevPage: pageNum > 1 },
    unreadCount,
    timestamp: new Date().toISOString(),
  });
};

// PATCH /:id/read — Mark single as read
export const markAsRead = async (req: Request, res: Response) => {
  const n = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user!.userId },
    { read: true },
    { new: true }
  );
  if (!n) throw new NotFoundError('Notification');
  return ApiResponse.success(res, n, 'Marked as read');
};

// PATCH /read-all — Mark all as read
export const markAllRead = async (req: Request, res: Response) => {
  await Notification.updateMany({ user: req.user!.userId, read: false }, { read: true });
  const unreadCount = await Notification.countDocuments({ user: req.user!.userId, read: false });
  return ApiResponse.success(res, { unreadCount }, 'All marked as read');
};

// DELETE /:id
export const remove = async (req: Request, res: Response) => {
  const n = await Notification.findOneAndDelete({ _id: req.params.id, user: req.user!.userId });
  if (!n) throw new NotFoundError('Notification');
  return ApiResponse.noContent(res, 'Deleted');
};

// POST / — Create notification (admin/system use)
export const create = async (req: Request, res: Response) => {
  const { user, title, message, type, link } = req.body;
  if (!user || !title || !message) throw new BadRequestError('user, title, and message required');

  // This route is gated by adminOnly (admin + org_admin, incl. staff acting
  // as org_admin). The platform admin may notify anyone, but an org_admin
  // must be confined to users in their own organization — otherwise they
  // could spam/phish any user platform-wide just by knowing their user id.
  if (req.user?.role !== 'admin') {
    const target = await User.findById(user).select('organizationId').lean();
    if (!target || !req.user?.organizationId || (target as any).organizationId?.toString() !== req.user.organizationId) {
      throw new ForbiddenError('You can only send notifications to users in your own organization');
    }
  }

  const n = await notifyUser({ userId: user, title, message, type: type || 'info', link: link || '' });
  return ApiResponse.created(res, n, 'Notification created');
};