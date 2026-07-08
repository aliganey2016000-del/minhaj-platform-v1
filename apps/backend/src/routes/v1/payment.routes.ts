import { Router } from 'express';
import * as paymentController from '../../controllers/payment.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

// Admin only
router.get('/', adminOnly, asyncHandler(paymentController.getAll));
router.post('/', adminOnly, asyncHandler(paymentController.recordPayment));
router.get('/stats', adminOnly, asyncHandler(paymentController.getPaymentStats));
router.patch('/:id/status', adminOnly, asyncHandler(paymentController.updateStatus));

// Admin / Parent / Student
router.get('/student/:studentId', roleMiddleware(['admin', 'parent', 'student']), asyncHandler(paymentController.getStudentPayments));

export default router;