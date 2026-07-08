import { Router } from 'express';
import * as classController from '../../controllers/class.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', adminOrTeacher, asyncHandler(classController.getAll));
router.post('/', adminOnly, asyncHandler(classController.create));
router.patch('/:id', adminOnly, asyncHandler(classController.update));
router.delete('/:id', adminOnly, asyncHandler(classController.remove));
router.patch('/:id/status', adminOnly, asyncHandler(classController.updateStatus));
router.get('/schedule/:courseId', asyncHandler(classController.getSchedule));

export default router;