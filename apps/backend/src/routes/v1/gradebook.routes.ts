/**
 * Gradebook Routes — /api/v1/gradebook/:courseId
 * Weighted grading scheme configuration + computed grades. Admin/Teacher only.
 */

import { Router } from 'express';
import * as gradebookController from '../../controllers/gradebook.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router({ mergeParams: true });

router.use(authMiddleware);
router.use(adminOrTeacher);

router.get('/scheme', asyncHandler(gradebookController.getScheme));
router.put('/scheme', asyncHandler(gradebookController.saveScheme));
router.get('/grades', asyncHandler(gradebookController.getClassGrades));
router.get('/grades/:studentId', asyncHandler(gradebookController.getStudentGrade));
router.put('/manual/:studentId', asyncHandler(gradebookController.setManualGrade));
router.get('/export', asyncHandler(gradebookController.exportClassGrades as any));

export default router;
