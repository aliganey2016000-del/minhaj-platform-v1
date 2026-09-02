import { Router } from 'express';
import * as refundController from '../../controllers/refund.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { financialManager, financialRead } from '../../middleware/role.middleware';
import { auditLoggingMiddleware, AUDITED_ACTIONS } from '../../utils/audit-logger';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', financialRead, asyncHandler(refundController.getAll));
router.post('/', financialManager, auditLoggingMiddleware(AUDITED_ACTIONS.REFUND_COMPLETED, 'Refund', 'paymentId'), asyncHandler(refundController.issueRefund));

export default router;
