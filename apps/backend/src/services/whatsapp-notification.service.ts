import mongoose from 'mongoose';
import { WhatsAppNotificationJob } from '../models/whatsapp-notification-job.model';
import { WhatsAppNotificationPreference, WhatsAppNotificationCategory } from '../models/whatsapp-notification-preference.model';
import { Parent } from '../models/parent.model';
import { sendWhatsAppMessage } from '../utils/whatsapp';

export interface QueueWhatsAppNotificationInput {
  organizationId: string | mongoose.Types.ObjectId;
  parentId?: string | mongoose.Types.ObjectId;
  recipientPhone?: string;
  category: WhatsAppNotificationCategory;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  maxAttempts?: number;
}

function asObjectId(value: string | mongoose.Types.ObjectId) {
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value);
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

export async function queueWhatsAppNotification(input: QueueWhatsAppNotificationInput) {
  const organizationId = asObjectId(input.organizationId);
  let phone = input.recipientPhone;
  if (input.parentId && !phone) {
    const parent = await Parent.findOne({ _id: asObjectId(input.parentId), school: organizationId }).lean();
    phone = parent?.phone || parent?.whatsappNumber || undefined;
  }
  if (!phone) return { queued: false, reason: 'missing_recipient' as const };

  if (input.parentId) {
    const preference = await WhatsAppNotificationPreference.findOne({
      organizationId,
      parentId: asObjectId(input.parentId),
      category: input.category,
    }).lean();
    if (preference?.enabled === false) return { queued: false, reason: 'disabled_by_parent' as const };
  }

  const job = await WhatsAppNotificationJob.findOneAndUpdate(
    { idempotencyKey: input.idempotencyKey },
    {
      $setOnInsert: {
        organizationId,
        parentId: input.parentId ? asObjectId(input.parentId) : undefined,
        recipientPhone: normalizePhone(phone),
        category: input.category,
        eventType: input.eventType,
        payload: input.payload,
        maxAttempts: input.maxAttempts ?? 5,
        status: 'queued',
        nextAttemptAt: new Date(),
        idempotencyKey: input.idempotencyKey,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return { queued: true, jobId: job._id.toString(), status: job.status };
}

function renderText(payload: Record<string, unknown>) {
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text.trim();
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
  return Object.entries(payload).map(([key, value]) => `${key}: ${String(value ?? '')}`).join('\n');
}

export async function processWhatsAppNotificationJob(jobId: string) {
  const job = await WhatsAppNotificationJob.findOneAndUpdate(
    { _id: jobId, status: 'queued', nextAttemptAt: { $lte: new Date() } },
    { $set: { status: 'processing' }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!job) return null;

  try {
    const result = await sendWhatsAppMessage({ to: job.recipientPhone, text: renderText(job.payload) });
    await WhatsAppNotificationJob.updateOne({ _id: job._id }, {
      $set: { status: 'sent', providerMessageId: result.providerMessageId, sentAt: new Date(), lastError: null },
    });
    return { status: 'sent' as const, providerMessageId: result.providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exhausted = job.attempts >= job.maxAttempts;
    const delayMs = Math.min(30 * 60 * 1000, 2 ** Math.max(0, job.attempts - 1) * 5000);
    await WhatsAppNotificationJob.updateOne({ _id: job._id }, {
      $set: {
        status: exhausted ? 'failed' : 'queued',
        nextAttemptAt: new Date(Date.now() + delayMs),
        lastError: message,
      },
    });
    return { status: exhausted ? ('failed' as const) : ('queued' as const), error: message };
  }
}

export async function processDueWhatsAppNotifications(limit = 25) {
  const jobs = await WhatsAppNotificationJob.find({ status: 'queued', nextAttemptAt: { $lte: new Date() } })
    .sort({ nextAttemptAt: 1 })
    .limit(limit)
    .select('_id')
    .lean();
  const results = [];
  for (const job of jobs) results.push(await processWhatsAppNotificationJob(job._id.toString()));
  return results;
}
