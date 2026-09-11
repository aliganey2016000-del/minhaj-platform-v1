import { Router } from 'express';
import * as invoiceController from '../../controllers/invoice.controller';
import * as invoiceHistoryController from '../../controllers/invoice-history.controller';
import * as invoiceListController from '../../controllers/invoice-list.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.post('/generate-bulk', adminOnly, asyncHandler(invoiceController.generateBulk));
router.post('/collect-bulk', adminOnly, asyncHandler(invoiceController.collectBulk));
router.get('/batches', adminOnly, asyncHandler(invoiceController.getBatches));
router.post('/batches/:batchId/void', adminOnly, asyncHandler(invoiceController.voidBatch));
router.get('/my', roleMiddleware(['student']), asyncHandler(invoiceController.getMyInvoices));
router.get('/student/:studentId', roleMiddleware(['admin', 'org_admin', 'parent', 'student']), asyncHandler(invoiceController.getStudentInvoices));
router.get('/', adminOnly, asyncHandler(invoiceListController.getAll));
router.post('/', adminOnly, asyncHandler(invoiceController.create));
router.delete('/', adminOnly, asyncHandler(invoiceController.bulkDelete));
// The existing details UI now presents the complete invoice history for the student.
router.get('/:id', adminOnly, asyncHandler(invoiceHistoryController.getOne));
router.post('/:id/collect-payment', adminOnly, asyncHandler(invoiceController.collectPayment));
router.post('/:id/installments', adminOnly, asyncHandler(invoiceController.createInstallmentPlan));
router.post('/:id/correct', adminOnly, asyncHandler(invoiceController.correctInvoice));
router.post('/:id/request-payment', roleMiddleware(['parent', 'student']), asyncHandler(invoiceController.requestPayment));
router.patch('/:id/void', adminOnly, asyncHandler(invoiceController.voidInvoice));

export default router;