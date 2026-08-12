import { Router } from 'express';
import * as refundController from '../../controllers/refund.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', adminOnly, asyncHandler(refundController.getAll));
router.post('/', adminOnly, asyncHandler(refundController.issueRefund));

export default router;
