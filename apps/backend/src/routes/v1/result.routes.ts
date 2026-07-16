import { Router } from 'express';
import * as resultController from '../../controllers/result.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', adminOrTeacher, asyncHandler(resultController.getAll));
router.get('/my', roleMiddleware(['student']), asyncHandler(resultController.getMyResults));
router.post('/', adminOrTeacher, asyncHandler(resultController.create));
router.post('/bulk', adminOrTeacher, asyncHandler(resultController.bulkCreate));
router.patch('/:id', adminOrTeacher, asyncHandler(resultController.update));
router.delete('/:id', adminOrTeacher, asyncHandler(resultController.remove));

export default router;