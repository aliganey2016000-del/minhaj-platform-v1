import { Router } from 'express';
import * as ctrl from '../../controllers/system.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);
router.use(adminOnly);

// Settings is platform-wide (Setting.find() has no tenant field) and
// ActivityLog has no org scoping either, so none of these may be opened to
// org_admin/staff — only the real platform admin. adminOnly above still
// gates every route here against teachers/students/parents etc; this
// tightens it further to 'admin' alone for these specific endpoints.
router.get('/settings', roleMiddleware(['admin']), asyncHandler(ctrl.getSettings));
router.put('/settings', roleMiddleware(['admin']), asyncHandler(ctrl.updateSettings));
router.get('/logs', roleMiddleware(['admin']), asyncHandler(ctrl.getLogs));
router.delete('/logs', roleMiddleware(['admin']), asyncHandler(ctrl.clearLogs));

export default router;