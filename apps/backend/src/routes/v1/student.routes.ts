/**
 * Student Routes — /api/v1/students
 *
 * All routes require authentication.
 *
 * Admin/Org Admin/Teacher:
 *   GET    /                 — List all students (paginated, filterable)
 *   GET    /:id              — Get student by ID
 *   POST   /                 — Create student
 *   PATCH  /:id              — Update student
 *   DELETE /:id              — Delete student (moves to Trash)
 *   DELETE /bulk              — Bulk delete students (moves to Trash)
 *   POST   /import           — Bulk import students (transactional)
 *   GET    /export           — Export students (XLSX)
 *   GET    /template         — Download student import template (XLSX)
 *   GET    /stats            — Aggregate breakdowns for reporting
 *   GET    /report/export    — Export the analytics report (XLSX)
 *
 * Student (own data) + Parent (children data) + Admin/Teacher:
 *   GET    /:id/courses       — Get student's enrolled courses
 *   GET    /:id/attendance    — Get student's attendance summary
 *   GET    /:id/results       — Get student's results summary
 *   GET    /:id/payments      — Get student's payments summary
 *   GET    /:id/certificates  — Get student's certificates
 */

import { Router } from 'express';
import multer from 'multer';
import * as studentController from '../../controllers/student.controller';
import * as studentImportController from '../../controllers/student-import.controller';
import * as studentDocumentsController from '../../controllers/student-documents.controller';
import * as studentRegistrationController from '../../controllers/student-registration.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import {
  roleMiddleware,
  adminOnly,
  adminOrTeacher,
  anyAuthenticatedUser,
} from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import {
  validateStudentApprovalClass,
  validateStudentCreateClass,
  validateStudentUpdateClass,
} from '../../middleware/student-class-assignment.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authMiddleware);

router.get('/', adminOrTeacher, asyncHandler(studentController.getAll));
router.get('/stats', adminOrTeacher, asyncHandler(studentController.getStats));
router.get('/report/export', adminOnly, asyncHandler(studentController.exportReport as any));

router.post(
  '/',
  adminOnly,
  photoUpload.single('photo'),
  asyncHandler(validateStudentCreateClass),
  asyncHandler(studentController.create)
);

// Cohort-aware import: after promotion, two active classes may legitimately
// share Class Name + Section, so Academic Year / Batch Number disambiguate.
router.post(
  '/import',
  adminOnly,
  upload.single('file'),
  asyncHandler(studentImportController.bulkImport)
);

router.get('/document-types', anyAuthenticatedUser, asyncHandler(studentDocumentsController.getDocumentTypes));

router.post(
  '/:studentId/photo',
  adminOnly,
  photoUpload.single('photo'),
  asyncHandler(studentDocumentsController.uploadPhoto)
);

router.get('/:studentId/document-types', anyAuthenticatedUser, asyncHandler(studentDocumentsController.getDocumentTypes));
router.get('/:studentId/documents', anyAuthenticatedUser, asyncHandler(studentDocumentsController.list));
router.post('/:studentId/documents', adminOnly, upload.single('file'), asyncHandler(studentDocumentsController.upload));
router.get('/:studentId/documents/:documentId/view', anyAuthenticatedUser, asyncHandler(studentDocumentsController.view));
router.delete('/:studentId/documents/:documentId', adminOnly, asyncHandler(studentDocumentsController.remove));
router.patch('/:studentId/documents/:documentId', adminOnly, upload.single('file'), asyncHandler(studentDocumentsController.update));

router.get('/:studentId/registration', anyAuthenticatedUser, asyncHandler(studentRegistrationController.get));
router.post('/:studentId/registration', adminOnly, asyncHandler(studentRegistrationController.upsert));
router.patch('/:studentId/registration', adminOnly, asyncHandler(studentRegistrationController.upsert));

router.get('/export', adminOnly, asyncHandler(studentController.exportStudents as any));
router.get('/template', adminOnly, asyncHandler(studentImportController.downloadTemplate as any));

router.delete('/bulk', adminOnly, asyncHandler(studentController.bulkRemove));

router.get('/my/dashboard', roleMiddleware(['student']), asyncHandler(studentController.getMyDashboard));
router.get('/my/courses', roleMiddleware(['student']), asyncHandler(studentController.getMyCourses));
router.post('/my/progress', roleMiddleware(['student']), asyncHandler(studentController.recordProgress));

router.get('/:id', anyAuthenticatedUser, asyncHandler(studentController.getById));
router.patch('/:id', adminOnly, asyncHandler(validateStudentUpdateClass), asyncHandler(studentController.update));
router.delete('/:id', adminOnly, asyncHandler(studentController.remove));

router.get('/:id/courses', anyAuthenticatedUser, asyncHandler(studentController.getCourses));
router.get('/:id/attendance', anyAuthenticatedUser, asyncHandler(studentController.getAttendance));
router.get('/:id/results', anyAuthenticatedUser, asyncHandler(studentController.getResults));
router.get('/:id/payments', roleMiddleware(['admin', 'student', 'parent']), asyncHandler(studentController.getPayments));
router.patch('/:id/approve', adminOnly, asyncHandler(validateStudentApprovalClass), asyncHandler(studentController.approve));
router.patch('/:id/reject', adminOnly, asyncHandler(studentController.reject));
router.get('/:id/certificates', roleMiddleware(['admin', 'student', 'parent']), asyncHandler(studentController.getCertificates));

export default router;
