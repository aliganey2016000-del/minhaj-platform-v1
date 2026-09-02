import { Router } from 'express';
import * as feeAdjustmentController from '../../controllers/fee-adjustment.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { auditLoggingMiddleware, AUDITED_ACTIONS } from '../../utils/audit-logger';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', adminOnly, asyncHandler(feeAdjustmentController.getAll));
router.post('/', adminOnly, auditLoggingMiddleware(AUDITED_ACTIONS.DISCOUNT_GRANTED, 'FeeAdjustment', 'invoiceId'), asyncHandler(feeAdjustmentController.grantAdjustment));

export default router;
