import { Router } from 'express';
import multer from 'multer';
import * as examController from '../../controllers/exam.controller';
import * as seatController from '../../controllers/seat-allocation.controller';
import * as seatImportController from '../../controllers/seat-allocation-import.controller';
import * as masterSeatController from '../../controllers/exam-seating-plan.controller';
import * as autoSeatController from '../../controllers/exam-seating-auto.controller';
import * as examAttendanceController from '../../controllers/exam-attendance.controller';
import * as paperController from '../../controllers/exam-paper.controller';
import * as appealController from '../../controllers/exam-appeal.controller';
import * as attemptController from '../../controllers/exam-attempt.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();
router.use(authMiddleware);

router.get('/my', roleMiddleware(['student']), asyncHandler(examController.getMyExams));
router.get('/browse', roleMiddleware(['student']), asyncHandler(examController.browseExams));
router.get('/my/seating', roleMiddleware(['student']), asyncHandler(seatController.getMySeating));
router.get('/my/attendance', roleMiddleware(['student']), asyncHandler(examAttendanceController.getMyHistory));
router.get('/my/active', roleMiddleware(['student']), asyncHandler(attemptController.getActiveExams));
router.get('/my/appeals', roleMiddleware(['student']), asyncHandler(appealController.getMy));
router.get('/attendance/aggregate', adminOrTeacher, asyncHandler(examAttendanceController.getAggregateReport));

router.post('/bulk-delete', adminOrTeacher, asyncHandler(examController.bulkRemove));
router.get('/export', adminOrTeacher, asyncHandler(examController.exportData as any));
router.get('/template', adminOrTeacher, asyncHandler(examController.downloadTemplate as any));
router.get('/seating-template', adminOrTeacher, asyncHandler(masterSeatController.downloadTemplate));
router.post('/import', adminOrTeacher, upload.single('file'), asyncHandler(examController.bulkImport));

// Master seating: one room + seat for every student across all subjects in an exam period.
router.get('/seating-plan', adminOrTeacher, asyncHandler(masterSeatController.list));
router.get('/seating-plan/rooms', adminOrTeacher, asyncHandler(masterSeatController.rooms));
router.post('/seating-plan', adminOrTeacher, asyncHandler(masterSeatController.add));
router.patch('/seating-plan/:id', adminOrTeacher, asyncHandler(masterSeatController.update));
router.delete('/seating-plan/:id', adminOrTeacher, asyncHandler(masterSeatController.remove));
router.post('/seating-plan/import-preview', adminOrTeacher, upload.single('file'), asyncHandler(masterSeatController.previewImport));
router.post('/seating-plan/import', adminOrTeacher, upload.single('file'), asyncHandler(masterSeatController.importExcel));
// Automatic room assignment changes many student records at once, so only
// administrators may execute it. org_admin is tenant-scoped inside the controller.
router.post('/seating-plan/auto-generate', adminOnly, asyncHandler(autoSeatController.generate));

router.get('/', adminOrTeacher, asyncHandler(examController.getAll));
router.post('/', adminOrTeacher, asyncHandler(examController.create));
router.get('/:id', adminOrTeacher, asyncHandler(examController.getById));
router.patch('/:id', adminOrTeacher, asyncHandler(examController.update));
router.delete('/:id', adminOrTeacher, asyncHandler(examController.remove));
router.patch('/:id/status', adminOrTeacher, asyncHandler(examController.updateStatus));
router.patch('/:id/publish-results', adminOrTeacher, asyncHandler(examController.publishResults));

router.get('/:id/seating', adminOrTeacher, asyncHandler(seatController.getForExam));
router.get('/:id/seating/candidates', adminOrTeacher, asyncHandler(seatController.getCandidates));
router.post('/:id/seating', adminOrTeacher, asyncHandler(seatController.create));
router.post('/:id/seating/generate', adminOrTeacher, asyncHandler(seatController.generate));
router.post('/:id/seating/import-preview', adminOrTeacher, upload.single('file'), asyncHandler(seatImportController.previewImport));
router.post('/:id/seating/import', adminOrTeacher, upload.single('file'), asyncHandler(seatImportController.importSeating));
router.patch('/:id/seating/:allocationId', adminOrTeacher, asyncHandler(seatController.update));
router.delete('/:id/seating', adminOrTeacher, asyncHandler(seatController.clearForExam));

router.get('/:id/attendance', adminOrTeacher, asyncHandler(examAttendanceController.getForExam));
router.post('/:id/attendance', adminOrTeacher, asyncHandler(examAttendanceController.bulkMark));
router.get('/:id/attendance/:studentId/logs', adminOrTeacher, asyncHandler(examAttendanceController.getAuditLogs));
router.get('/:id/paper', adminOrTeacher, asyncHandler(paperController.getForExam));
router.put('/:id/paper', adminOrTeacher, asyncHandler(paperController.upsert));
router.post('/:id/paper/submit', adminOrTeacher, asyncHandler(paperController.submit));
router.patch('/:id/paper/review', adminOrTeacher, asyncHandler(paperController.review));
router.post('/:id/appeals', roleMiddleware(['student']), asyncHandler(appealController.create));
router.post('/:id/attempt/start', roleMiddleware(['student']), asyncHandler(attemptController.start));
router.get('/:id/attempt', roleMiddleware(['student']), asyncHandler(attemptController.getMine));
router.patch('/:id/attempt', roleMiddleware(['student']), asyncHandler(attemptController.saveAnswers));
router.post('/:id/attempt/submit', roleMiddleware(['student']), asyncHandler(attemptController.submit));
router.get('/:id/review', roleMiddleware(['student']), asyncHandler(attemptController.getReview));
export default router;
