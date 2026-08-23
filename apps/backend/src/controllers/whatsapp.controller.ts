import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Parent from '../models/parent.model';
import WhatsAppMessage from '../models/whatsapp-message.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg } from '../utils/tenant-scope';
import { isWhatsAppConfigured, sendWhatsAppMessage, WhatsAppTemplateComponent } from '../utils/whatsapp';

function componentsFromBody(value: unknown): WhatsAppTemplateComponent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is WhatsAppTemplateComponent => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Record<string, unknown>;
    return ['body', 'header', 'button'].includes(String(candidate.type));
  });
}

export const status = async (_req: Request, res: Response): Promise<Response> => {
  const configured = isWhatsAppConfigured();
  const attendanceAlertsEnabled = process.env.WHATSAPP_ATTENDANCE_ALERTS_ENABLED !== 'false';
  ApiResponse.success(res, {
    configured,
    provider: 'Meta WhatsApp Cloud API',
    automation: {
      attendanceAlertsEnabled: configured && attendanceAlertsEnabled,
      attendanceTemplate: process.env.WHATSAPP_ATTENDANCE_TEMPLATE?.trim() || null,
      languageCode: process.env.WHATSAPP_ATTENDANCE_TEMPLATE_LANGUAGE?.trim() || 'en_US',
    },
  });
};

export const send = async (req: Request, res: Response): Promise<Response> => {
  const { parentId, to, text, templateName, languageCode, components, school } = req.body || {};
  if (!parentId && !to) throw new BadRequestError('parentId or to is required');
  if (!text && !templateName) throw new BadRequestError('text or templateName is required');
  if (text && templateName) throw new BadRequestError('Use either text or templateName, not both');
  let recipient = String(to || '').trim();
  let parent: any = null;
  if (parentId) {
    parent = await Parent.findById(parentId).populate('user', 'phone').lean();
    if (!parent) throw new NotFoundError('Parent');
    assertOwnsOrg(req, parent, 'school');
    recipient = String(parent.phone || parent.user?.phone || '').trim();
  }
  if (!recipient) throw new BadRequestError('The selected parent does not have a phone number');
  const scopedSchool = school ? applyOrgFilter(req, { school }, 'school').school : (parent?.school || undefined);
  if (scopedSchool && !mongoose.isValidObjectId(scopedSchool as string)) throw new BadRequestError('Invalid school');
  const message = await WhatsAppMessage.create({ school: parent?.school || (scopedSchool as string | undefined), recipient, parent: parent?._id, kind: templateName ? 'template' : 'text', templateName: templateName || undefined, languageCode: languageCode || undefined, body: text || undefined, status: 'queued', createdBy: req.user?.userId });
  try {
    const result = await sendWhatsAppMessage({ to: recipient, text, templateName, languageCode, components: componentsFromBody(components) });
    message.status = 'sent'; message.providerMessageId = result.providerMessageId; await message.save();
    return ApiResponse.created(res, message, 'WhatsApp message sent successfully');
  } catch (error: any) {
    message.status = 'failed'; message.error = error?.response?.data?.error?.message || error?.message || 'WhatsApp send failed'; await message.save();
    throw new BadRequestError(message.error);
  }
};

export const history = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const filter: any = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.parentId) filter.parent = req.query.parentId;
  const scoped = applyOrgFilter(req, filter, 'school');
  const [items, total] = await Promise.all([
    WhatsAppMessage.find(scoped).populate('parent', 'parentId phone relationship').populate('createdBy', 'email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    WhatsAppMessage.countDocuments(scoped),
  ]);
  return ApiResponse.paginated(res, items, { page, limit, total });
};
