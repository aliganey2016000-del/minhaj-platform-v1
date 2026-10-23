import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import * as controller from '../../controllers/exam-passcard.controller';

const router = Router();

router.get('/context', asyncHandler(controller.context));
router.get('/', asyncHandler(controller.list));
router.post('/', asyncHandler(controller.create));
router.post('/:id/issue', asyncHandler(controller.issue));
router.delete('/:id', asyncHandler(controller.revoke));

export default router;
