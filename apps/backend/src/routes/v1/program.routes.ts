import { Router } from 'express';
import * as programController from '../../controllers/program.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);
router.get('/', asyncHandler(programController.getAll));
router.post('/', adminOnly, asyncHandler(programController.create));
router.patch('/:id', adminOnly, asyncHandler(programController.update));
router.delete('/:id', adminOnly, asyncHandler(programController.remove));
export default router;
