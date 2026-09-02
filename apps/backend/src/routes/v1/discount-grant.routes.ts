import { Router } from 'express';
import * as discountGrantController from '../../controllers/discount-grant.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { auditLoggingMiddleware, AUDITED_ACTIONS } from '../../utils/audit-logger';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', adminOnly, asyncHandler(discountGrantController.getAll));
router.post('/', adminOnly, auditLoggingMiddleware(AUDITED_ACTIONS.DISCOUNT_GRANT_CREATED, 'DiscountGrant', 'studentId'), asyncHandler(discountGrantController.create));
router.patch('/:id/revoke', adminOnly, auditLoggingMiddleware(AUDITED_ACTIONS.DISCOUNT_GRANT_REVOKED, 'DiscountGrant', 'id'), asyncHandler(discountGrantController.revoke));

export default router;
