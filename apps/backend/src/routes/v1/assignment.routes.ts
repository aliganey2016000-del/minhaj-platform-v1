import { Router } from 'express';
import * as ctrl from '../../controllers/assignment.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

// Student self-service
router.get('/my', roleMiddleware(['student']), asyncHandler(ctrl.getMyAssignments));

// Admin/Teacher management
router.get('/', adminOrTeacher, asyncHandler(ctrl.getAll));
router.post('/', adminOnly, asyncHandler(ctrl.create));
router.patch('/:id', adminOnly, asyncHandler(ctrl.update));
router.patch('/:id/status', adminOnly, asyncHandler(ctrl.updateStatus));
router.delete('/:id', adminOnly, asyncHandler(ctrl.remove));

export default router;