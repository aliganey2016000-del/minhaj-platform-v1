import { Router } from 'express';
import * as controller from '../../controllers/finance-reconciliation.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { financialManager, financialRead } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/accounts', financialRead, asyncHandler(controller.getAccounts));
router.get('/preview/:accountId', financialRead, asyncHandler(controller.preview));
router.get('/', financialRead, asyncHandler(controller.list));
router.post('/', financialManager, asyncHandler(controller.create));
router.post('/:id/reconcile', financialManager, asyncHandler(controller.reconcile));

export default router;
