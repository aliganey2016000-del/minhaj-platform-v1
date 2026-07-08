import { Router } from 'express';
import * as attendanceController from '../../controllers/attendance.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/my', roleMiddleware(['student']), asyncHandler(attendanceController.getMyAttendance));
router.post('/', adminOnly, asyncHandler(attendanceController.markBulk));
router.get('/course', asyncHandler(attendanceController.getByCourseAndDate));
router.get('/report', asyncHandler(attendanceController.getCourseReport));
router.get('/student/:studentId', asyncHandler(attendanceController.getStudentSummary));

export default router;
