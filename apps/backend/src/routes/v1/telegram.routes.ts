import { Router } from 'express';
import * as ctrl from '../../controllers/telegram.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

// Public — Telegram's own servers call this, so it must sit BEFORE
// authMiddleware below or every webhook delivery would 401.
router.post('/webhook', asyncHandler(ctrl.webhook));

router.use(authMiddleware);

router.get('/status', adminOnly, asyncHandler(ctrl.status));
router.get('/history', adminOnly, asyncHandler(ctrl.history));
router.post('/send', adminOnly, asyncHandler(ctrl.send));

router.get('/link/status', roleMiddleware(['parent']), asyncHandler(ctrl.linkStatus));
router.post('/link/generate', roleMiddleware(['parent']), asyncHandler(ctrl.generateLinkToken));
router.post('/unlink', roleMiddleware(['parent']), asyncHandler(ctrl.unlink));

export default router;
