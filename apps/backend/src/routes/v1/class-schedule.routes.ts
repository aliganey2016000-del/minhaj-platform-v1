import { Router } from 'express';
import * as ctrl from '../../controllers/class-schedule.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

// Admin/Teacher: full CRUD
router.get('/', adminOrTeacher, asyncHandler(ctrl.getAll));
router.post('/', roleMiddleware(['admin']), asyncHandler(ctrl.create));
router.get('/my', roleMiddleware(['student']), asyncHandler(ctrl.getMySchedules));
router.get('/status/:courseId', roleMiddleware(['admin', 'teacher']), asyncHandler(ctrl.checkScheduleStatus));
router.get('/:id', adminOrTeacher, asyncHandler(ctrl.getById));
router.put('/:id', roleMiddleware(['admin']), asyncHandler(ctrl.update));
router.delete('/:id', roleMiddleware(['admin']), asyncHandler(ctrl.remove));

export default router;