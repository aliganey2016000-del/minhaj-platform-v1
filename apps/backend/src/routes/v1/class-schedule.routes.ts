import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../../controllers/class-schedule.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

// ---------------------------------------------------------------------------
// Multer configuration — Excel/CSV bulk import, held in memory. 10 MB limit.
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authMiddleware);

// Admin/Teacher: full CRUD
router.get('/', adminOrTeacher, asyncHandler(ctrl.getAll));
router.post('/', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.create));
router.post('/bulk-import', roleMiddleware(['admin', 'org_admin']), upload.single('file'), asyncHandler(ctrl.bulkImport));
router.post('/import', roleMiddleware(['admin', 'org_admin']), upload.single('file'), asyncHandler(ctrl.bulkImportTransactional));
router.get('/export', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.exportSchedules as any));
router.get('/template', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.downloadTemplate as any));
router.get('/my', roleMiddleware(['student']), asyncHandler(ctrl.getMySchedules));
router.get('/my-teaching', roleMiddleware(['teacher']), asyncHandler(ctrl.getMyScheduleAsTeacher));
router.get('/status/:courseId', roleMiddleware(['admin', 'org_admin', 'teacher']), asyncHandler(ctrl.checkScheduleStatus));
router.get('/:id', adminOrTeacher, asyncHandler(ctrl.getById));
router.put('/:id', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.update));
router.delete('/:id', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.remove));

export default router;