/**
 * Student Routes — /api/v1/students
 *
 * All routes require authentication.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import * as studentController from '../../controllers/student.controller';
import * as studentPerformanceController from '../../controllers/student-performance.controller';
import * as studentRegistrationIoController from '../../controllers/student-registration-io.controller';
import * as studentRegistrationTemplateController from '../../controllers/student-registration-template.controller';
import * as studentDocumentsController from '../../controllers/student-documents.controller';
import * as studentRegistrationController from '../../controllers/student-registration.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware, adminOnly, adminOrTeacher, anyAuthenticatedUser } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { validateStudentApprovalClass, validateStudentCreateClass, validateStudentUpdateClass } from '../../middleware/student-class-assignment.middleware';
import { prepareStudentCreateDefaults, prepareStudentUpdateDefaults } from '../../middleware/student-registration-defaults.middleware';
import { requireStudentEmailForCreate, requireStudentEmailInImport } from '../../middleware/student-email-required.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

function keepLargeImportConnectionAlive(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('\n');

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.headersSent) {
      if (!res.writableEnded) res.end(JSON.stringify(body));
      return res;
    }
    return originalJson(body);
  }) as typeof res.json;

  const heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) return;
    res.write(' \n');
    const flush = (res as Response & { flush?: () => void }).flush;
    if (typeof flush === 'function') flush.call(res);
  }, 5000);

  const stopHeartbeat = () => clearInterval(heartbeat);
  res.once('finish', stopHeartbeat);
  res.once('close', stopHeartbeat);
  next();
}

router.use(authMiddleware);

router.get('/', adminOrTeacher, asyncHandler(studentController.getAll));
router.get('/stats', adminOrTeacher, asyncHandler(studentController.getStats));
router.get('/report/export', adminOnly, asyncHandler(studentController.exportReport as any));

router.post(
  '/',
  adminOnly,
  photoUpload.single('photo'),
  asyncHandler(requireStudentEmailForCreate),
  asyncHandler(prepareStudentCreateDefaults),
  asyncHandler(validateStudentCreateClass),
  asyncHandler(studentController.create)
);

router.post(
  '/import/preview',
  adminOnly,
  upload.single('file'),
  asyncHandler(requireStudentEmailInImport),
  asyncHandler(studentRegistrationIoController.previewImport)
);

router.post(
  '/import',
  adminOnly,
  upload.single('file'),
  asyncHandler(requireStudentEmailInImport),
  keepLargeImportConnectionAlive,
  asyncHandler(studentRegistrationIoController.bulkImport)
);

router.get('/document-types', anyAuthenticatedUser, asyncHandler(studentDocumentsController.getDocumentTypes));
router.post('/:studentId/photo', adminOnly, photoUpload.single('photo'), asyncHandler(studentDocumentsController.uploadPhoto));
router.get('/:studentId/document-types', anyAuthenticatedUser, asyncHandler(studentDocumentsController.getDocumentTypes));
router.get('/:studentId/documents', anyAuthenticatedUser, asyncHandler(studentDocumentsController.list));
router.post('/:studentId/documents', adminOnly, upload.single('file'), asyncHandler(studentDocumentsController.upload));
router.get('/:studentId/documents/:documentId/view', anyAuthenticatedUser, asyncHandler(studentDocumentsController.view));
router.delete('/:studentId/documents/:documentId', adminOnly, asyncHandler(studentDocumentsController.remove));
router.patch('/:studentId/documents/:documentId', adminOnly, upload.single('file'), asyncHandler(studentDocumentsController.update));
router.get('/:studentId/registration', anyAuthenticatedUser, asyncHandler(studentRegistrationController.get));
router.post('/:studentId/registration', adminOnly, asyncHandler(studentRegistrationController.upsert));
router.patch('/:studentId/registration', adminOnly, asyncHandler(studentRegistrationController.upsert));
router.get('/export', adminOnly, asyncHandler(studentRegistrationIoController.exportStudents as any));
router.get('/template', adminOnly, asyncHandler(studentRegistrationTemplateController.downloadTemplate as any));
router.delete('/bulk', adminOnly, asyncHandler(studentController.bulkRemove));

router.get('/my/dashboard', roleMiddleware(['student']), asyncHandler(studentController.getMyDashboard));
router.get('/my/courses', roleMiddleware(['student']), asyncHandler(studentController.getMyCourses));
router.get('/my/performance', roleMiddleware(['student']), asyncHandler(studentPerformanceController.getMyPerformance));
router.get(
  '/my/performance/attempt/:type/:id',
  roleMiddleware(['student']),
  asyncHandler(studentPerformanceController.getMyAttemptDetail)
);
router.post('/my/progress', roleMiddleware(['student']), asyncHandler(studentController.recordProgress));

router.get('/:id', anyAuthenticatedUser, asyncHandler(studentController.getById));
router.patch(
  '/:id',
  adminOnly,
  asyncHandler(prepareStudentUpdateDefaults),
  asyncHandler(validateStudentUpdateClass),
  asyncHandler(studentController.update)
);
router.delete('/:id', adminOnly, asyncHandler(studentController.remove));

router.get('/:id/courses', anyAuthenticatedUser, asyncHandler(studentController.getCourses));
router.get('/:id/attendance', anyAuthenticatedUser, asyncHandler(studentController.getAttendance));
router.get('/:id/results', anyAuthenticatedUser, asyncHandler(studentController.getResults));
router.get('/:id/payments', roleMiddleware(['admin', 'student', 'parent']), asyncHandler(studentController.getPayments));
router.patch('/:id/approve', adminOnly, asyncHandler(validateStudentApprovalClass), asyncHandler(studentController.approve));
router.patch('/:id/reject', adminOnly, asyncHandler(studentController.reject));
router.get('/:id/certificates', roleMiddleware(['admin', 'student', 'parent']), asyncHandler(studentController.getCertificates));

export default router;
