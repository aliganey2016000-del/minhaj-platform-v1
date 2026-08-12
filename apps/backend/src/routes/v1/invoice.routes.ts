import { Router } from 'express';
import * as invoiceController from '../../controllers/invoice.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

// literal /generate-bulk and /collect-bulk routes MUST come before the /:id
// wildcard route.
router.post('/generate-bulk', adminOnly, asyncHandler(invoiceController.generateBulk));
router.post('/collect-bulk', adminOnly, asyncHandler(invoiceController.collectBulk));

router.get('/', adminOnly, asyncHandler(invoiceController.getAll));
router.post('/', adminOnly, asyncHandler(invoiceController.create));
router.get('/:id', adminOnly, asyncHandler(invoiceController.getOne));
router.post('/:id/collect-payment', adminOnly, asyncHandler(invoiceController.collectPayment));
router.patch('/:id/void', adminOnly, asyncHandler(invoiceController.voidInvoice));

export default router;
