/**
 * Gradebook Routes — /api/v1/gradebook/:courseId
 * Weighted grading scheme configuration + computed grades. Admin/Teacher only.
 */

import { Router } from 'express';
import * as gradebookController from '../../controllers/gradebook.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

// Student self-service — must be registered before the adminOrTeacher gate
// below, since that middleware applies to every route declared after it.
router.get('/my', roleMiddleware(['student']), asyncHandler(gradebookController.getMyCourseGrade));

router.use(adminOrTeacher);

router.get('/scheme', asyncHandler(gradebookController.getScheme));
router.put('/scheme', asyncHandler(gradebookController.saveScheme));
router.get('/grades', asyncHandler(gradebookController.getClassGrades));
router.get('/grades/:studentId', asyncHandler(gradebookController.getStudentGrade));
router.put('/manual/:studentId', asyncHandler(gradebookController.setManualGrade));
router.get('/manual-entry-roster', asyncHandler(gradebookController.getManualEntryRoster));
router.post('/manual-entry-roster/bulk', asyncHandler(gradebookController.bulkSetManualGrades));
router.get('/export', asyncHandler(gradebookController.exportClassGrades as any));

export default router;
