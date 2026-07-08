import { Router } from 'express';
import * as ctrl from '../../controllers/notification.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware, adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

// Student self-service
router.get('/my', roleMiddleware(['student']), asyncHandler(ctrl.getMyNotifications));
router.patch('/read-all', roleMiddleware(['student']), asyncHandler(ctrl.markAllRead));
router.patch('/:id/read', roleMiddleware(['student']), asyncHandler(ctrl.markAsRead));
router.delete('/:id', roleMiddleware(['student']), asyncHandler(ctrl.remove));

// Admin can create notifications
router.post('/', adminOnly, asyncHandler(ctrl.create));

export default router;