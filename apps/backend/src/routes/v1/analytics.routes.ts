import { Router } from 'express';
import * as analyticsController from '../../controllers/analytics.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);
router.use(adminOnly);

router.get('/dashboard', asyncHandler(analyticsController.getDashboardStats));

export default router;