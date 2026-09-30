import { Router } from 'express';
import * as controller from '../../controllers/staff-attendance.controller';
import { roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(roleMiddleware(['admin', 'org_admin']));

router.get('/settings', asyncHandler(controller.getSettings));
router.put('/settings', asyncHandler(controller.updateSettings));
router.delete('/teachers/:userId/face', asyncHandler(controller.resetTeacherFace));
router.get('/history', asyncHandler(controller.history));
router.get('/', asyncHandler(controller.getForDate));
router.post('/', asyncHandler(controller.mark));

export default router;
