import { Router } from 'express';
import * as paymentController from '../../controllers/payment.controller';
import * as paymentStatusController from '../../controllers/payment-status.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { financialManager, financialOperator, financialRead, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/my', roleMiddleware(['student']), asyncHandler(paymentController.getMyPayments));
router.get('/', financialRead, asyncHandler(paymentController.getAll));
router.post('/', financialOperator, asyncHandler(paymentController.recordPayment));
router.get('/stats', financialRead, asyncHandler(paymentController.getPaymentStats));
router.get('/student-balances', financialRead, asyncHandler(paymentController.getStudentBalances));
router.put('/set-fees/:studentId', financialManager, asyncHandler(paymentController.setStudentFees));
router.patch('/:id/status', financialOperator, asyncHandler(paymentStatusController.updateStatus));

router.get('/student/:studentId', roleMiddleware(['admin', 'org_admin', 'finance_manager', 'cashier', 'auditor', 'parent', 'student']), asyncHandler(paymentController.getStudentPayments));
router.get('/:id/receipt', roleMiddleware(['admin', 'org_admin', 'finance_manager', 'cashier', 'auditor', 'parent', 'student']), asyncHandler(paymentController.getReceipt));

export default router;
