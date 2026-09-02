import { Router } from 'express';
import * as paymentController from '../../controllers/payment.controller';
import * as invoiceBalanceController from '../../controllers/invoice-balance.controller';
import * as paymentStatusController from '../../controllers/payment-status.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { financialManager, financialOperator, financialRead, roleMiddleware } from '../../middleware/role.middleware';
import { auditLoggingMiddleware, AUDITED_ACTIONS } from '../../utils/audit-logger';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/my', roleMiddleware(['student']), asyncHandler(paymentController.getMyPayments));
router.get('/', financialRead, asyncHandler(paymentController.getAll));
router.post('/', financialOperator, auditLoggingMiddleware(AUDITED_ACTIONS.PAYMENT_RECORDED, 'Payment'), asyncHandler(paymentController.recordPayment));
router.get('/stats', financialRead, asyncHandler(paymentController.getPaymentStats));
router.get('/student-balances', financialRead, asyncHandler(invoiceBalanceController.getStudentBalances));
router.put('/set-fees/:studentId', financialManager, auditLoggingMiddleware(AUDITED_ACTIONS.DISCOUNT_GRANTED, 'Student', 'studentId'), asyncHandler(paymentController.setStudentFees));
router.patch('/:id/status', financialOperator, auditLoggingMiddleware(AUDITED_ACTIONS.PAYMENT_STATUS_CHANGED, 'Payment'), asyncHandler(paymentStatusController.updateStatus));

router.get('/student/:studentId', roleMiddleware(['admin', 'org_admin', 'finance_manager', 'cashier', 'auditor', 'parent', 'student']), asyncHandler(paymentController.getStudentPayments));
router.get('/:id/receipt', roleMiddleware(['admin', 'org_admin', 'finance_manager', 'cashier', 'auditor', 'parent', 'student']), asyncHandler(paymentController.getReceipt));

export default router;
