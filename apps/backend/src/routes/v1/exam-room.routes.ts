import { Router } from 'express';
import * as examRoomController from '../../controllers/exam-room.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);
router.use(adminOrTeacher);

router.get('/', asyncHandler(examRoomController.getAll));
router.post('/', asyncHandler(examRoomController.create));
router.patch('/:id', asyncHandler(examRoomController.update));
router.delete('/:id', asyncHandler(examRoomController.remove));

export default router;
