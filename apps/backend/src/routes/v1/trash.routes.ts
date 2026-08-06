import { Router } from 'express';
import * as trashController from '../../controllers/trash.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);
router.use(adminOnly);

router.get('/', asyncHandler(trashController.getAll));
router.post('/:id/restore', asyncHandler(trashController.restore));
router.delete('/:id', asyncHandler(trashController.purge));
router.delete('/', asyncHandler(trashController.empty));

export default router;
