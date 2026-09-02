import { Router } from 'express';
import * as controller from '../../controllers/cash-session.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { financialOperator, financialRead } from '../../middleware/role.middleware';
import { auditLoggingMiddleware, AUDITED_ACTIONS } from '../../utils/audit-logger';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', financialRead, asyncHandler(controller.getAll));
router.get('/current', financialOperator, asyncHandler(controller.getCurrent));
router.post('/open', financialOperator, auditLoggingMiddleware(AUDITED_ACTIONS.CASH_SESSION_OPENED, 'CashSession'), asyncHandler(controller.openSession));
router.post('/:id/close', financialOperator, auditLoggingMiddleware(AUDITED_ACTIONS.CASH_SESSION_CLOSED, 'CashSession'), asyncHandler(controller.closeSession));

export default router;
