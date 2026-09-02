import { Router } from 'express';
import * as paymentController from '../../controllers/payment.controller';
import * as paymentStatusController from '../../controllers/payment-status.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/my', roleMiddleware(['student']), asyncHandler(paymentController.getMyPayments));
router.get('/', adminOnly, asyncHandler(paymentController.getAll));
router.post('/', adminOnly, asyncHandler(paymentController.recordPayment));
router.get('/stats', adminOnly, asyncHandler(paymentController.getPaymentStats));
router.get('/student-balances', adminOnly, asyncHandler(paymentController.getStudentBalances));
router.put('/set-fees/:studentId', adminOnly, asyncHandler(paymentController.setStudentFees));
router.patch('/:id/status', adminOnly, asyncHandler(paymentStatusController.updateStatus));

router.get('/student/:studentId', roleMiddleware(['admin', 'org_admin', 'parent', 'student']), asyncHandler(paymentController.getStudentPayments));
router.get('/:id/receipt', roleMiddleware(['admin', 'org_admin', 'parent', 'student']), asyncHandler(paymentController.getReceipt));

export default router;
