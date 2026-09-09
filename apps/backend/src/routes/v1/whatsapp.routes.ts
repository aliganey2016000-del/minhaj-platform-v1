import { Router } from 'express';
import * as ctrl from '../../controllers/whatsapp.controller';
import * as mediaCtrl from '../../controllers/whatsapp-media.controller';
import * as notificationCtrl from '../../controllers/whatsapp-notification.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { startWhatsAppNotificationWorker } from '../../jobs/whatsapp-notification-worker';

const router = Router();

// Internal Baileys service callback. Authentication is handled by the webhook token.
router.post('/webhook/baileys', asyncHandler(ctrl.webhook));

router.use(authMiddleware, adminOnly);
router.get('/status', asyncHandler(ctrl.status));
router.get('/history', asyncHandler(ctrl.history));
router.post('/send', asyncHandler(ctrl.send));
router.post('/send-media', asyncHandler(mediaCtrl.sendMedia));
router.get('/conversations', asyncHandler(ctrl.conversations));
router.get('/conversations/:conversationId/messages', asyncHandler(ctrl.conversationMessages));
router.post('/conversations/:conversationId/read', asyncHandler(ctrl.markConversationRead));
router.patch('/conversations/:conversationId', asyncHandler(ctrl.updateConversation));
router.post('/baileys/connect', asyncHandler(ctrl.connect));
router.get('/baileys/qr', asyncHandler(ctrl.qr));
router.post('/baileys/disconnect', asyncHandler(ctrl.disconnect));
router.get('/preferences', asyncHandler(notificationCtrl.listPreferences));
router.put('/preferences/:parentId', asyncHandler(notificationCtrl.upsertPreference));

// Process queued WhatsApp notifications in the API process. Deployment can move this worker
// to a dedicated process later without changing the queue contract.
startWhatsAppNotificationWorker();

export default router;
