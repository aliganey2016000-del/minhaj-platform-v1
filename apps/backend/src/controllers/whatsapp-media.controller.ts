import { Request, Response } from 'express';
import axios from 'axios';
import mongoose from 'mongoose';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import WhatsAppConversation from '../models/whatsapp-conversation.model';
import WhatsAppMessage from '../models/whatsapp-message.model';

function orgId(req: Request) {
  const value = String((req.user as any)?.organizationId || '').trim();
  if (!value || !mongoose.isValidObjectId(value)) throw new BadRequestError('A valid organization is required');
  return value;
}

function normalizePhone(value: string) { return value.replace(/\D/g, ''); }

export const sendMedia = async (req: Request, res: Response): Promise<Response> => {
  const organizationId = orgId(req);
  const { conversationId, to, mediaType, url, caption, fileName } = req.body || {};
  const allowed = ['image', 'video', 'audio', 'document'];
  if (!allowed.includes(String(mediaType))) throw new BadRequestError('mediaType must be image, video, audio, or document');
  if (!url || typeof url !== 'string' || !/^https:\/\//i.test(url)) throw new BadRequestError('A public HTTPS media URL is required');

  let conversation: any = null;
  let recipient = normalizePhone(String(to || ''));
  if (conversationId) {
    conversation = await WhatsAppConversation.findOne({ _id: conversationId, organization: organizationId }).lean();
    if (!conversation) throw new NotFoundError('WhatsApp conversation');
    recipient = conversation.phone;
  }
  if (!recipient) throw new BadRequestError('conversationId or recipient phone is required');

  const baseUrl = process.env.WHATSAPP_BAILEYS_SERVICE_URL?.trim()?.replace(/\/$/, '');
  const token = process.env.WHATSAPP_BAILEYS_SERVICE_TOKEN?.trim();
  if (process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() !== 'baileys' || !baseUrl || !token) throw new BadRequestError('Baileys WhatsApp provider is not configured');

  const message = await WhatsAppMessage.create({
    organization: organizationId,
    school: conversation?.school,
    conversation: conversation?._id,
    recipient,
    parent: conversation?.parent,
    direction: 'outbound',
    kind: 'media',
    body: caption || undefined,
    status: 'queued',
    createdBy: req.user?.userId,
    raw: { mediaType, url, fileName },
  });

  try {
    const response = await axios.post(`${baseUrl}/v1/accounts/${encodeURIComponent(organizationId)}/send-media`, { to: recipient, mediaType, url, caption, fileName }, { headers: { 'x-whatsapp-service-token': token }, timeout: 30000 });
    message.status = 'sent';
    message.providerMessageId = response.data?.data?.providerMessageId;
    await message.save();
    await WhatsAppConversation.updateOne({ _id: conversation?._id, organization: organizationId }, { $set: { lastMessageAt: new Date(), lastMessagePreview: caption || `[${mediaType}]`, lastMessageDirection: 'outbound' } });
    return ApiResponse.created(res, message, 'WhatsApp media sent successfully');
  } catch (error: any) {
    message.status = 'failed';
    message.error = error?.response?.data?.message || error?.message || 'WhatsApp media send failed';
    await message.save();
    throw new BadRequestError(message.error);
  }
};
