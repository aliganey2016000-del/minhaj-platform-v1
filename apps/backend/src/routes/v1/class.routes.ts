import { Router } from 'express';
import multer from 'multer';
import * as classController from '../../controllers/class.controller';
import * as curriculumPromotionController from '../../controllers/curriculum-promotion.controller';
import * as academicStructureController from '../../controllers/academic-structure.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { syncClassExamRoom } from '../../middleware/class-room-sync.middleware';
import { validateAcademicClass } from '../../middleware/academic-class.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

router.use(authMiddleware);
router.get('/', adminOrTeacher, asyncHandler(classController.getAll));
router.get('/browse', roleMiddleware(['admin', 'org_admin', 'teacher', 'student']), asyncHandler(classController.browseClasses));
router.get('/academic-structure', adminOnly, asyncHandler(academicStructureController.getStructure));
router.patch('/academic-structure', adminOnly, asyncHandler(academicStructureController.updateStructure));
router.post('/advance-semester', adminOnly, asyncHandler(academicStructureController.advanceSemester));
router.post('/', adminOnly, validateAcademicClass, syncClassExamRoom, asyncHandler(classController.create));
router.post('/import', adminOnly, upload.single('file'), asyncHandler(classController.bulkImport));
router.get('/export', adminOnly, asyncHandler(classController.exportClasses as any));
router.get('/template', adminOnly, asyncHandler(classController.downloadTemplate as any));
router.delete('/bulk', adminOnly, asyncHandler(classController.bulkRemove));
router.patch('/:id', adminOnly, validateAcademicClass, syncClassExamRoom, asyncHandler(classController.update));
router.delete('/:id', adminOnly, asyncHandler(classController.remove));
router.patch('/:id/status', adminOnly, asyncHandler(classController.updateStatus));
router.get('/schedule/:courseId', asyncHandler(classController.getSchedule));
router.get('/promotion-preview', adminOnly, asyncHandler(curriculumPromotionController.getPromotionPreview));
router.post('/promote-all', adminOnly, asyncHandler(curriculumPromotionController.promoteAll));
router.get('/promotion-target', adminOnly, asyncHandler(curriculumPromotionController.validatePromotionTarget));

export default router;
