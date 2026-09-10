import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ApiResponse from '../utils/api-response';
import WhatsAppConversation from '../models/whatsapp-conversation.model';
import WhatsAppMessage from '../models/whatsapp-message.model';
import { WhatsAppNotificationJob } from '../models/whatsapp-notification-job.model';
import { BadRequestError } from '../utils/api-error';

function organizationId(req: Request) {
  const value = String((req.user as any)?.organizationId || '').trim();
  if (!value || !mongoose.isValidObjectId(value)) throw new BadRequestError('A valid organization is required');
  return value;
}

export const summary = async (req: Request, res: Response): Promise<Response> => {
  const org = organizationId(req);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [messages, conversations, queued, failed, byStatus, byDirection, byKind, languages] = await Promise.all([
    WhatsAppMessage.countDocuments({ organization: org, createdAt: { $gte: since } }),
    WhatsAppConversation.countDocuments({ organization: org, updatedAt: { $gte: since } }),
    WhatsAppNotificationJob.countDocuments({ organization: org, status: { $in: ['queued', 'processing'] } }),
    WhatsAppNotificationJob.countDocuments({ organization: org, status: 'failed', updatedAt: { $gte: since } }),
    WhatsAppMessage.aggregate([{ $match: { organization: new mongoose.Types.ObjectId(org), createdAt: { $gte: since } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    WhatsAppMessage.aggregate([{ $match: { organization: new mongoose.Types.ObjectId(org), createdAt: { $gte: since } } }, { $group: { _id: '$direction', count: { $sum: 1 } } }]),
    WhatsAppMessage.aggregate([{ $match: { organization: new mongoose.Types.ObjectId(org), createdAt: { $gte: since } } }, { $group: { _id: '$kind', count: { $sum: 1 } } }]),
    WhatsAppConversation.aggregate([{ $match: { organization: new mongoose.Types.ObjectId(org), updatedAt: { $gte: since } } }, { $group: { _id: '$botLanguage', count: { $sum: 1 } } }]),
  ]);

  const toMap = (rows: Array<{ _id: string; count: number }>) => Object.fromEntries(rows.map((row) => [row._id || 'unknown', row.count]));
  return ApiResponse.success(res, {
    periodDays: 30,
    messages,
    conversations,
    queue: { queued, failed },
    messagesByStatus: toMap(byStatus),
    messagesByDirection: toMap(byDirection),
    messagesByKind: toMap(byKind),
    conversationsByLanguage: toMap(languages),
  });
};
