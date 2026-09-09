import { Router } from 'express';
import * as ctrl from '../../controllers/whatsapp-template.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware, adminOnly);
router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.patch('/:templateId', asyncHandler(ctrl.update));
router.delete('/:templateId', asyncHandler(ctrl.remove));
export default router;
