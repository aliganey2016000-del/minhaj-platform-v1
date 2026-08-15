import { Router } from 'express';
import * as reportController from '../../controllers/report.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware, adminOnly);

router.get('/collection', asyncHandler(reportController.getCollectionReport));
router.get('/reconciliation', asyncHandler(reportController.getCashierReconciliation));
router.get('/overdue', asyncHandler(reportController.getOverdueInvoices));
router.post('/send-reminders', asyncHandler(reportController.sendOverdueReminders));
router.get('/export', asyncHandler(reportController.exportReport));

export default router;
