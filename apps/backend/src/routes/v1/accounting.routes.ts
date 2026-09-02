import { Router } from 'express';
import * as accountingController from '../../controllers/accounting.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { financialManager, financialRead } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

authMiddleware;
const router = Router();
router.use(authMiddleware);

router.get('/accounts', financialRead, asyncHandler(accountingController.getAccountsController));
router.post('/accounts/seed-defaults', financialManager, asyncHandler(accountingController.seedDefaultAccounts));
router.get('/journals', financialRead, asyncHandler(accountingController.getJournals));
router.post('/journals', financialManager, asyncHandler(accountingController.createJournal));
router.get('/trial-balance', financialRead, asyncHandler(accountingController.getTrialBalanceController));

export default router;
