import { Router } from 'express';
import * as examController from '../../controllers/exam.controller';
import * as seatController from '../../controllers/seat-allocation.controller';
import * as examAttendanceController from '../../controllers/exam-attendance.controller';
import * as paperController from '../../controllers/exam-paper.controller';
import * as appealController from '../../controllers/exam-appeal.controller';
import * as attemptController from '../../controllers/exam-attempt.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

// ---------------------------------------------------------------------------
// IMPORTANT: literal /my/* routes MUST come before the /:id wildcard routes
// below, otherwise Express would match "my" as an exam :id.
// ---------------------------------------------------------------------------

router.get('/my', roleMiddleware(['student']), asyncHandler(examController.getMyExams));
router.get('/my/seating', roleMiddleware(['student']), asyncHandler(seatController.getMySeating));
router.get('/my/attendance', roleMiddleware(['student']), asyncHandler(examAttendanceController.getMyHistory));
router.get('/my/active', roleMiddleware(['student']), asyncHandler(attemptController.getActiveExams));
router.get('/my/appeals', roleMiddleware(['student']), asyncHandler(appealController.getMy));

router.get('/', adminOrTeacher, asyncHandler(examController.getAll));
router.post('/', adminOrTeacher, asyncHandler(examController.create));
router.get('/:id', adminOrTeacher, asyncHandler(examController.getById));
router.patch('/:id', adminOrTeacher, asyncHandler(examController.update));
router.delete('/:id', adminOrTeacher, asyncHandler(examController.remove));
router.patch('/:id/status', adminOrTeacher, asyncHandler(examController.updateStatus));
router.patch('/:id/publish-results', adminOrTeacher, asyncHandler(examController.publishResults));

// ── Room / Seat Allocation ──
router.get('/:id/seating', adminOrTeacher, asyncHandler(seatController.getForExam));
router.post('/:id/seating/generate', adminOrTeacher, asyncHandler(seatController.generate));
router.patch('/:id/seating/:allocationId', adminOrTeacher, asyncHandler(seatController.update));
router.delete('/:id/seating', adminOrTeacher, asyncHandler(seatController.clearForExam));

// ── Exam-day Attendance ──
router.get('/:id/attendance', adminOrTeacher, asyncHandler(examAttendanceController.getForExam));
router.post('/:id/attendance', adminOrTeacher, asyncHandler(examAttendanceController.bulkMark));

// ── Papers & Approval ──
router.get('/:id/paper', adminOrTeacher, asyncHandler(paperController.getForExam));
router.put('/:id/paper', adminOrTeacher, asyncHandler(paperController.upsert));
router.post('/:id/paper/submit', adminOrTeacher, asyncHandler(paperController.submit));
router.patch('/:id/paper/review', adminOrTeacher, asyncHandler(paperController.review));

// ── Academic Appeals (student submits against a specific exam) ──
router.post('/:id/appeals', roleMiddleware(['student']), asyncHandler(appealController.create));

// ── Active Exams (student takes a computer-based exam) ──
router.post('/:id/attempt/start', roleMiddleware(['student']), asyncHandler(attemptController.start));
router.get('/:id/attempt', roleMiddleware(['student']), asyncHandler(attemptController.getMine));
router.patch('/:id/attempt', roleMiddleware(['student']), asyncHandler(attemptController.saveAnswers));
router.post('/:id/attempt/submit', roleMiddleware(['student']), asyncHandler(attemptController.submit));

export default router;
