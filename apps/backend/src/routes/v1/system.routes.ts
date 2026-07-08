import { Router } from 'express';
import * as ctrl from '../../controllers/system.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);
router.use(adminOnly);

router.get('/settings', asyncHandler(ctrl.getSettings));
router.put('/settings', asyncHandler(ctrl.updateSettings));
router.get('/logs', asyncHandler(ctrl.getLogs));
router.delete('/logs', asyncHandler(ctrl.clearLogs));

export default router;