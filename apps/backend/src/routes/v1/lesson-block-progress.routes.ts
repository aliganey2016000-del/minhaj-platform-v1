/**
 * Lesson Block Progress Routes
 * Mounted at /api/v1/courses/:courseId/lessons/:lessonId/gate
 */

import { Router } from 'express';
import * as gateController from '../../controllers/lesson-block-progress.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router({ mergeParams: true });

router.use(authMiddleware);
router.use(roleMiddleware(['student']));

// GET /api/v1/courses/:courseId/lessons/:lessonId/gate
router.get('/', asyncHandler(gateController.getBlockProgress));

// POST /api/v1/courses/:courseId/lessons/:lessonId/gate/blocks/:blockIndex/answer
router.post('/blocks/:blockIndex/answer', asyncHandler(gateController.submitBlockAnswer));

export default router;
