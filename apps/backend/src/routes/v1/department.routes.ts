import { Router } from 'express';
import multer from 'multer';
import * as departmentController from '../../controllers/department.controller';
import * as facultyController from '../../controllers/faculty.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.use(authMiddleware);

router.get('/faculties', asyncHandler(facultyController.getAll));
router.post('/faculties', adminOnly, asyncHandler(facultyController.create));
router.patch('/faculties/:id', adminOnly, asyncHandler(facultyController.update));
router.delete('/faculties/:id', adminOnly, asyncHandler(facultyController.remove));

router.get('/', asyncHandler(departmentController.getAll));
router.post('/', adminOnly, asyncHandler(departmentController.create));
router.post('/import', adminOnly, upload.single('file'), asyncHandler(departmentController.bulkImport));
router.get('/export', adminOnly, asyncHandler(departmentController.exportDepartments as any));
router.get('/template', adminOnly, asyncHandler(departmentController.downloadTemplate as any));
router.patch('/:id', adminOnly, asyncHandler(departmentController.update));
router.delete('/:id', adminOnly, asyncHandler(departmentController.remove));

export default router;
