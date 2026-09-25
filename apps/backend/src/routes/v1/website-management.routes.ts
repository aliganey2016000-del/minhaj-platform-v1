import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../../controllers/website-management.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware } from '../../middleware/role.middleware';
import tenantMiddleware from '../../middleware/tenant.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Public tenant website snapshot. Host/custom-domain resolution is handled by
// tenantMiddleware and this endpoint never exposes an unpublished draft.
router.get('/public/current', tenantMiddleware, asyncHandler(ctrl.getPublicWebsite));

router.use(authMiddleware);
router.use(roleMiddleware(['admin', 'org_admin']));

router.get('/', asyncHandler(ctrl.getWebsiteConfig));
router.put('/', asyncHandler(ctrl.saveWebsiteDraft));
router.post('/publish', asyncHandler(ctrl.publishWebsite));
router.post('/unpublish', asyncHandler(ctrl.unpublishWebsite));
router.post('/reset', asyncHandler(ctrl.resetWebsiteDraft));
router.post('/media', upload.single('file'), asyncHandler(ctrl.uploadWebsiteMedia));

export default router;
