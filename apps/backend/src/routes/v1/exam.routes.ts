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
router.post('/', adminOrTeacher, asyncHandler(examController.create));
router.patch('/:id', adminOrTeacher, asyncHandler(examController.update));
router.delete('/:id', adminOrTeacher, asyncHandler(examController.remove));
router.patch('/:id/status', adminOrTeacher, asyncHandler(examController.updateStatus));
router.patch('/:id/publish-results', adminOrTeacher, asyncHandler(examController.publishResults));

export default router;