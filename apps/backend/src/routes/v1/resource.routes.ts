import { Router } from 'express';
import * as ctrl from '../../controllers/resource.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/my', roleMiddleware(['student']), asyncHandler(ctrl.getMyDownloads));
router.get('/', adminOnly, asyncHandler(ctrl.getAll));
router.post('/', adminOnly, asyncHandler(ctrl.create));
router.delete('/:id', adminOnly, asyncHandler(ctrl.remove));

export default router;