import { Router } from 'express';
import * as ctrl from '../../controllers/whatsapp-analytics.controller';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.get('/summary', asyncHandler(ctrl.summary));

export default router;
