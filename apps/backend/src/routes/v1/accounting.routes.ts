import { Router } from 'express';
import * as accountingController from '../../controllers/accounting.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { financialManager, financialRead } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/accounts', financialRead, asyncHandler(accountingController.getAccountsController));
router.post('/accounts/seed-defaults', financialManager, asyncHandler(accountingController.seedDefaultAccounts));
router.get('/journals', financialRead, asyncHandler(accountingController.getJournals));
router.post('/journals', financialManager, asyncHandler(accountingController.createJournal));
router.get('/trial-balance', financialRead, asyncHandler(accountingController.getTrialBalanceController));
router.get('/reports/profit-and-loss', financialRead, asyncHandler(accountingController.getProfitAndLossController));
router.get('/reports/balance-sheet', financialRead, asyncHandler(accountingController.getBalanceSheetController));
router.get('/reports/ar-aging', financialRead, asyncHandler(accountingController.getArAgingController));
router.get('/reports/cash-position', financialRead, asyncHandler(accountingController.getCashPositionController));

export default router;
