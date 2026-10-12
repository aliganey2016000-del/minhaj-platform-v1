import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { NotFoundError, UnauthorizedError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';
import { handleIncomingSms } from '../../services/guuldoon-sms-payment.service';

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
  return ApiResponse.success(res, result);
}));

export default router;
