import { Router } from 'express';
import * as examController from '../../controllers/exam.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', adminOrTeacher, asyncHandler(examController.getAll));
router.get('/my', roleMiddleware(['student']), asyncHandler(examController.getMyExams));
router.get('/:id', adminOrTeacher, asyncHandler(examController.getById));
router.post('/', adminOnly, asyncHandler(examController.create));
router.patch('/:id', adminOnly, asyncHandler(examController.update));
router.delete('/:id', adminOnly, asyncHandler(examController.remove));
router.patch('/:id/status', adminOnly, asyncHandler(examController.updateStatus));

export default router;