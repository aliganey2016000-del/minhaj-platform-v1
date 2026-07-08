import { Router } from 'express';
import * as resultController from '../../controllers/result.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', adminOrTeacher, asyncHandler(resultController.getAll));
router.post('/', adminOnly, asyncHandler(resultController.create));
router.post('/bulk', adminOnly, asyncHandler(resultController.bulkCreate));
router.patch('/:id', adminOnly, asyncHandler(resultController.update));
router.delete('/:id', adminOnly, asyncHandler(resultController.remove));

export default router;