import { Router } from 'express';
import * as userController from '../../controllers/user.controller';
import * as employeeProfileController from '../../controllers/employee-profile.controller';
import * as staffDirectoryController from '../../controllers/staff-directory.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['admin', 'org_admin']));

router.get('/', asyncHandler(userController.getAll));
router.get('/permissions/catalog', asyncHandler(userController.getPermissionCatalog));
router.get('/sidebar/catalog', asyncHandler(userController.getSidebarCatalog));
router.get('/staff/directory', asyncHandler(staffDirectoryController.list));
router.get('/staff/export', asyncHandler(userController.exportStaff));
router.get('/staff/template', asyncHandler(userController.downloadStaffTemplate));
router.post('/staff/import', upload.single('file'), asyncHandler(userController.importStaff));
router.get('/:id/employee-profile', asyncHandler(employeeProfileController.get));
router.patch('/:id/employee-profile', asyncHandler(employeeProfileController.upsert));
router.get('/:id', asyncHandler(userController.getById));
router.post('/', asyncHandler(userController.create));
router.patch('/:id', asyncHandler(userController.update));
router.patch('/:id/permissions', asyncHandler(userController.updatePermissions));
router.patch('/:id/sidebar-access', asyncHandler(userController.updateSidebarAccess));
router.delete('/:id', asyncHandler(userController.remove));

export default router;
