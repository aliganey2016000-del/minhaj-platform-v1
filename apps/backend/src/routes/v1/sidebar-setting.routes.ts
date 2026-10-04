import { Router } from 'express';
import * as sidebarSettingController from '../../controllers/sidebar-setting.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

// Student/org_admin/teacher read their own org's effective settings for
// whichever portal they belong to (?portal=student|admin) — the controller
// enforces which role may read which portal.
router.get('/mine', roleMiddleware(['student', 'org_admin', 'teacher', 'staff']), asyncHandler(sidebarSettingController.getMine));

// Admin/org_admin manage settings — org_admin may edit student + teacher\n// settings for its own tenant only; portal='admin' remains super-admin-only.
router.get('/', adminOnly, asyncHandler(sidebarSettingController.getForOrg));
router.put('/', adminOnly, asyncHandler(sidebarSettingController.update));

export default router;
