import { Router } from 'express';
import multer from 'multer';
import * as teacherController from '../../controllers/teacher.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.use(authMiddleware);
router.use(adminOnly);

router.get('/', asyncHandler(teacherController.getAll));
router.get('/export', asyncHandler(teacherController.exportTeachers as any));
router.get('/template', asyncHandler(teacherController.downloadTemplate as any));
router.get('/:id', asyncHandler(teacherController.getById));
router.post('/', asyncHandler(teacherController.create));
router.post('/import', upload.single('file'), asyncHandler(teacherController.bulkImport));
router.patch('/:id', asyncHandler(teacherController.update));
router.delete('/:id', asyncHandler(teacherController.remove));
router.patch('/:id/status', asyncHandler(teacherController.updateStatus));
router.patch('/:id/course-permission', asyncHandler(teacherController.updateCoursePermission));

export default router;
