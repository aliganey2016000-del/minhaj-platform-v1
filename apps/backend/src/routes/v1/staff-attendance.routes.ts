import { Router } from 'express';
import * as controller from '../../controllers/staff-attendance.controller';
import { roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(roleMiddleware(['admin', 'org_admin']));
router.get('/', asyncHandler(controller.getForDate));
router.post('/', asyncHandler(controller.mark));
router.get('/history', asyncHandler(controller.history));

export default router;
