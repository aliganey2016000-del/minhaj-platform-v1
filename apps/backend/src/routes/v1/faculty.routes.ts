import { Router } from 'express';
import * as facultyController from '../../controllers/faculty.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);
router.get('/', asyncHandler(facultyController.getAll));
router.post('/', adminOnly, asyncHandler(facultyController.create));
router.patch('/:id', adminOnly, asyncHandler(facultyController.update));
router.delete('/:id', adminOnly, asyncHandler(facultyController.remove));
export default router;
