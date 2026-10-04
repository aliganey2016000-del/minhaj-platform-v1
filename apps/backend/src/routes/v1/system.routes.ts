import { Router } from 'express';
import * as ctrl from '../../controllers/system.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);
router.use(adminOnly);

// Settings remain platform-wide and therefore platform-admin only.
router.get('/settings', roleMiddleware(['admin']), asyncHandler(ctrl.getSettings));
router.put('/settings', roleMiddleware(['admin']), asyncHandler(ctrl.updateSettings));

// Activity Logs are available to the platform admin and organization admins.
// The controller derives organization scope only from req.user.organizationId;
// request query/body/header tenant selectors are never trusted.
router.get('/logs', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.getLogs));
router.delete('/logs', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.clearLogs));

export default router;
