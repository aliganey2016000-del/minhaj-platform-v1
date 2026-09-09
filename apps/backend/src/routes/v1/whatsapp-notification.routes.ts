import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireModulePermission } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { listPreferences, upsertPreference } from '../../controllers/whatsapp-notification.controller';

const router = Router();
router.use(authMiddleware, requireModulePermission('communication'));
router.get('/preferences', asyncHandler(listPreferences));
router.put('/preferences/:parentId', asyncHandler(upsertPreference));

export default router;
