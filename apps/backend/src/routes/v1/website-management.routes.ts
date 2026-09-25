import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../../controllers/website-management.controller';
import * as advanced from '../../controllers/website-advanced.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware } from '../../middleware/role.middleware';
import tenantMiddleware from '../../middleware/tenant.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const publicWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Public tenant website endpoints. These never expose unpublished drafts.
router.get('/public/current', tenantMiddleware, asyncHandler(ctrl.getPublicWebsite));
router.get('/public/media/:schoolId', asyncHandler(ctrl.getPublicMedia));
router.get('/public/sitemap.xml', tenantMiddleware, asyncHandler(advanced.getSitemap));
router.get('/public/robots.txt', tenantMiddleware, asyncHandler(advanced.getRobots));
router.post('/public/contact', publicWriteLimiter, tenantMiddleware, asyncHandler(advanced.submitContact));
router.post('/public/analytics', publicWriteLimiter, tenantMiddleware, asyncHandler(advanced.recordAnalytics));

router.use(authMiddleware);
router.use(roleMiddleware(['admin', 'org_admin']));

router.get('/', asyncHandler(ctrl.getWebsiteConfig));
router.put('/', asyncHandler(ctrl.saveWebsiteDraft));
router.post('/publish', asyncHandler(ctrl.publishWebsite));
router.post('/unpublish', asyncHandler(ctrl.unpublishWebsite));
router.post('/reset', asyncHandler(ctrl.resetWebsiteDraft));

router.post('/media', upload.single('file'), asyncHandler(ctrl.uploadWebsiteMedia));
router.delete('/media/:mediaId', asyncHandler(ctrl.deleteWebsiteMedia));

router.get('/messages', asyncHandler(advanced.listMessages));
router.patch('/messages/:messageId', asyncHandler(advanced.updateMessage));
router.delete('/messages/:messageId', asyncHandler(advanced.deleteMessage));

router.get('/analytics', asyncHandler(advanced.getAnalytics));

router.get('/versions', asyncHandler(advanced.listVersions));
router.post('/versions/:version/rollback', asyncHandler(advanced.rollbackVersion));

router.get('/templates', asyncHandler(advanced.listTemplates));
router.post('/templates/:templateId/apply', asyncHandler(advanced.applyTemplate));

router.get('/domain/status', asyncHandler(advanced.getDomainStatus));
router.post('/domain/provision', asyncHandler(advanced.provisionManagedDomain));

export default router;
