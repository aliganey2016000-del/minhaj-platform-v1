import { Router } from 'express';
import mongoose from 'mongoose';
import Subscription from '../../models/global-subscription.model';
import Student from '../../models/student.model';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError, ForbiddenError, NotFoundError, ConflictError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';
import { GLOBAL_SUBSCRIPTION_PRICE, subscriptionExpiry } from '../../utils/global-subscription';
import { ApiError } from '../../utils/api-error';
import { purchase, toWalletAccount, waafiConfig } from '../../services/waafipay.service';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { merchantCore, phoneCore, verifyFromStoredSms } from '../../services/guuldoon-sms-payment.service';

const router = Router();
router.use(authMiddleware);
router.get('/mine', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'student') throw new ForbiddenError('Student access required');
  return ApiResponse.success(res, await Subscription.find({ user: req.user.userId }).sort({ createdAt: -1 }).limit(100).lean());
}));
router.post('/requests', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'student') throw new ForbiddenError('Student access required');
  const grade = Number(req.body.grade);
  const payerPhone = typeof req.body.payerPhone === 'string' ? req.body.payerPhone.trim().slice(0, 30) : '';
  const payerPhoneKey = phoneCore(payerPhone);
  const givenReference = typeof req.body.paymentReference === 'string' ? req.body.paymentReference.trim().toUpperCase() : '';
  if (payerPhone && (payerPhoneKey.length < 7 || payerPhoneKey.length > 12 || payerPhoneKey === merchantCore())) throw new BadRequestError('Enter the wallet number you will pay from');
  // The wallet number alone identifies the payment; a reference stays optional for manual review.
  const paymentReference = givenReference || (payerPhone ? `AUTO-${crypto.randomBytes(5).toString('hex').toUpperCase()}` : '');
  if (![8, 12].includes(grade) || !paymentReference || paymentReference.length > 120) throw new BadRequestError('Choose Grade 8 or 12 and enter the wallet number you pay from, or a payment reference');
  const student = await Student.findOne({ user: req.user.userId, approvalStatus: 'approved', status: 'active' }).lean();
  if (!student?.school || String(student.school) !== req.user.organizationId) throw new ForbiddenError('An active approved school student account is required');
  const active = await Subscription.exists({ user: req.user.userId, grade, status: 'approved', startsAt: { $lte: new Date() }, expiresAt: { $gt: new Date() } });
  if (active) throw new ConflictError('This grade already has an active subscription');
  const pending = await Subscription.exists({ user: req.user.userId, grade, status: 'pending' });
  if (pending) throw new ConflictError('A subscription request is already pending for this grade');
  try {
    const created = await Subscription.create({ user: req.user.userId, school: student.school, grade, paymentReference, ...(payerPhone ? { payerPhone, payerPhoneKey } : {}) });
    // If the confirmation SMS already arrived, activate right away.
    const verified = await verifyFromStoredSms(created);
    return ApiResponse.created(res, verified || created, verified ? 'Payment verified automatically' : 'Payment reference submitted for verification');
  } catch (error: any) {
    if (error.code === 11000) throw new ConflictError('A subscription request is already pending for this grade');
    throw error;
  }
}));

const payLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.userId || req.ip),
});

/** Whether paying straight from the wallet (EVC Plus, Zaad, eDahab) is available. */
router.get('/pay/config', asyncHandler(async (_req, res) => ApiResponse.success(res, { enabled: !!waafiConfig(), smsEnabled: !!process.env.GUULDOON_SMS_WEBHOOK_SECRET, merchantNumber: process.env.GUULDOON_MERCHANT_NUMBER || null })));

/** Student pays $5 from their wallet: a PIN prompt appears on their phone and the subscription activates on success. */
router.post('/pay', payLimiter, asyncHandler(async (req, res) => {
  if (req.user?.role !== 'student') throw new ForbiddenError('Student access required');
  const config = waafiConfig();
  if (!config) throw new ApiError(503, 'Wallet payment is not available yet');
  const grade = Number(req.body.grade);
  const accountNo = typeof req.body.phone === 'string' ? toWalletAccount(req.body.phone) : null;
  if (![8, 12].includes(grade) || !accountNo) throw new BadRequestError('Choose Grade 8 or 12 and enter the wallet number you pay from');
  const student = await Student.findOne({ user: req.user.userId, approvalStatus: 'approved', status: 'active' }).lean();
  if (!student?.school || String(student.school) !== req.user.organizationId) throw new ForbiddenError('An active approved school student account is required');
  const now = new Date();
  if (await Subscription.exists({ user: req.user.userId, grade, status: 'approved', startsAt: { $lte: now }, expiresAt: { $gt: now } })) throw new ConflictError('This grade already has an active subscription');

  if (await Subscription.exists({ user: req.user.userId, grade, status: 'pending' })) throw new ConflictError('A payment is already in progress for this grade');

  // The pending row is the lock: a second tap while this payment is waiting for the PIN is rejected.
  let pending: any;
  try {
    pending = await Subscription.create({ user: req.user.userId, school: student.school, grade, paymentReference: `WP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, payerPhone: accountNo, gateway: 'waafipay' });
  } catch (error: any) {
    if (error.code === 11000 || /E11000|duplicate key|UNIQUE constraint/i.test(String(error?.message))) throw new ConflictError('A payment is already in progress for this grade');
    throw error;
  }

  const result = await purchase(config, {
    accountNo,
    amount: GLOBAL_SUBSCRIPTION_PRICE,
    referenceId: String(pending._id),
    invoiceId: pending.paymentReference,
    description: `Guuldoon Grade ${grade} subscription`,
  });

  if (result.ok) {
    const activated = new Date();
    try {
      const approved = await Subscription.findOneAndUpdate(
        { _id: pending._id, status: 'pending' },
        { $set: { status: 'approved', autoVerified: true, startsAt: activated, expiresAt: subscriptionExpiry(activated), reviewedAt: activated, verifiedReference: `WAAFI-${result.transactionId}`, gatewayTransactionId: result.transactionId, gatewayMessage: result.message } },
        { new: true, runValidators: true },
      );
      return ApiResponse.success(res, { status: 'approved', subscription: approved }, 'Payment received. Your subscription is active.');
    } catch (error: any) {
      // The wallet was charged but the transaction id was already used: keep it pending for an administrator.
      await Subscription.updateOne({ _id: pending._id }, { $set: { gatewayTransactionId: result.transactionId, gatewayMessage: 'Charged; needs manual review' } });
      return ApiResponse.success(res, { status: 'pending' }, 'Payment received. An administrator will confirm it shortly.');
    }
  }
  if (result.ambiguous) {
    // Money may have moved: never reject. An administrator checks the merchant statement.
    await Subscription.updateOne({ _id: pending._id }, { $set: { gatewayMessage: result.message } });
    return ApiResponse.success(res, { status: 'pending' }, 'We could not confirm the payment yet. If money left your wallet, an administrator will activate your subscription.');
  }
  await Subscription.updateOne({ _id: pending._id }, { $set: { status: 'rejected', reviewedAt: new Date(), gatewayMessage: result.message || `Declined (${result.code})` } });
  throw new ApiError(402, result.message || 'The payment was not completed. Check your balance and try again.');
}));
router.get('/admin', asyncHandler(async (req, res) => {
  if (!['admin', 'org_admin'].includes(req.user?.role || '')) throw new ForbiddenError('Administrator access required');
  if (req.user?.role === 'org_admin' && !req.user.organizationId) throw new ForbiddenError('Organization required');
  const filter = req.user?.role === 'admin' ? {} : { school: req.user!.organizationId };
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 50;
  const [rows, total] = await Promise.all([
    Subscription.find(filter).populate('user', 'email').populate('school', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Subscription.countDocuments(filter),
  ]);
  return ApiResponse.paginated(res, rows, { page, limit, total });
}));
router.post('/:id/review', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'admin' || req.user.isStaff) throw new ForbiddenError('Only Super Admin can verify or revoke payments');
  if (!mongoose.isValidObjectId(req.params.id)) throw new BadRequestError('Invalid request ID');
  const action = req.body.action;
  if (!['approve', 'reject', 'revoke'].includes(action)) throw new BadRequestError('Invalid review action');
  const row = await Subscription.findById(req.params.id);
  if (!row) throw new NotFoundError('Subscription');
  if (action === 'approve' && row.status === 'approved') return ApiResponse.success(res, row, 'Already verified');
  if ((action === 'revoke' && row.status !== 'approved') || (action !== 'revoke' && row.status !== 'pending')) throw new ConflictError('This request has already been reviewed');
  const now = new Date();
  const updates: Record<string, unknown> = { status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revoked', reviewedBy: req.user.userId, reviewedAt: now };
  if (action === 'approve') {
    if (req.body.paymentReceived !== true) throw new BadRequestError('Confirm that the $5 USD payment has been received');
    const referenceAlreadyVerified = await Subscription.exists({
      _id: { $ne: row._id },
      verifiedReference: row.paymentReference,
    });
    if (referenceAlreadyVerified) {
      throw new ConflictError('This payment reference was already verified for another subscription');
    }
    updates.startsAt = now;
    updates.expiresAt = subscriptionExpiry(now);
    updates.verifiedReference = row.paymentReference;
  }
  try {
    const reviewed = await Subscription.findOneAndUpdate({ _id: row._id, status: row.status }, { $set: updates }, { new: true, runValidators: true });
    if (!reviewed) throw new ConflictError('This request was reviewed by another administrator');
    return ApiResponse.success(res, reviewed);
  } catch (error: any) {
    if (error.code === 11000) throw new ConflictError('This payment reference was already verified for another subscription');
    throw error;
  }
}));
export default router;
