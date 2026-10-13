import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../utils/api-error';
import { authMiddleware } from '../../middleware/auth.middleware';
import PaymentSms from '../../models/payment-sms.model';
import ApiResponse from '../../utils/api-response';
import Subscription from '../../models/global-subscription.model';
import { handleIncomingSms, isIncomingPayment, linkSmsToSubscription, unmatchedReason } from '../../services/guuldoon-sms-payment.service';

const router = Router();

const limiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

function secretMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const pick = (source: Record<string, unknown>, keys: string[]) => keys.map((key) => source[key]).find((value) => typeof value === 'string' && value);

/**
 * Receives payment-confirmation SMS messages forwarded by an SMS-forwarder app on the merchant phone.
 * Disabled until GUULDOON_SMS_WEBHOOK_SECRET is set; the secret goes in the X-Webhook-Secret header.
 */
router.post('/', limiter, asyncHandler(async (req, res) => {
  const expected = process.env.GUULDOON_SMS_WEBHOOK_SECRET;
  if (!expected) throw new NotFoundError('SMS payment webhook');
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  // Preferred: the X-Webhook-Secret header. Some SMS forwarder apps cannot set headers, so ?secret= or a "secret" JSON field also work.
  const provided = req.header('x-webhook-secret') ?? req.query.secret ?? body.secret;
  if (!secretMatches(provided, expected)) throw new UnauthorizedError('Invalid webhook secret');
  const result = await handleIncomingSms({
    from: pick(body, ['from', 'sender', 'address', 'number']),
    body: pick(body, ['body', 'message', 'text', 'content', 'sms']),
    receivedAt: pick(body, ['receivedAt', 'timestamp', 'date']) ?? (typeof body.receivedAt === 'number' ? body.receivedAt : undefined),
  });
  // No message text in the logs: only what happened.
  console.log(`[SMS-WEBHOOK] stored=${result.stored} matched=${result.matched}${'ambiguous' in result && result.ambiguous ? ' ambiguous' : ''}${'duplicate' in result && result.duplicate ? ' duplicate' : ''}`);
  return ApiResponse.success(res, result);
}));

const requireSuper = (req: any) => {
  if (req.user?.role !== 'admin' || req.user.isStaff) throw new ForbiddenError('Only Super Admin can view forwarded payment messages');
};

/**
 * Super Admin: recent forwarded messages, classified as activated ("matched"), incoming money nobody was served for
 * ("unlinked", with the reason) or other/outgoing messages ("other").
 */
router.get('/recent', authMiddleware, asyncHandler(async (req, res) => {
  requireSuper(req);
  const rows = await PaymentSms.find().sort({ createdAt: -1 }).limit(100).select('from body receivedAt amountUsd phones status subscription createdAt').populate({ path: 'subscription', select: 'payerPhone grade user', populate: { path: 'user', select: 'email' } }).lean();
  const pending = await Subscription.find({ status: 'pending' }).select('payerPhoneKey').limit(500).lean();
  const pendingByPhone = new Map<string, number>();
  for (const sub of pending as any[]) if (sub.payerPhoneKey) pendingByPhone.set(sub.payerPhoneKey, (pendingByPhone.get(sub.payerPhoneKey) || 0) + 1);
  const data = rows.map((row: any) => {
    const incoming = isIncomingPayment(row.body);
    const kind = row.status === 'matched' ? 'matched' : incoming ? 'unlinked' : 'other';
    return { ...row, incoming, kind, reason: kind === 'unlinked' ? unmatchedReason(row, pendingByPhone) : undefined };
  });
  return ApiResponse.success(res, data);
}));

/** Super Admin: pending requests an unlinked SMS can be attached to. */
router.get('/pending', authMiddleware, asyncHandler(async (req, res) => {
  requireSuper(req);
  const rows = await Subscription.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(50).select('grade payerPhone createdAt user').populate('user', 'email').lean();
  return ApiResponse.success(res, rows);
}));

/** Super Admin: activate a pending request using an unlinked incoming-money SMS as proof. */
router.post('/:id/link', authMiddleware, asyncHandler(async (req, res) => {
  requireSuper(req);
  const subscriptionId = typeof req.body?.subscriptionId === 'string' ? req.body.subscriptionId : '';
  if (!/^[a-f0-9]{24}$/i.test(req.params.id) || !/^[a-f0-9]{24}$/i.test(subscriptionId)) throw new NotFoundError('Message or request');
  const approved = await linkSmsToSubscription(req.params.id, subscriptionId);
  if (!approved) throw new NotFoundError('Eligible message or pending request');
  return ApiResponse.success(res, { subscriptionId: approved._id, status: approved.status });
}));

export default router;
