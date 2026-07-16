/**
 * Admin/teacher-facing Academic Appeals review routes.
 * Student-facing submit/list routes live under /exams/:id/appeals and
 * /exams/my/appeals (see exam.routes.ts) since they're scoped to a specific
 * exam and the caller's own record.
 */

import { Router } from 'express';
import * as appealController from '../../controllers/exam-appeal.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);
router.use(adminOrTeacher);

router.get('/', asyncHandler(appealController.getAll));
router.patch('/:id', asyncHandler(appealController.update));

export default router;
