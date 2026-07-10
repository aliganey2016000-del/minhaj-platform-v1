/**
 * Course Content Routes — /api/v1/courses/:courseId/content
 */

import { Router } from 'express';
import * as contentController from '../../controllers/course-content.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router({ mergeParams: true });

// All routes require auth + admin/teacher
router.use(authMiddleware);
router.use(adminOrTeacher);

// GET /api/v1/courses/:courseId/content
router.get('/', asyncHandler(contentController.getByCourse));

// PUT /api/v1/courses/:courseId/content — full save / upsert
router.put('/', asyncHandler(contentController.saveContent));

// PATCH /api/v1/courses/:courseId/content/chapters/reorder
router.patch('/chapters/reorder', asyncHandler(contentController.reorderChapters));

// PATCH /api/v1/courses/:courseId/content/chapters/:chapterId/items/reorder
router.patch('/chapters/:chapterId/items/reorder', asyncHandler(contentController.reorderItems));

// PATCH /api/v1/courses/:courseId/content/chapters/:chapterId/collapse
router.patch('/chapters/:chapterId/collapse', asyncHandler(contentController.toggleChapterCollapse));

export default router;