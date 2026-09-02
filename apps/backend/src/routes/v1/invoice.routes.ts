import { Router } from 'express';
import * as invoiceController from '../../controllers/invoice.controller';
import * as invoiceListController from '../../controllers/invoice-list.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

// literal /generate-bulk, /collect-bulk, /my, /student/:studentId routes
// MUST come before the /:id wildcard route.
router.post('/generate-bulk', adminOnly, asyncHandler(invoiceController.generateBulk));
router.post('/collect-bulk', adminOnly, asyncHandler(invoiceController.collectBulk));
router.get('/batches', adminOnly, asyncHandler(invoiceController.getBatches));
router.post('/batches/:batchId/void', adminOnly, asyncHandler(invoiceController.voidBatch));
router.get('/my', roleMiddleware(['student']), asyncHandler(invoiceController.getMyInvoices));

// Admin / org_admin / parent / student — ownership enforced in the controller.
router.get('/student/:studentId', roleMiddleware(['admin', 'org_admin', 'parent', 'student']), asyncHandler(invoiceController.getStudentInvoices));

router.get('/', adminOnly, asyncHandler(invoiceListController.getAll));
router.post('/', adminOnly, asyncHandler(invoiceController.create));
router.delete('/', adminOnly, asyncHandler(invoiceController.bulkDelete));
router.get('/:id', adminOnly, asyncHandler(invoiceController.getOne));
router.post('/:id/collect-payment', adminOnly, asyncHandler(invoiceController.collectPayment));
router.post('/:id/request-payment', roleMiddleware(['parent', 'student']), asyncHandler(invoiceController.requestPayment));
router.patch('/:id/void', adminOnly, asyncHandler(invoiceController.voidInvoice));

export default router;
