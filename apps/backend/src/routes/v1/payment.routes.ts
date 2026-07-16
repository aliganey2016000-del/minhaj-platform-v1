import { Router } from 'express';
import * as paymentController from '../../controllers/payment.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

// ---------------------------------------------------------------------------
// IMPORTANT: literal /my, /stats, /outstanding routes MUST come before the
// /student/:studentId wildcard route below to avoid ambiguity.
// ---------------------------------------------------------------------------

router.get('/my', roleMiddleware(['student']), asyncHandler(paymentController.getMyPayments));

// Admin / org_admin — scoped to their own org inside the controller.
router.get('/', adminOnly, asyncHandler(paymentController.getAll));
router.post('/', adminOnly, asyncHandler(paymentController.recordPayment));
router.get('/stats', adminOnly, asyncHandler(paymentController.getPaymentStats));
router.get('/outstanding', adminOnly, asyncHandler(paymentController.getOutstanding));
router.patch('/:id/status', adminOnly, asyncHandler(paymentController.updateStatus));

// Admin / org_admin / parent / student — ownership enforced in the controller.
router.get('/student/:studentId', roleMiddleware(['admin', 'org_admin', 'parent', 'student']), asyncHandler(paymentController.getStudentPayments));

export default router;
