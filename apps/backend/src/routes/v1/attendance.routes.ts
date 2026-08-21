import { Router, Request, Response, NextFunction } from 'express';
import * as attendanceController from '../../controllers/attendance.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import Course from '../../models/course.model';
import Teacher from '../../models/teacher.model';
import { ForbiddenError } from '../../utils/api-error';

const router = Router();

router.use(authMiddleware);

// Teachers may submit attendance only for courses assigned to their own
// Teacher record. Admin/org_admin retain their existing broader access.
const teacherCourseScope = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'teacher') return next();
    const courseId = req.body?.course;
    if (!courseId) throw new ForbiddenError('Course is required for teacher attendance.');
    const teacher = await Teacher.findOne({ user: req.user.userId }).select('_id').lean();
    const course = teacher ? await Course.findOne({ _id: courseId, teacher: teacher._id }).select('_id').lean() : null;
    if (!course) throw new ForbiddenError('You can only mark attendance for courses assigned to you.');
    return next();
  } catch (error) {
    return next(error);
  }
};

router.get('/my', roleMiddleware(['student']), asyncHandler(attendanceController.getMyAttendance));
router.get('/my/courses', roleMiddleware(['student']), asyncHandler(attendanceController.getMyAttendanceByCourse));
router.get('/my/course-history', roleMiddleware(['student']), asyncHandler(attendanceController.getMyCourseHistory));
router.post('/', adminOrTeacher, teacherCourseScope, asyncHandler(attendanceController.markBulk));
// Unlocking a locked session is a platform-Admin-only power — org_admin
// (who is the one submitting/getting locked out) cannot self-unlock.
router.patch('/unlock', roleMiddleware(['admin']), asyncHandler(attendanceController.unlockSession));
router.get('/course', asyncHandler(attendanceController.getByCourseAndDate));
router.get('/report', asyncHandler(attendanceController.getCourseReport));
router.get('/insights', asyncHandler(attendanceController.getReportInsights));
router.get('/history', asyncHandler(attendanceController.getStudentCourseHistory));
router.get('/student/:studentId', asyncHandler(attendanceController.getStudentSummary));

export default router;
