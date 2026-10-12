import crypto from 'crypto';
import PaymentSms from '../models/payment-sms.model';
import Subscription from '../models/global-subscription.model';
import { GLOBAL_SUBSCRIPTION_PRICE, subscriptionExpiry } from '../utils/global-subscription';

const MAX_AMOUNT_USD = 1000;
const MIN_REFERENCE_LENGTH = 6;
const RECENT_SMS_DAYS = 14;

export interface ParsedSms { amountUsd: number | null; refTokens: string[]; phones: string[] }

/** Digits of a phone number without a leading country code (252) or trunk zero, so 0615…, 252615… and 615… compare equal. */
export function phoneCore(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('252')) digits = digits.slice(3);
  return digits.replace(/^0+/, '');
}

/** Upper-case alphanumeric form of a payment reference (spaces and dashes removed). */
export function referenceKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Extracts what a confirmation SMS proves: the USD amount (only when marked with $ or USD),
 * the alphanumeric tokens that could be a transaction reference, and the phone numbers in it.
 * Amounts without a currency marker are ignored so shilling payments are never mistaken for dollars.
 */
export function parseSms(body: string): ParsedSms {
  const amounts: number[] = [];
  const amountPattern = /(?:\$|USD)\s*([0-9]+(?:[.,][0-9]{1,2})?)|([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:\$|USD)/gi;
  for (const match of body.matchAll(amountPattern)) {
    const value = Number((match[1] || match[2]).replace(',', '.'));
    if (Number.isFinite(value)) amounts.push(value);
  }
  const refTokens = [...new Set((body.toUpperCase().match(/[A-Z0-9]+/g) || []).filter((token) => token.length >= MIN_REFERENCE_LENGTH && token.length <= 60))];
  const phones = [...new Set((body.match(/\+?\d[\d\s-]{6,}\d/g) || []).map(phoneCore).filter((core) => core.length >= 7 && core.length <= 12))];
  return { amountUsd: amounts.length ? Math.max(...amounts) : null, refTokens, phones };
}

const isDuplicateKey = (error: any): boolean => error?.code === 11000 || /E11000|duplicate key|UNIQUE constraint/i.test(String(error?.message || ''));

const amountSufficient = (amount: number | null | undefined): boolean => typeof amount === 'number' && amount >= GLOBAL_SUBSCRIPTION_PRICE && amount <= MAX_AMOUNT_USD;

/** Approves a pending subscription when a stored SMS proves this exact payment. Returns the approved document or null. */
async function approve(subscription: any, sms: any) {
  const now = new Date();
  try {
    const approved = await Subscription.findOneAndUpdate(
      { _id: subscription._id, status: 'pending' },
      { $set: { status: 'approved', autoVerified: true, startsAt: now, expiresAt: subscriptionExpiry(now), verifiedReference: subscription.paymentReference, reviewedAt: now } },
      { new: true, runValidators: true },
    );
    if (!approved) return null;
    await PaymentSms.updateOne({ _id: sms._id }, { $set: { status: 'matched', subscription: approved._id } });
    return approved;
  } catch (error: any) {
    if (isDuplicateKey(error)) return null; // this payment reference was already verified for another subscription
    throw error;
  }
}

/** True only when the SMS carries the student's reference, the wallet number they paid from, and at least $5. */
function proves(subscription: any, sms: { refTokens: string[]; phones: string[]; amountUsd?: number | null }): boolean {
  const reference = referenceKey(String(subscription.paymentReference || ''));
  const payer = phoneCore(String(subscription.payerPhone || ''));
  return reference.length >= MIN_REFERENCE_LENGTH
    && payer.length >= 7
    && sms.refTokens.includes(reference)
    && sms.phones.includes(payer)
    && amountSufficient(sms.amountUsd);
}

/** Called when a student submits a request: checks recently received SMS messages for the payment. */
export async function verifyFromStoredSms(subscription: any) {
  const reference = referenceKey(String(subscription.paymentReference || ''));
  if (reference.length < MIN_REFERENCE_LENGTH || !subscription.payerPhone) return null;
  const since = new Date(Date.now() - RECENT_SMS_DAYS * 86400000);
  const candidates = await PaymentSms.find({ status: 'unmatched', refTokens: reference, receivedAt: { $gte: since } }).limit(20);
  for (const sms of candidates) {
    if (proves(subscription, sms)) {
      const approved = await approve(subscription, sms);
      if (approved) return approved;
    }
  }
  return null;
}

/** Called for every forwarded SMS: stores it (once) and approves the matching pending request, if any. */
export async function handleIncomingSms(input: { from?: unknown; body?: unknown; receivedAt?: unknown }) {
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, 1000) : '';
  if (!body) return { stored: false, matched: false };
  const from = typeof input.from === 'string' ? input.from.slice(0, 60) : '';
  const received = typeof input.receivedAt === 'string' || typeof input.receivedAt === 'number' ? new Date(input.receivedAt) : new Date();
  const receivedAt = Number.isNaN(received.getTime()) ? new Date() : received;
  const hash = crypto.createHash('sha256').update(`${from}|${body}|${receivedAt.toISOString()}`).digest('hex');
  const parsed = parseSms(body);

  let sms: any;
  try {
    sms = await PaymentSms.create({ hash, from, body, receivedAt, amountUsd: parsed.amountUsd, refTokens: parsed.refTokens, phones: parsed.phones });
  } catch (error: any) {
    if (isDuplicateKey(error)) return { stored: false, matched: false, duplicate: true };
    throw error;
  }
  if (!amountSufficient(parsed.amountUsd) || !parsed.refTokens.length) return { stored: true, matched: false };
  const pending = await Subscription.find({ status: 'pending', paymentReference: { $in: parsed.refTokens } }).limit(20);
  for (const subscription of pending) {
    if (proves(subscription, parsed)) {
      const approved = await approve(subscription, sms);
      if (approved) return { stored: true, matched: true };
    }
  }
  return { stored: true, matched: false };
}
