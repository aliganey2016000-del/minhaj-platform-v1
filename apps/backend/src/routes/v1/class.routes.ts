import { Router } from 'express';
import multer from 'multer';
import * as classController from '../../controllers/class.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.use(authMiddleware);

router.get('/', adminOrTeacher, asyncHandler(classController.getAll));
// Registered before /:id so "browse" is never swallowed as an id param.
router.get('/browse', roleMiddleware(['admin', 'org_admin', 'teacher', 'student']), asyncHandler(classController.browseClasses));
router.post('/', adminOnly, asyncHandler(classController.create));
router.post('/import', adminOnly, upload.single('file'), asyncHandler(classController.bulkImport));
router.get('/export', adminOnly, asyncHandler(classController.exportClasses as any));
router.get('/template', adminOnly, asyncHandler(classController.downloadTemplate as any));
// Registered before /:id so "bulk" is never swallowed as an id param.
router.delete('/bulk', adminOnly, asyncHandler(classController.bulkRemove));
router.patch('/:id', adminOnly, asyncHandler(classController.update));
router.delete('/:id', adminOnly, asyncHandler(classController.remove));
router.patch('/:id/status', adminOnly, asyncHandler(classController.updateStatus));
router.get('/schedule/:courseId', asyncHandler(classController.getSchedule));
router.get('/promotion-preview', adminOnly, asyncHandler(classController.getPromotionPreview));
router.post('/promote-all', adminOnly, asyncHandler(classController.promoteAll));

export default router;
