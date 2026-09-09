/**
 * Course Content Routes — /api/v1/courses/:courseId/content
 */

import { Router } from 'express';
import multer from 'multer';
import * as contentController from '../../controllers/course-content.controller';
import { getByCourse as getCourseContent } from '../../controllers/random-quiz-content.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router({ mergeParams: true });
router.use(authMiddleware);
router.get('/', asyncHandler(getCourseContent));
router.use(adminOrTeacher);
router.put('/', asyncHandler(contentController.saveContent));
router.patch('/chapters/reorder', asyncHandler(contentController.reorderChapters));
router.patch('/chapters/:chapterId/items/reorder', asyncHandler(contentController.reorderItems));
router.patch('/chapters/:chapterId/collapse', asyncHandler(contentController.toggleChapterCollapse));
router.get('/template', asyncHandler(contentController.downloadImportTemplate as any));
router.post('/import', upload.single('file'), asyncHandler(contentController.importContent));
router.get('/blocks-import/template', asyncHandler(contentController.downloadBlocksImportTemplate as any));
router.post('/blocks-import', upload.single('file'), asyncHandler(contentController.importContentBlocksForCourse));

export default router;
