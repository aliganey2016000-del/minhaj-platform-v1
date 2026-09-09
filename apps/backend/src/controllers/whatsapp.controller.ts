import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Parent from '../models/parent.model';
import WhatsAppMessage from '../models/whatsapp-message.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg } from '../utils/tenant-scope';
import {
  connectBaileysAccount,
  disconnectBaileysAccount,
  getBaileysAccountStatus,
  getBaileysQr,
  getWhatsAppProvider,
  isWhatsAppConfigured,
  sendWhatsAppMessage,
  WhatsAppTemplateComponent,
} from '../utils/whatsapp';

function componentsFromBody(value: unknown): WhatsAppTemplateComponent[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is WhatsAppTemplateComponent => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as Record<string, unknown>;
    return ['body', 'header', 'button'].includes(String(candidate.type));
  });
}

function requestOrganizationId(req: Request) {
  return String((req.user as any)?.organizationId || '').trim();
}

export const status = async (req: Request, res: Response): Promise<Response> => {
  const provider = getWhatsAppProvider();
  const configured = isWhatsAppConfigured();
  const attendanceAlertsEnabled = process.env.WHATSAPP_ATTENDANCE_ALERTS_ENABLED !== 'false';
  let account: any = null;
  if (provider === 'Baileys' && configured && requestOrganizationId(req)) {
    try { account = await getBaileysAccountStatus(requestOrganizationId(req)); } catch { account = { status: 'service_unavailable' }; }
  }
  return ApiResponse.success(res, {
    configured,
    provider,
    account,
    automation: {
      attendanceAlertsEnabled: configured && attendanceAlertsEnabled,
      attendanceTemplate: process.env.WHATSAPP_ATTENDANCE_TEMPLATE?.trim() || null,
      languageCode: process.env.WHATSAPP_ATTENDANCE_TEMPLATE_LANGUAGE?.trim() || 'en_US',
    },
  });
};

export const connect = async (req: Request, res: Response): Promise<Response> => {
  if (getWhatsAppProvider() !== 'Baileys') throw new BadRequestError('WhatsApp provider is not configured as Baileys');
  const organizationId = requestOrganizationId(req);
  if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required');
  const phoneNumber = req.body?.phoneNumber ? String(req.body.phoneNumber) : undefined;
  const account = await connectBaileysAccount(organizationId, phoneNumber);
  return ApiResponse.success(res, account, 'WhatsApp connection started');
};

export const qr = async (req: Request, res: Response): Promise<Response> => {
  if (getWhatsAppProvider() !== 'Baileys') throw new BadRequestError('WhatsApp provider is not configured as Baileys');
  const organizationId = requestOrganizationId(req);
  if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required');
  return ApiResponse.success(res, await getBaileysQr(organizationId));
};

export const disconnect = async (req: Request, res: Response): Promise<Response> => {
  if (getWhatsAppProvider() !== 'Baileys') throw new BadRequestError('WhatsApp provider is not configured as Baileys');
  const organizationId = requestOrganizationId(req);
  if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required');
  return ApiResponse.success(res, await disconnectBaileysAccount(organizationId), 'WhatsApp disconnected');
};

export const webhook = async (req: Request, res: Response): Promise<Response> => {
  const expected = process.env.WHATSAPP_BAILEYS_WEBHOOK_TOKEN?.trim();
  if (expected && req.header('x-whatsapp-webhook-token') !== expected) throw new UnauthorizedError('Invalid WhatsApp webhook token');
  const payload = req.body || {};
  if (payload.event !== 'message.received' || !payload.accountId || !payload.messageId || !payload.from) {
    return ApiResponse.success(res, { ignored: true });
  }
  if (await WhatsAppMessage.exists({ providerMessageId: payload.messageId })) return ApiResponse.success(res, { duplicate: true });
  const organizationId = String(payload.accountId);
  const providerTimestamp = payload.timestamp ? new Date(Number(payload.timestamp)) : new Date();
  await WhatsAppMessage.create({
    organization: mongoose.isValidObjectId(organizationId) ? organizationId : undefined,
    recipient: String(payload.accountId),
    sender: String(payload.from),
    direction: 'inbound',
    kind: 'text',
    body: typeof payload.text === 'string' ? payload.text : undefined,
    providerMessageId: String(payload.messageId),
    providerTimestamp,
    pushName: payload.pushName ? String(payload.pushName) : undefined,
    raw: payload.raw,
    status: 'received',
  });
  return ApiResponse.created(res, { received: true });
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
  const message = await WhatsAppMessage.create({
    school: parent?.school || (scopedSchool as string | undefined),
    organization: requestOrganizationId(req) || undefined,
    recipient,
    parent: parent?._id,
    direction: 'outbound',
    kind: templateName ? 'template' : 'text',
    templateName: templateName || undefined,
    languageCode: languageCode || undefined,
    body: text || undefined,
    status: 'queued',
    createdBy: req.user?.userId,
  });
  try {
    const result = await sendWhatsAppMessage({ to: recipient, text, templateName, languageCode, components: componentsFromBody(components), organizationId: requestOrganizationId(req) });
    message.status = 'sent'; message.providerMessageId = result.providerMessageId; await message.save();
    return ApiResponse.created(res, message, 'WhatsApp message sent successfully');
  } catch (error: any) {
    message.status = 'failed'; message.error = error?.response?.data?.message || error?.response?.data?.error?.message || error?.message || 'WhatsApp send failed'; await message.save();
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
