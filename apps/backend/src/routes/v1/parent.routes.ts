import { Router } from 'express';
import * as parentController from '../../controllers/parent.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);
router.use(adminOnly);

router.get('/', asyncHandler(parentController.getAll));
router.get('/:id', asyncHandler(parentController.getById));
router.post('/', asyncHandler(parentController.create));
router.patch('/:id', asyncHandler(parentController.update));
router.delete('/:id', asyncHandler(parentController.remove));
router.patch('/:id/status', asyncHandler(parentController.updateStatus));
router.get('/:id/children', asyncHandler(parentController.getChildren));
router.post('/:id/link-child', asyncHandler(parentController.linkChild));
router.post('/:id/unlink-child', asyncHandler(parentController.unlinkChild));

export default router;