/**
 * Gradebook Courses Route — /api/v1/gradebook-courses
 * Org-wide course listing with grading-scheme status, for the centralized
 * admin "Grading Rules" page and the "Enter Results" course picker.
 *
 * GET / is admin/org_admin/teacher (a teacher only ever gets back courses
 * they teach — see listCourseGradingStatus). /overview and /bulk-apply span
 * every course in the org at once and stay admin/org_admin only.
 */

import { Router } from 'express';
import * as gradebookController from '../../controllers/gradebook.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', adminOrTeacher, asyncHandler(gradebookController.listCourseGradingStatus));

router.use(adminOnly);
router.get('/overview', asyncHandler(gradebookController.getOrgGradebookOverview));
router.post('/bulk-apply', asyncHandler(gradebookController.bulkApplyScheme));

export default router;
