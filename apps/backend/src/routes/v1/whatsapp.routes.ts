import { Router } from 'express';
import * as ctrl from '../../controllers/whatsapp.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

// Internal Baileys service callback. Authentication is handled by the webhook token.
router.post('/webhook/baileys', asyncHandler(ctrl.webhook));

router.use(authMiddleware, adminOnly);
router.get('/status', asyncHandler(ctrl.status));
router.get('/history', asyncHandler(ctrl.history));
router.post('/send', asyncHandler(ctrl.send));
router.post('/baileys/connect', asyncHandler(ctrl.connect));
router.get('/baileys/qr', asyncHandler(ctrl.qr));
router.post('/baileys/disconnect', asyncHandler(ctrl.disconnect));

export default router;
