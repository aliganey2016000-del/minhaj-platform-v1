import { Router } from 'express';
import * as certificateController from '../../controllers/certificate.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/my', roleMiddleware(['student']), asyncHandler(certificateController.getMyCertificates));
router.get('/', adminOrTeacher, asyncHandler(certificateController.getAll));
router.get('/:id', asyncHandler(certificateController.getAll)); // fallback — detailed get is via getAll with params
router.post('/', adminOnly, asyncHandler(certificateController.create));
router.patch('/:id', adminOnly, asyncHandler(certificateController.update));
router.patch('/:id/status', adminOnly, asyncHandler(certificateController.updateStatus));
router.delete('/:id', adminOnly, asyncHandler(certificateController.remove));

// Student/Parent can view their own
router.get('/student/:studentId', roleMiddleware(['admin', 'teacher', 'student', 'parent']), asyncHandler((req, res) => {
  req.query.studentId = req.params.studentId;
  return certificateController.getAll(req, res);
}));

export default router;