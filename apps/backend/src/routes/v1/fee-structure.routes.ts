import { Router } from 'express';
import * as feeStructureController from '../../controllers/fee-structure.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', adminOnly, asyncHandler(feeStructureController.getAll));
router.post('/', adminOnly, asyncHandler(feeStructureController.create));
router.get('/:id', adminOnly, asyncHandler(feeStructureController.getOne));
router.patch('/:id', adminOnly, asyncHandler(feeStructureController.update));
router.delete('/:id', adminOnly, asyncHandler(feeStructureController.remove));

export default router;
