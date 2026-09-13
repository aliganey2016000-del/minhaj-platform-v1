import { Router } from 'express';
import multer from 'multer';
import * as parentController from '../../controllers/parent.controller';
import * as parentPortalController from '../../controllers/parent-portal.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();
const parentOnly = roleMiddleware(['parent']);

router.use(authMiddleware);

// Parent self-service — registered before the adminOnly gate below.
router.get('/me/children', parentOnly, asyncHandler(parentController.getMyChildren));
router.get('/me/overview', parentOnly, asyncHandler(parentPortalController.getOverview));
router.get('/me/children/:childId/attendance', parentOnly, asyncHandler(parentPortalController.getChildAttendance));
router.get('/me/children/:childId/results', parentOnly, asyncHandler(parentPortalController.getChildResults));
router.get('/me/teachers', parentOnly, asyncHandler(parentPortalController.getTeachers));
router.get('/me/events', parentOnly, asyncHandler(parentPortalController.getEvents));
router.get('/me/notifications', parentOnly, asyncHandler(parentPortalController.getNotifications));
router.patch('/me/notifications/read-all', parentOnly, asyncHandler(parentPortalController.markAllNotificationsRead));
router.patch('/me/notifications/:id/read', parentOnly, asyncHandler(parentPortalController.markNotificationRead));
router.get('/me/profile', parentOnly, asyncHandler(parentPortalController.getProfile));
router.patch('/me/profile', parentOnly, asyncHandler(parentPortalController.updateProfile));

// Admin routes for import/export/template — also before :id wildcards
router.get('/export', adminOnly, asyncHandler(parentController.exportParents as any));
router.get('/template', adminOnly, asyncHandler(parentController.downloadTemplate as any));
router.post('/import', adminOnly, upload.single('file'), asyncHandler(parentController.bulkImport));

router.use(adminOnly);

router.get('/', asyncHandler(parentController.getAll));
router.post('/', asyncHandler(parentController.create));
router.delete('/bulk', asyncHandler(parentController.bulkRemove));
router.get('/stats', asyncHandler(parentController.getStats));
router.get('/:id', asyncHandler(parentController.getById));
router.patch('/:id', asyncHandler(parentController.update));
router.delete('/:id', asyncHandler(parentController.remove));
router.patch('/:id/status', asyncHandler(parentController.updateStatus));
router.get('/:id/children', asyncHandler(parentController.getChildren));
router.post('/:id/link-child', asyncHandler(parentController.linkChild));
router.post('/:id/unlink-child', asyncHandler(parentController.unlinkChild));

export default router;
