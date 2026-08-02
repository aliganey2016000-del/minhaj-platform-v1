/**
 * Gradebook Courses Route — /api/v1/gradebook-courses
 * Org-wide course listing with grading-scheme status, for the centralized
 * admin "Grading Rules" page. Admin/org_admin only.
 */

import { Router } from 'express';
import * as gradebookController from '../../controllers/gradebook.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);
router.use(adminOnly);

router.get('/', asyncHandler(gradebookController.listCourseGradingStatus));

export default router;
