import { Router } from 'express';
import multer from 'multer';
import * as parentController from '../../controllers/parent.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.use(authMiddleware);

// Parent self-service — must be registered before the adminOnly gate below.
router.get('/me/children', roleMiddleware(['parent']), asyncHandler(parentController.getMyChildren));

// Admin routes for import/export/template — also before :id wildcards
router.get('/export', adminOnly, asyncHandler(parentController.exportParents as any));
router.get('/template', adminOnly, asyncHandler(parentController.downloadTemplate as any));
router.post('/import', adminOnly, upload.single('file'), asyncHandler(parentController.bulkImport));

router.use(adminOnly);

router.get('/', asyncHandler(parentController.getAll));
router.post('/', asyncHandler(parentController.create));
// Registered before /:id so "bulk"/"stats" are never swallowed as an id param.
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
