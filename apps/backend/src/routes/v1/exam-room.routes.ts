import { Router } from 'express';
import multer from 'multer';
import * as examRoomController from '../../controllers/exam-room.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

router.use(authMiddleware);
router.use(adminOrTeacher);

router.get('/', asyncHandler(examRoomController.getAll));
router.get('/export', adminOnly, asyncHandler(examRoomController.exportRooms));
router.post('/import', adminOnly, upload.single('file'), asyncHandler(examRoomController.importRooms));
router.post('/', adminOnly, asyncHandler(examRoomController.create));
router.patch('/:id', adminOnly, asyncHandler(examRoomController.update));
router.delete('/:id', adminOnly, asyncHandler(examRoomController.remove));

export default router;
