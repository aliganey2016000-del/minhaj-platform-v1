import { Router } from 'express';
import * as ctrl from '../../controllers/whatsapp.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware, adminOnly);

router.get('/status', asyncHandler(ctrl.status));
router.get('/history', asyncHandler(ctrl.history));
router.post('/send', asyncHandler(ctrl.send));

export default router;
