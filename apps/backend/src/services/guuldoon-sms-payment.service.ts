import crypto from 'crypto';
import PaymentSms from '../models/payment-sms.model';
import Subscription from '../models/global-subscription.model';
import User from '../models/user.model';
import Student from '../models/student.model';
import Profile from '../models/profile.model';
import ClassModel from '../models/class.model';
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
 * Extracts what a confirmation SMS proves: the USD amount paid (the first amount marked with $ or USD),
 * the alphanumeric tokens that could be a transaction reference, and the phone numbers in it.
 * Amounts without a currency marker are ignored so shilling payments are never mistaken for dollars.
 */
/**
 * Only messages telling the merchant that money was RECEIVED can prove a payment. Receipts for money the
 * merchant phone SENT ("uwareejisay"), airtime and other charges name a third party's number and must never match.
 */
export function isIncomingPayment(body: string): boolean {
  const received = /\bka\s+heshay\b|\breceived\b/i.test(body);
  const outgoing = /uwareejisay|u\s*wareejisay|\bu\s*dirtay|\bsent\b|\btransferred\b|deducted|recharge|subscribed|lacag\s+bixin/i.test(body);
  return received && !outgoing;
}

export function parseSms(body: string): ParsedSms {
  const amounts: number[] = [];
  const amountPattern = /(?:\$|USD)\s*([0-9]+(?:[.,][0-9]{1,2})?)|([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:\$|USD)/gi;
  for (const match of body.matchAll(amountPattern)) {
    const value = Number((match[1] || match[2]).replace(',', '.'));
    if (Number.isFinite(value)) amounts.push(value);
  }
  const refTokens = [...new Set((body.toUpperCase().match(/[A-Z0-9]+/g) || []).filter((token) => token.length >= MIN_REFERENCE_LENGTH && token.length <= 60))];
  const phones = [...new Set((body.match(/\+?\d[\d\s-]{6,}\d/g) || []).map(phoneCore).filter((core) => core.length >= 7 && core.length <= 12))];
  // The first marked amount is the payment; later ones are the balance ("haraagagu waa $7.1").
  return { amountUsd: amounts.length && isIncomingPayment(body) ? amounts[0] : null, refTokens, phones };
}

const isDuplicateKey = (error: any): boolean => error?.code === 11000 || /E11000|duplicate key|UNIQUE constraint/i.test(String(error?.message || ''));

const amountSufficient = (amount: number | null | undefined): boolean => typeof amount === 'number' && amount >= GLOBAL_SUBSCRIPTION_PRICE && amount <= MAX_AMOUNT_USD;

/** Approves a pending subscription when a stored SMS proves this exact payment. Returns the approved document or null. */
async function approve(subscription: any, sms: any) {
  const now = new Date();
  try {
    const approved = await Subscription.findOneAndUpdate(
      { _id: subscription._id, status: 'pending' },
      { $set: { status: 'approved', autoVerified: true, startsAt: now, expiresAt: subscriptionExpiry(now), verifiedReference: `SMS-${sms._id}`, reviewedAt: now } },
      { new: true, runValidators: true },
    );
    if (!approved) return null;
    await PaymentSms.updateOne({ _id: sms._id }, { $set: { status: 'matched', subscription: approved._id } });
    return approved;
  } catch (error: any) {
    if (isDuplicateKey(error)) return null; // this SMS already activated another subscription
    throw error;
  }
}

/** The merchant's own wallet number (it appears in confirmation SMS messages and must never identify a payer). */
export function merchantCore(env: NodeJS.ProcessEnv = process.env): string {
  return phoneCore(env.GUULDOON_MERCHANT_NUMBER || '');
}

/** A confirmation SMS only counts for a request made up to this long after the money arrived. */
const SMS_BEFORE_REQUEST_MS = 30 * 60 * 1000;

/**
 * True when the SMS shows a payment of at least $5 from the wallet number the student registered,
 * received no earlier than 30 minutes before the request was made.
 */
function proves(subscription: any, sms: { phones: string[]; amountUsd?: number | null; receivedAt?: Date }): boolean {
  const payer = phoneCore(String(subscription.payerPhone || ''));
  if (payer.length < 7 || payer === merchantCore()) return false;
  const requestedAt = new Date(subscription.createdAt || Date.now()).getTime();
  const receivedAt = new Date(sms.receivedAt || Date.now()).getTime();
  return sms.phones.includes(payer)
    && amountSufficient(sms.amountUsd)
    && receivedAt >= requestedAt - SMS_BEFORE_REQUEST_MS;
}

/** Called when a student registers their wallet number: the payment may already have arrived. */
export async function verifyFromStoredSms(subscription: any) {
  const payer = phoneCore(String(subscription.payerPhone || ''));
  if (payer.length < 7 || payer === merchantCore()) return null;
  const since = new Date(Date.now() - SMS_BEFORE_REQUEST_MS);
  const candidates = await PaymentSms.find({ status: 'unmatched', phones: payer, receivedAt: { $gte: since } }).sort({ receivedAt: 1 }).limit(20);
  for (const sms of candidates) {
    if (proves(subscription, sms)) {
      const approved = await approve(subscription, sms);
      if (approved) return approved;
    }
  }
  return null;
}

/** Called for every forwarded SMS: stores it (once) and activates the one pending request registered for the paying number. */
export async function handleIncomingSms(input: { from?: unknown; body?: unknown; receivedAt?: unknown }) {
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, 1000) : '';
  if (!body) return { stored: false, matched: false };
  const from = typeof input.from === 'string' ? input.from.slice(0, 60) : '';
  const received = typeof input.receivedAt === 'string' || typeof input.receivedAt === 'number' ? new Date(input.receivedAt) : new Date();
  const receivedAt = Number.isNaN(received.getTime()) ? new Date() : received;
  const hash = crypto.createHash('sha256').update(`${from}|${body}|${receivedAt.toISOString()}`).digest('hex');
  const parsed = parseSms(body);
  const merchant = merchantCore();
  const phones = parsed.phones.filter((phone) => phone !== merchant);

  let sms: any;
  try {
    sms = await PaymentSms.create({ hash, from, body, receivedAt, amountUsd: parsed.amountUsd, refTokens: parsed.refTokens, phones });
  } catch (error: any) {
    if (isDuplicateKey(error)) return { stored: false, matched: false, duplicate: true };
    throw error;
  }
  if (!amountSufficient(parsed.amountUsd) || !phones.length) return { stored: true, matched: false };
  const pending = await Subscription.find({ status: 'pending', payerPhoneKey: { $in: phones } }).limit(5);
  const candidates = pending.filter((subscription) => proves(subscription, { phones, amountUsd: parsed.amountUsd, receivedAt }));
  // Two open requests for the same number (for example two grades) cannot be told apart: leave them for review.
  if (candidates.length !== 1) return { stored: true, matched: false, ambiguous: candidates.length > 1 };
  const approved = await approve(candidates[0], sms);
  return { stored: true, matched: !!approved };
}

export type SmsUnmatchedReason = 'no-number' | 'low-amount' | 'no-request' | 'ambiguous' | 'not-verified';

/** Why an incoming-money SMS did not activate anything, so Super Admin knows what to do with it. */
export function unmatchedReason(sms: { phones?: string[]; amountUsd?: number | null }, pendingByPhone: Map<string, number>): SmsUnmatchedReason {
  const phones = sms.phones || [];
  if (!phones.length) return 'no-number';
  if (!amountSufficient(sms.amountUsd)) return 'low-amount';
  const counts = phones.map((phone) => pendingByPhone.get(phone) || 0);
  if (counts.some((count) => count > 1)) return 'ambiguous';
  if (counts.every((count) => count === 0)) return 'no-request';
  return 'not-verified'; // a request exists but the time window or wallet number rule rejected it
}

/** Super Admin links an unattached incoming-money SMS to a pending request by hand. Returns null when either side is no longer eligible. */
export async function linkSmsToSubscription(smsId: string, subscriptionId: string) {
  const sms: any = await PaymentSms.findById(smsId);
  if (!sms || sms.status !== 'unmatched' || !isIncomingPayment(sms.body) || !amountSufficient(sms.amountUsd)) return null;
  const subscription: any = await Subscription.findOne({ _id: subscriptionId, status: 'pending' });
  if (!subscription) return null;
  return approve(subscription, sms);
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface AccountMatch { userId: string; email: string; name: string; studentId: string; school: string; grade: number | null; activeGrades: number[]; pendingGrades: number[] }

/** Super Admin search for a student account by email, student ID or name (to attach an unlinked payment to it). */
export async function searchStudentAccounts(query: string): Promise<AccountMatch[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 3) return [];
  const rx = new RegExp(escapeRegex(q), 'i');
  const [users, profiles, byId] = await Promise.all([
    User.find({ role: 'student', email: rx }).select('_id').limit(15).lean(),
    Profile.find({ $or: [{ firstName: rx }, { lastName: rx }] }).select('user').limit(15).lean(),
    Student.find({ studentId: rx }).select('user').limit(15).lean(),
  ]);
  const ids = [...new Set([...users.map((row: any) => String(row._id)), ...profiles.map((row: any) => String(row.user)), ...byId.map((row: any) => String(row.user))])].slice(0, 20);
  if (!ids.length) return [];
  const students: any[] = await Student.find({ user: { $in: ids }, approvalStatus: 'approved', status: 'active' })
    .select('user profile studentId school class').populate('profile', 'firstName lastName').populate('school', 'name').limit(20).lean();
  const emails = new Map((await User.find({ _id: { $in: students.map((row) => row.user) } }).select('email').lean()).map((row: any) => [String(row._id), row.email]));
  const classes = new Map((await ClassModel.find({ _id: { $in: students.map((row) => row.class).filter(Boolean) } }).select('gradeLevel').lean()).map((row: any) => [String(row._id), row.gradeLevel]));
  const now = new Date();
  const subs: any[] = await Subscription.find({ user: { $in: students.map((row) => row.user) }, status: { $in: ['pending', 'approved'] } }).select('user grade status startsAt expiresAt').lean();
  return students.map((row) => {
    const own = subs.filter((sub) => String(sub.user) === String(row.user));
    const level = classes.get(String(row.class));
    return {
      userId: String(row.user),
      email: emails.get(String(row.user)) || '',
      name: `${row.profile?.firstName || ''} ${row.profile?.lastName || ''}`.trim(),
      studentId: row.studentId,
      school: row.school?.name || '',
      grade: level === 8 || level === 12 ? level : null,
      activeGrades: own.filter((sub) => sub.status === 'approved' && sub.startsAt <= now && sub.expiresAt > now).map((sub) => sub.grade),
      pendingGrades: own.filter((sub) => sub.status === 'pending').map((sub) => sub.grade),
    };
  });
}

export type LinkAccountResult = { ok: true; subscription: any } | { ok: false; reason: 'sms' | 'student' | 'grade' | 'active' | 'conflict' };

/**
 * Super Admin attaches an unlinked incoming-money SMS to a student account (even one with no payment request yet):
 * the account's pending request for that grade is approved, or a new one is created and approved with this SMS as proof.
 */
export async function linkSmsToAccount(smsId: string, userId: string, grade: number): Promise<LinkAccountResult> {
  if (grade !== 8 && grade !== 12) return { ok: false, reason: 'grade' };
  const sms: any = await PaymentSms.findById(smsId);
  if (!sms || sms.status !== 'unmatched' || !isIncomingPayment(sms.body) || !amountSufficient(sms.amountUsd)) return { ok: false, reason: 'sms' };
  const student: any = await Student.findOne({ user: userId, approvalStatus: 'approved', status: 'active' }).select('school').lean();
  if (!student?.school) return { ok: false, reason: 'student' };
  const now = new Date();
  if (await Subscription.exists({ user: userId, grade, status: 'approved', startsAt: { $lte: now }, expiresAt: { $gt: now } })) return { ok: false, reason: 'active' };

  let target: any = await Subscription.findOne({ user: userId, grade, status: 'pending' });
  let created = false;
  if (!target) {
    const payer = (sms.phones || []).find((phone: string) => phone !== merchantCore()) || '';
    try {
      target = await Subscription.create({ user: userId, school: student.school, grade, paymentReference: `LINK-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, ...(payer ? { payerPhone: payer, payerPhoneKey: payer } : {}) });
      created = true;
    } catch (error: any) {
      if (isDuplicateKey(error)) return { ok: false, reason: 'conflict' };
      throw error;
    }
  }
  const approved = await approve(target, sms);
  if (!approved) {
    if (created) await Subscription.deleteOne({ _id: target._id, status: 'pending' });
    return { ok: false, reason: 'conflict' };
  }
  return { ok: true, subscription: approved };
}
