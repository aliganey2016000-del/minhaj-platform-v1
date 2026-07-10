"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.create = exports.remove = exports.markAllRead = exports.markAsRead = exports.getMyNotifications = void 0;
const notification_model_1 = __importDefault(require("../models/notification.model"));
const api_response_1 = __importDefault(require("../utils/api-response"));
const api_error_1 = require("../utils/api-error");
// GET /my — Student's notifications (with unreadCount)
const getMyNotifications = async (req, res) => {
    const { read, page = '1', limit = '30' } = req.query;
    const filter = { user: req.user.userId };
    if (read === 'true')
        filter.read = true;
    else if (read === 'false')
        filter.read = false;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 30));
    const [notifications, total, unreadCount] = await Promise.all([
        notification_model_1.default.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
        notification_model_1.default.countDocuments(filter),
        notification_model_1.default.countDocuments({ user: req.user.userId, read: false }),
    ]);
    return res.status(200).json({
        success: true, statusCode: 200, message: 'Notifications retrieved',
        data: notifications,
        meta: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasNextPage: pageNum < Math.ceil(total / limitNum), hasPrevPage: pageNum > 1 },
        unreadCount,
        timestamp: new Date().toISOString(),
    });
};
exports.getMyNotifications = getMyNotifications;
// PATCH /:id/read — Mark single as read
const markAsRead = async (req, res) => {
    const n = await notification_model_1.default.findOneAndUpdate({ _id: req.params.id, user: req.user.userId }, { read: true }, { new: true });
    if (!n)
        throw new api_error_1.NotFoundError('Notification');
    return api_response_1.default.success(res, n, 'Marked as read');
};
exports.markAsRead = markAsRead;
// PATCH /read-all — Mark all as read
const markAllRead = async (req, res) => {
    await notification_model_1.default.updateMany({ user: req.user.userId, read: false }, { read: true });
    const unreadCount = await notification_model_1.default.countDocuments({ user: req.user.userId, read: false });
    return api_response_1.default.success(res, { unreadCount }, 'All marked as read');
};
exports.markAllRead = markAllRead;
// DELETE /:id
const remove = async (req, res) => {
    const n = await notification_model_1.default.findOneAndDelete({ _id: req.params.id, user: req.user.userId });
    if (!n)
        throw new api_error_1.NotFoundError('Notification');
    return api_response_1.default.noContent(res, 'Deleted');
};
exports.remove = remove;
// POST / — Create notification (admin/system use)
const create = async (req, res) => {
    const { user, title, message, type, link } = req.body;
    if (!user || !title || !message)
        throw new api_error_1.BadRequestError('user, title, and message required');
    const n = await notification_model_1.default.create({ user, title, message, type: type || 'info', link: link || '' });
    return api_response_1.default.created(res, n, 'Notification created');
};
exports.create = create;
//# sourceMappingURL=notification.controller.js.map