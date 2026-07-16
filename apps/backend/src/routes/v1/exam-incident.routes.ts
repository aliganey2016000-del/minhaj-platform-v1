import { Router } from 'express';
import * as incidentController from '../../controllers/exam-incident.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);
router.use(adminOrTeacher);

router.get('/', asyncHandler(incidentController.getAll));
router.post('/', asyncHandler(incidentController.create));
router.patch('/:id', asyncHandler(incidentController.update));

export default router;
