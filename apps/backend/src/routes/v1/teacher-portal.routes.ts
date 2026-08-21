/**
 * Teacher Portal Routes
 *
 * Dedicated routes for the sandboxed Teacher Portal. All routes require
 * authentication + teacher role. Teachers can only access data within
 * their assigned courses/students.
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { validateTeacherFeedback, validateTeacherGrade } from '../../middleware/teacher-grading-validation.middleware';
import * as teacherPortalController from '../../controllers/teacher-portal.controller';
import * as teacherDashboardController from '../../controllers/teacher-dashboard.controller';
import * as teacherAttendanceController from '../../controllers/teacher-attendance.controller';
import * as teacherStudentController from '../../controllers/teacher-student.controller';

const router = Router();

router.use(authMiddleware);
router.use(roleMiddleware(['teacher']));

// ── Dashboard ──
router.get('/dashboard', asyncHandler(teacherDashboardController.getDashboard));
router.get('/dashboard/gamification', asyncHandler(teacherPortalController.getGamificationOverview));

// ── Attendance ──
router.get('/courses/:courseId/attendance-roster', asyncHandler(teacherAttendanceController.getRoster));

// ── Student Profile & Progress ──
router.get('/students/:studentId/profile', asyncHandler(teacherStudentController.getStudentProfile));

// ── Quiz Management (within teacher's assigned courses) ──
router.get('/courses/:courseId/quizzes', asyncHandler(teacherPortalController.getCourseQuizzes));
router.get('/courses/:courseId/quizzes/:quizId', asyncHandler(teacherPortalController.getQuizById));
router.post('/courses/:courseId/quizzes', asyncHandler(teacherPortalController.createQuiz));
router.patch('/courses/:courseId/quizzes/:quizId', asyncHandler(teacherPortalController.updateQuiz));
router.delete('/courses/:courseId/quizzes/:quizId', asyncHandler(teacherPortalController.deleteQuiz));

// ── Lesson / Content Management ──
router.get('/courses/:courseId/chapters', asyncHandler(teacherPortalController.getCourseChapters));
router.patch('/courses/:courseId/chapters', asyncHandler(teacherPortalController.updateCourseChapters));
router.patch('/courses/:courseId/video-gating', asyncHandler(teacherPortalController.updateVideoGating));

// ── Gradebook & Assignments ──
router.get('/courses/:courseId/submissions', asyncHandler(teacherPortalController.getCourseSubmissions));
router.get('/submissions/:submissionId', asyncHandler(teacherPortalController.getSubmissionDetail));
router.patch('/submissions/:submissionId/grade', asyncHandler(validateTeacherGrade), asyncHandler(teacherPortalController.gradeSubmission));
router.post('/submissions/:submissionId/feedback', asyncHandler(validateTeacherFeedback), asyncHandler(teacherPortalController.addFeedback));

// ── Analytics within teacher scope ──
router.get('/courses/:courseId/analytics', asyncHandler(teacherPortalController.getCourseAnalytics));
router.get('/students/:studentId/analytics', asyncHandler(teacherPortalController.getStudentAnalytics));

export default router;
