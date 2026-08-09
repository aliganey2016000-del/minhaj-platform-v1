/**
 * Course Content Routes — /api/v1/courses/:courseId/content
 */

import { Router } from 'express';
import multer from 'multer';
import * as contentController from '../../controllers/course-content.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(authMiddleware);

// ── Read: accessible to all authenticated users (admin, teacher, student, parent) ──
// GET /api/v1/courses/:courseId/content
router.get('/', asyncHandler(contentController.getByCourse));

// ── Write: restricted to admin and teacher ──
router.use(adminOrTeacher);

// PUT /api/v1/courses/:courseId/content — full save / upsert
router.put('/', asyncHandler(contentController.saveContent));

// PATCH /api/v1/courses/:courseId/content/chapters/reorder
router.patch('/chapters/reorder', asyncHandler(contentController.reorderChapters));

// PATCH /api/v1/courses/:courseId/content/chapters/:chapterId/items/reorder
router.patch('/chapters/:chapterId/items/reorder', asyncHandler(contentController.reorderItems));

// PATCH /api/v1/courses/:courseId/content/chapters/:chapterId/collapse
router.patch('/chapters/:chapterId/collapse', asyncHandler(contentController.toggleChapterCollapse));

// GET /api/v1/courses/:courseId/content/template — download the import template
router.get('/template', asyncHandler(contentController.downloadImportTemplate as any));

// POST /api/v1/courses/:courseId/content/import — bulk import chapters + lessons
router.post('/import', upload.single('file'), asyncHandler(contentController.importContent));

// GET /api/v1/courses/:courseId/content/blocks-import/template — course-scoped
// Interactive Gate Content Blocks import template (one sheet per lesson)
router.get('/blocks-import/template', asyncHandler(contentController.downloadBlocksImportTemplate as any));

// POST /api/v1/courses/:courseId/content/blocks-import — bulk import Interactive
// Gate Content Blocks across every lesson in the course from one multi-sheet file
router.post('/blocks-import', upload.single('file'), asyncHandler(contentController.importContentBlocksForCourse));

export default router;