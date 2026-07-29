import { Router } from 'express';
import * as attendanceController from '../../controllers/attendance.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/my', roleMiddleware(['student']), asyncHandler(attendanceController.getMyAttendance));
router.get('/my/courses', roleMiddleware(['student']), asyncHandler(attendanceController.getMyAttendanceByCourse));
router.post('/', adminOnly, asyncHandler(attendanceController.markBulk));
// Unlocking a locked session is a platform-Admin-only power — org_admin
// (who is the one submitting/getting locked out) cannot self-unlock.
router.patch('/unlock', roleMiddleware(['admin']), asyncHandler(attendanceController.unlockSession));
router.get('/course', asyncHandler(attendanceController.getByCourseAndDate));
router.get('/report', asyncHandler(attendanceController.getCourseReport));
router.get('/insights', asyncHandler(attendanceController.getReportInsights));
router.get('/history', asyncHandler(attendanceController.getStudentCourseHistory));
router.get('/student/:studentId', asyncHandler(attendanceController.getStudentSummary));

export default router;
