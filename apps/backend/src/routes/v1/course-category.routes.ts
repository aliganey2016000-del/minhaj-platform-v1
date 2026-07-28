import { Router } from 'express';
import * as courseCategoryController from '../../controllers/course-category.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(courseCategoryController.getAll));
router.post('/', adminOnly, asyncHandler(courseCategoryController.create));
router.put('/:id', adminOnly, asyncHandler(courseCategoryController.update));
router.delete('/:id', adminOnly, asyncHandler(courseCategoryController.remove));

export default router;
