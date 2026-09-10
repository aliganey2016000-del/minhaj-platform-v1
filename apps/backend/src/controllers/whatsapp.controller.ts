import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Parent from '../models/parent.model';
import WhatsAppConversation from '../models/whatsapp-conversation.model';
import WhatsAppMessage from '../models/whatsapp-message.model';
import WhatsAppTemplate from '../models/whatsapp-template.model';
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
function requestOrganizationId(req: Request) { return String((req.user as any)?.organizationId || '').trim(); }
function normalizePhone(value: string) { return value.replace(/\D/g, ''); }
function providerTimestamp(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date();
  // Baileys messageTimestamp is Unix seconds; tolerate millisecond payloads too.
  return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
}
function templateParameters(components?: WhatsAppTemplateComponent[]) {
  const body = components?.find((component: any) => component.type === 'body') as any;
  return Array.isArray(body?.parameters) ? body.parameters.map((parameter: any) => String(parameter?.text ?? '').trim()) : [];
}
function renderLocalTemplate(body: string, parameters: string[]) {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index) => parameters[Number(index) - 1] ?? '');
}

async function upsertConversation(input: { organizationId: string; phone: string; direction: 'inbound' | 'outbound'; preview?: string; parentId?: mongoose.Types.ObjectId; schoolId?: mongoose.Types.ObjectId; contactName?: string; unreadIncrement?: number }) {
  const phone = normalizePhone(input.phone);
  if (!phone || !mongoose.isValidObjectId(input.organizationId)) return null;
  return WhatsAppConversation.findOneAndUpdate(
    { organization: input.organizationId, phone },
    {
      $set: { ...(input.parentId ? { parent: input.parentId } : {}), ...(input.schoolId ? { school: input.schoolId } : {}), ...(input.contactName ? { contactName: input.contactName } : {}), lastMessageAt: new Date(), lastMessagePreview: input.preview?.slice(0, 500), lastMessageDirection: input.direction },
      ...(input.unreadIncrement ? { $inc: { unreadCount: input.unreadIncrement } } : {}),
      $setOnInsert: { status: 'open', unreadCount: 0 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export const status = async (req: Request, res: Response): Promise<Response> => {
  const provider = getWhatsAppProvider();
  const configured = isWhatsAppConfigured();
  const attendanceAlertsEnabled = process.env.WHATSAPP_ATTENDANCE_ALERTS_ENABLED !== 'false';
  let account: any = null;
  if (provider === 'Baileys' && configured && requestOrganizationId(req)) { try { account = await getBaileysAccountStatus(requestOrganizationId(req)); } catch { account = { status: 'service_unavailable' }; } }
  return ApiResponse.success(res, { configured, provider, account, automation: { attendanceAlertsEnabled: configured && attendanceAlertsEnabled, attendanceTemplate: process.env.WHATSAPP_ATTENDANCE_TEMPLATE?.trim() || null, languageCode: process.env.WHATSAPP_ATTENDANCE_TEMPLATE_LANGUAGE?.trim() || 'en_US' } });
};

export const connect = async (req: Request, res: Response): Promise<Response> => { if (getWhatsAppProvider() !== 'Baileys') throw new BadRequestError('WhatsApp provider is not configured as Baileys'); const organizationId = requestOrganizationId(req); if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required'); return ApiResponse.success(res, await connectBaileysAccount(organizationId, req.body?.phoneNumber ? String(req.body.phoneNumber) : undefined), 'WhatsApp connection started'); };
export const qr = async (req: Request, res: Response): Promise<Response> => { if (getWhatsAppProvider() !== 'Baileys') throw new BadRequestError('WhatsApp provider is not configured as Baileys'); const organizationId = requestOrganizationId(req); if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required'); return ApiResponse.success(res, await getBaileysQr(organizationId)); };
export const disconnect = async (req: Request, res: Response): Promise<Response> => { if (getWhatsAppProvider() !== 'Baileys') throw new BadRequestError('WhatsApp provider is not configured as Baileys'); const organizationId = requestOrganizationId(req); if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required'); return ApiResponse.success(res, await disconnectBaileysAccount(organizationId), 'WhatsApp disconnected'); };

export const webhook = async (req: Request, res: Response): Promise<Response> => {
  const expected = process.env.WHATSAPP_BAILEYS_WEBHOOK_TOKEN?.trim();
  if (!expected || req.header('x-whatsapp-webhook-token') !== expected) throw new UnauthorizedError('Invalid WhatsApp webhook token');
  const payload = req.body || {};
  const organizationId = String(payload.accountId || '').trim();
  if (!organizationId || !mongoose.isValidObjectId(organizationId)) return ApiResponse.success(res, { ignored: true });
  if (payload.event === 'message.status' && payload.messageId) {
    const allowed = ['sent', 'delivered', 'read', 'failed'];
    const status = allowed.includes(String(payload.status)) ? String(payload.status) : null;
    if (!status) return ApiResponse.success(res, { ignored: true });
    const message = await WhatsAppMessage.findOneAndUpdate({ organization: organizationId, providerMessageId: String(payload.messageId) }, { $set: { status } }, { new: true }).lean();
    return ApiResponse.success(res, { updated: Boolean(message), messageId: payload.messageId, status });
  }
  if (payload.event !== 'message.received' || !payload.messageId || !payload.from) return ApiResponse.success(res, { ignored: true });
  if (await WhatsAppMessage.exists({ organization: organizationId, providerMessageId: payload.messageId })) return ApiResponse.success(res, { duplicate: true });
  const from = normalizePhone(String(payload.from));
  if (!from) return ApiResponse.success(res, { ignored: true });
  const parent = await Parent.findOne({ school: organizationId, $or: [{ phone: from }, { phone: `+${from}` }] }).lean();
  const conversation = await upsertConversation({ organizationId, phone: from, direction: 'inbound', preview: typeof payload.text === 'string' ? payload.text : '[WhatsApp message]', parentId: parent?._id, schoolId: parent?.school, contactName: payload.pushName ? String(payload.pushName) : undefined, unreadIncrement: 1 });
  await WhatsAppMessage.create({ organization: organizationId, conversation: conversation?._id, recipient: organizationId, sender: from, parent: parent?._id, direction: 'inbound', kind: payload.kind === 'media' ? 'media' : 'text', body: typeof payload.text === 'string' ? payload.text : undefined, providerMessageId: String(payload.messageId), providerTimestamp: providerTimestamp(payload.timestamp), pushName: payload.pushName ? String(payload.pushName) : undefined, raw: payload.raw, status: 'received' });
  return ApiResponse.created(res, { received: true, conversationId: conversation?._id });
};

export const send = async (req: Request, res: Response): Promise<Response> => {
  const { parentId, to, text, templateName, languageCode, components, school, conversationId } = req.body || {};
  if (!parentId && !to && !conversationId) throw new BadRequestError('parentId, to, or conversationId is required');
  if (!text && !templateName) throw new BadRequestError('text or templateName is required');
  if (text && templateName) throw new BadRequestError('Use either text or templateName, not both');
  const organizationId = requestOrganizationId(req);
  if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required');
  let recipient = String(to || '').trim(); let parent: any = null; let conversation: any = null;
  if (conversationId) { conversation = await WhatsAppConversation.findOne({ _id: conversationId, organization: organizationId }); if (!conversation) throw new NotFoundError('WhatsApp conversation'); recipient = conversation.phone; if (conversation.parent) parent = await Parent.findById(conversation.parent).lean(); }
  if (parentId) { parent = await Parent.findById(parentId).populate('user', 'phone').lean(); if (!parent) throw new NotFoundError('Parent'); assertOwnsOrg(req, parent, 'school'); recipient = String(parent.phone || parent.user?.phone || '').trim(); }
  if (!recipient) throw new BadRequestError('The selected parent does not have a phone number');
  const scopedSchool = school ? applyOrgFilter(req, { school }, 'school').school : (parent?.school || conversation?.school || undefined);
  if (scopedSchool && !mongoose.isValidObjectId(scopedSchool as string)) throw new BadRequestError('Invalid school');

  const templateComponents = componentsFromBody(components);
  let providerText = text ? String(text).trim() : undefined;
  let providerTemplateName = templateName ? String(templateName).trim() : undefined;
  if (getWhatsAppProvider() === 'Baileys' && providerTemplateName) {
    const template = await WhatsAppTemplate.findOne({ organization: organizationId, name: providerTemplateName, active: true }).lean();
    if (!template) throw new NotFoundError('Active WhatsApp template');
    providerText = renderLocalTemplate(template.body, templateParameters(templateComponents));
    if (!providerText.trim()) throw new BadRequestError('The WhatsApp template rendered an empty message');
    providerTemplateName = undefined;
  }

  const preview = providerText || templateName;
  if (!conversation) conversation = await upsertConversation({ organizationId, phone: recipient, direction: 'outbound', preview, parentId: parent?._id, schoolId: scopedSchool as mongoose.Types.ObjectId | undefined, contactName: parent?.name || undefined });
  const message = await WhatsAppMessage.create({ school: parent?.school || (scopedSchool as string | undefined), organization: organizationId, conversation: conversation?._id, recipient: normalizePhone(recipient), parent: parent?._id, direction: 'outbound', kind: templateName ? 'template' : 'text', templateName: templateName || undefined, languageCode: languageCode || undefined, body: providerText || undefined, status: 'queued', createdBy: req.user?.userId });
  try {
    const result = await sendWhatsAppMessage({ to: recipient, text: providerText, templateName: providerTemplateName, languageCode, components: templateComponents, organizationId });
    message.status = 'sent'; message.providerMessageId = result.providerMessageId; await message.save();
    await upsertConversation({ organizationId, phone: recipient, direction: 'outbound', preview, parentId: parent?._id, schoolId: scopedSchool as mongoose.Types.ObjectId | undefined });
    return ApiResponse.created(res, message, 'WhatsApp message sent successfully');
  } catch (error: any) { message.status = 'failed'; message.error = error?.response?.data?.message || error?.response?.data?.error?.message || error?.message || 'WhatsApp send failed'; await message.save(); throw new BadRequestError(message.error); }
};

export const conversations = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = requestOrganizationId(req); if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required');
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30)); const status = req.query.status ? String(req.query.status) : undefined; const search = String(req.query.search || '').trim();
  const filter: any = { organization: organizationId }; if (status) filter.status = status;
  if (search) { const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ phone: { $regex: escaped, $options: 'i' } }, { contactName: { $regex: escaped, $options: 'i' } }]; }
  const [items, total] = await Promise.all([WhatsAppConversation.find(filter).populate('parent', 'parentId phone relationship').populate('assignedTo', 'email').sort({ lastMessageAt: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), WhatsAppConversation.countDocuments(filter)]);
  return ApiResponse.paginated(res, items, { page, limit, total });
};

export const conversationMessages = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = requestOrganizationId(req); if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required');
  const conversation = await WhatsAppConversation.findOne({ _id: req.params.conversationId, organization: organizationId }).lean(); if (!conversation) throw new NotFoundError('WhatsApp conversation');
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50)); const filter = { organization: organizationId, conversation: conversation._id };
  const [items, total] = await Promise.all([WhatsAppMessage.find(filter).populate('createdBy', 'email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), WhatsAppMessage.countDocuments(filter)]);
  return ApiResponse.paginated(res, items.reverse(), { page, limit, total });
};

export const markConversationRead = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = requestOrganizationId(req); if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required');
  const conversation = await WhatsAppConversation.findOneAndUpdate({ _id: req.params.conversationId, organization: organizationId }, { $set: { unreadCount: 0 } }, { new: true }).lean(); if (!conversation) throw new NotFoundError('WhatsApp conversation'); return ApiResponse.success(res, conversation);
};

export const updateConversation = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = requestOrganizationId(req); if (!organizationId || !mongoose.isValidObjectId(organizationId)) throw new BadRequestError('A valid organization is required');
  const status = ['open', 'closed', 'archived'].includes(String(req.body?.status)) ? String(req.body.status) : undefined; if (!status) throw new BadRequestError('status must be open, closed, or archived');
  const conversation = await WhatsAppConversation.findOneAndUpdate({ _id: req.params.conversationId, organization: organizationId }, { $set: { status } }, { new: true }).lean(); if (!conversation) throw new NotFoundError('WhatsApp conversation'); return ApiResponse.success(res, conversation);
};

export const history = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25)); const filter: any = {};
  if (req.query.status) filter.status = req.query.status; if (req.query.parentId) filter.parent = req.query.parentId; if (req.query.conversationId) filter.conversation = req.query.conversationId;
  const scoped = applyOrgFilter(req, filter, 'school'); const organizationId = requestOrganizationId(req); if (organizationId && mongoose.isValidObjectId(organizationId)) scoped.organization = organizationId;
  const [items, total] = await Promise.all([WhatsAppMessage.find(scoped).populate('parent', 'parentId phone relationship').populate('createdBy', 'email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), WhatsAppMessage.countDocuments(scoped)]);
  return ApiResponse.paginated(res, items, { page, limit, total });
};
