import { Router } from 'express';
import * as teacherController from '../../controllers/teacher.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);
router.use(adminOnly);

router.get('/', asyncHandler(teacherController.getAll));
router.get('/:id', asyncHandler(teacherController.getById));
router.post('/', asyncHandler(teacherController.create));
router.patch('/:id', asyncHandler(teacherController.update));
router.delete('/:id', asyncHandler(teacherController.remove));
router.patch('/:id/status', asyncHandler(teacherController.updateStatus));

export default router;