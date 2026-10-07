import { Router } from 'express';
import mongoose from 'mongoose';
import Subscription from '../../models/global-subscription.model';
import Student from '../../models/student.model';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { BadRequestError, ForbiddenError, NotFoundError, ConflictError } from '../../utils/api-error';
import ApiResponse from '../../utils/api-response';
import { subscriptionExpiry } from '../../utils/global-subscription';

const router = Router();
router.use(authMiddleware);
router.get('/mine', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'student') throw new ForbiddenError('Student access required');
  return ApiResponse.success(res, await Subscription.find({ user: req.user.userId }).sort({ createdAt: -1 }).limit(100).lean());
}));
router.post('/requests', asyncHandler(async (req, res) => {
  if (req.user?.role !== 'student') throw new ForbiddenError('Student access required');
  const grade = Number(req.body.grade);
  const paymentReference = typeof req.body.paymentReference === 'string' ? req.body.paymentReference.trim().toUpperCase() : '';
  if (![8, 12].includes(grade) || !paymentReference || paymentReference.length > 120) throw new BadRequestError('Choose Grade 8 or 12 and provide a valid payment reference');
  const student = await Student.findOne({ user: req.user.userId, approvalStatus: 'approved', status: 'active' }).lean();
  if (!student?.school || String(student.school) !== req.user.organizationId) throw new ForbiddenError('An active approved school student account is required');
  const active = await Subscription.exists({ user: req.user.userId, grade, status: 'approved', startsAt: { $lte: new Date() }, expiresAt: { $gt: new Date() } });
  if (active) throw new ConflictError('This grade already has an active subscription');
  const pending = await Subscription.exists({ user: req.user.userId, grade, status: 'pending' });
  if (pending) throw new ConflictError('A subscription request is already pending for this grade');
  try {
    return ApiResponse.created(res, await Subscription.create({ user: req.user.userId, school: student.school, grade, paymentReference }), 'Payment reference submitted for verification');
  } catch (error: any) {
    if (error.code === 11000) throw new ConflictError('A subscription request is already pending for this grade');
    throw error;
  }
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
