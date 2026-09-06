import { Router } from 'express';
import * as departmentController from '../../controllers/department.controller';
import * as facultyController from '../../controllers/faculty.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/faculties', asyncHandler(facultyController.getAll));
router.post('/faculties', adminOnly, asyncHandler(facultyController.create));
router.patch('/faculties/:id', adminOnly, asyncHandler(facultyController.update));
router.delete('/faculties/:id', adminOnly, asyncHandler(facultyController.remove));

router.get('/', asyncHandler(departmentController.getAll));
router.post('/', adminOnly, asyncHandler(departmentController.create));
router.patch('/:id', adminOnly, asyncHandler(departmentController.update));
router.delete('/:id', adminOnly, asyncHandler(departmentController.remove));

export default router;
