import { Router } from 'express';
import * as attendanceController from '../../controllers/attendance.controller';
import * as attendanceProController from '../../controllers/attendance-pro.controller';
import * as attendanceReportController from '../../controllers/attendance-report.controller';
import * as attendanceSummaryController from '../../controllers/attendance-summary.controller';
import * as schoolAttendanceController from '../../controllers/school-attendance.controller';
import * as schoolCalendarController from '../../controllers/school-calendar.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { attendanceCourseScope, attendanceStudentScope } from '../../middleware/attendance-scope.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/my', roleMiddleware(['student']), asyncHandler(attendanceSummaryController.getMyAttendance));
router.get('/my/courses', roleMiddleware(['student']), asyncHandler(attendanceSummaryController.getMyAttendanceByCourse));
router.get('/my/course-history', roleMiddleware(['student']), asyncHandler(attendanceController.getMyCourseHistory));

// School schedule-first workflow. Teachers receive only their own scheduled
// lessons; admins/org-admins receive the organization's full timetable.
router.get('/school/sessions', roleMiddleware(['admin', 'org_admin', 'teacher']), asyncHandler(schoolAttendanceController.getSchoolSessions));
router.get('/school/session/:scheduleId', roleMiddleware(['admin', 'org_admin', 'teacher']), asyncHandler(schoolAttendanceController.getSchoolSession));
router.get('/school/options', roleMiddleware(['admin', 'org_admin', 'teacher']), asyncHandler(schoolAttendanceController.getSchoolOptions));

// Instructional calendar — attendance is blocked on non-instructional dates.
router.get('/school/calendar', roleMiddleware(['admin', 'org_admin']), asyncHandler(schoolCalendarController.listCalendarDays));
router.post('/school/calendar', roleMiddleware(['admin', 'org_admin']), asyncHandler(schoolCalendarController.upsertCalendarDay));
router.delete('/school/calendar/:id', roleMiddleware(['admin', 'org_admin']), asyncHandler(schoolCalendarController.deleteCalendarDay));

// Secure writes: tenant/course/schedule scope is enforced before any records
// can be changed. Scheduled school attendance also requires the full roster.
router.post('/', adminOrTeacher, attendanceCourseScope, asyncHandler(attendanceProController.markBulk));

// Organization administrators may unlock their own submitted school session,
// but only with an auditable correction reason. Keep the platform-admin legacy
// endpoint for backward compatibility with existing admin tools.
router.patch('/school/unlock', roleMiddleware(['admin', 'org_admin']), attendanceCourseScope, asyncHandler(attendanceProController.unlockSchoolSession));
router.patch('/unlock', roleMiddleware(['admin']), attendanceCourseScope, asyncHandler(attendanceController.unlockSession));

// Generic attendance reads now share the same tenant/course guard. The report
// implementation keeps Excused separate from Absent and treats Late as
// attendance rather than arbitrary half-credit.
router.get('/course', attendanceCourseScope, asyncHandler(attendanceController.getByCourseAndDate));
router.get('/report', attendanceCourseScope, asyncHandler(attendanceReportController.getCourseReport));
router.get('/insights', attendanceCourseScope, asyncHandler(attendanceController.getReportInsights));
router.get('/history', attendanceCourseScope, attendanceStudentScope, asyncHandler(attendanceController.getStudentCourseHistory));
router.get('/student/:studentId', attendanceStudentScope, asyncHandler(attendanceSummaryController.getStudentSummary));

export default router;
