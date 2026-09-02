import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Parent from '../models/parent.model';
import TelegramMessage from '../models/telegram-message.model';
import ApiResponse from '../utils/api-response';
import { BadRequestError, NotFoundError } from '../utils/api-error';
import { applyOrgFilter, assertOwnsOrg, getOwnParentRecord } from '../utils/tenant-scope';
import { isTelegramConfigured, sendTelegramMessage, getTelegramBotUsername } from '../utils/telegram';

// ---------------------------------------------------------------------------
// GET /telegram/status — admin
// ---------------------------------------------------------------------------

export const status = async (_req: Request, res: Response): Promise<Response> => {
  const configured = isTelegramConfigured();
  const attendanceAlertsEnabled = process.env.TELEGRAM_ATTENDANCE_ALERTS_ENABLED?.trim().toLowerCase() === 'true';
  return ApiResponse.success(res, {
    configured,
    provider: 'Telegram Bot API',
    botUsername: getTelegramBotUsername(),
    automation: { attendanceAlertsEnabled: configured && attendanceAlertsEnabled },
  });
};

// ---------------------------------------------------------------------------
// POST /telegram/send — admin. Free-form text only — Telegram bots don't
// need Meta-style approved templates, so there's no template/text split
// like whatsapp.controller.ts.
// ---------------------------------------------------------------------------

export const send = async (req: Request, res: Response): Promise<Response> => {
  const { parentId, chatId, text, school } = req.body || {};
  if (!parentId && !chatId) throw new BadRequestError('parentId or chatId is required');
  if (!text || !String(text).trim()) throw new BadRequestError('text is required');

  let recipient = String(chatId || '').trim();
  let parent: any = null;
  if (parentId) {
    parent = await Parent.findById(parentId).lean();
    if (!parent) throw new NotFoundError('Parent');
    assertOwnsOrg(req, parent, 'school');
    recipient = String(parent.telegramChatId || '').trim();
  }
  if (!recipient) throw new BadRequestError('The selected parent has not linked Telegram yet');

  const scopedSchool = school ? applyOrgFilter(req, { school }, 'school').school : (parent?.school || undefined);
  if (scopedSchool && !mongoose.isValidObjectId(scopedSchool as string)) throw new BadRequestError('Invalid school');

  const body = String(text).trim();
  const message = await TelegramMessage.create({
    school: parent?.school || (scopedSchool as string | undefined),
    chatId: recipient,
    parent: parent?._id,
    body,
    status: 'queued',
    createdBy: req.user?.userId,
  });
  try {
    const result = await sendTelegramMessage(recipient, body);
    message.status = 'sent'; message.providerMessageId = result.providerMessageId; await message.save();
    return ApiResponse.created(res, message, 'Telegram message sent successfully');
  } catch (error: any) {
    message.status = 'failed'; message.error = error?.response?.data?.description || error?.message || 'Telegram send failed'; await message.save();
    throw new BadRequestError(message.error);
  }
};

// ---------------------------------------------------------------------------
// GET /telegram/history — admin
// ---------------------------------------------------------------------------

export const history = async (req: Request, res: Response): Promise<Response> => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const filter: any = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.parentId) filter.parent = req.query.parentId;
  const scoped = applyOrgFilter(req, filter, 'school');
  const [items, total] = await Promise.all([
    TelegramMessage.find(scoped).populate('parent', 'parentId phone relationship').populate('createdBy', 'email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    TelegramMessage.countDocuments(scoped),
  ]);
  return ApiResponse.paginated(res, items, { page, limit, total });
};

// ---------------------------------------------------------------------------
// GET /telegram/link/status — parent self-service, so the dashboard can show
// linked vs not-linked without needing admin scope.
// ---------------------------------------------------------------------------

export const linkStatus = async (req: Request, res: Response): Promise<Response> => {
  const parent = await getOwnParentRecord(req);
  if (!parent) throw new NotFoundError('Parent profile');
  return ApiResponse.success(res, { linked: Boolean(parent.telegramChatId), configured: isTelegramConfigured() && Boolean(getTelegramBotUsername()) });
};

// ---------------------------------------------------------------------------
// POST /telegram/link/generate — parent self-service. Returns a deep link
// (https://t.me/<bot>?start=<token>) the parent opens in Telegram; hitting
// Start there sends an update to our webhook, which links their chat id.
// ---------------------------------------------------------------------------

export const generateLinkToken = async (req: Request, res: Response): Promise<Response> => {
  const parent = await getOwnParentRecord(req);
  if (!parent) throw new NotFoundError('Parent profile');
  const botUsername = getTelegramBotUsername();
  if (!botUsername) throw new BadRequestError('Telegram is not configured yet — ask your school admin.');

  const token = crypto.randomBytes(16).toString('hex');
  parent.telegramLinkToken = token;
  await parent.save();

  return ApiResponse.success(res, {
    deepLink: `https://t.me/${botUsername}?start=${token}`,
    alreadyLinked: Boolean(parent.telegramChatId),
  });
};

// ---------------------------------------------------------------------------
// POST /telegram/unlink — parent self-service
// ---------------------------------------------------------------------------

export const unlink = async (req: Request, res: Response): Promise<Response> => {
  const parent = await getOwnParentRecord(req);
  if (!parent) throw new NotFoundError('Parent profile');
  parent.telegramChatId = undefined;
  parent.telegramLinkToken = undefined;
  await parent.save();
  return ApiResponse.success(res, null, 'Telegram unlinked');
};

// ---------------------------------------------------------------------------
// POST /telegram/webhook — PUBLIC. Telegram's servers call this directly, so
// it can't go through our normal JWT auth — it's protected instead by a
// shared secret Telegram echoes back in X-Telegram-Bot-Api-Secret-Token,
// set once when the webhook is registered with Telegram (see setup notes).
// Always acks 200 quickly (even on a processing error) so Telegram doesn't
// enter a retry storm over something on our end.
// ---------------------------------------------------------------------------

export const webhook = async (req: Request, res: Response): Promise<Response> => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (expectedSecret && req.headers['x-telegram-bot-api-secret-token'] !== expectedSecret) {
    return res.status(401).json({ ok: false });
  }

  try {
    const message = req.body?.message;
    const text = String(message?.text || '').trim();
    const chatId = message?.chat?.id;

    if (chatId && text.startsWith('/start')) {
      const token = text.slice('/start'.length).trim();
      if (token) {
        const parent = await Parent.findOneAndUpdate(
          { telegramLinkToken: token },
          { telegramChatId: String(chatId), $unset: { telegramLinkToken: '' } },
          { new: true }
        );
        if (isTelegramConfigured()) {
          const reply = parent
            ? '✅ Your Telegram is now linked to the Sahal Education Platform. You will receive school notifications here.'
            : 'This link has expired or was already used. Please generate a new one from your parent dashboard.';
          await sendTelegramMessage(String(chatId), reply).catch(() => {});
        }
      } else if (isTelegramConfigured()) {
        await sendTelegramMessage(String(chatId), 'Welcome! Open your parent dashboard on the Sahal Education Platform and tap "Link Telegram" to connect this chat.').catch(() => {});
      }
    }
  } catch (error) {
    console.error('[Telegram webhook] processing failed:', error);
  }

  return res.status(200).json({ ok: true });
};
