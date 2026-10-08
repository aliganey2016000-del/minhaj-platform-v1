import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import * as controller from '../../controllers/guuldoon-import.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 120 * 1024 * 1024, files: 2 },
});

router.get('/template', asyncHandler(controller.downloadTemplate));
router.get('/batches/:batchId/errors', asyncHandler(controller.downloadErrorReport));
router.get('/courses/:courseId/history', asyncHandler(controller.history));
router.post(
  '/courses/:courseId/validate',
  upload.fields([{ name: 'excel', maxCount: 1 }, { name: 'figures', maxCount: 1 }]),
  asyncHandler(controller.validateImport),
);
router.post(
  '/courses/:courseId/commit',
  upload.fields([{ name: 'excel', maxCount: 1 }, { name: 'figures', maxCount: 1 }]),
  asyncHandler(controller.commitImport),
);

export default router;
