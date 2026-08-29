/**
 * Learning Activity Routes — /api/v1/activity
 * Student Activity Tracking & Analytics.
 */

import { Router } from 'express';
import * as activityController from '../../controllers/learning-activity.controller';
import * as sessionController from '../../controllers/learning-session.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, anyAuthenticatedUser } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);

// Student-owned learning session lifecycle. The server derives student/school
// from the authenticated user and never trusts those references from the body.
router.post('/session/start', anyAuthenticatedUser, asyncHandler(sessionController.startSession));
router.post('/session/heartbeat', anyAuthenticatedUser, asyncHandler(sessionController.heartbeat));
router.post('/session/end', anyAuthenticatedUser, asyncHandler(sessionController.endSession));

// POST /api/v1/activity/event — any authenticated user logs their OWN activity
router.post('/event', anyAuthenticatedUser, asyncHandler(activityController.logEvent));

// Everything else is admin/teacher-only (viewing students' activity)
router.use(adminOrTeacher);

router.get('/roster', asyncHandler(activityController.getRoster));
router.get('/timeline/:studentId', asyncHandler(activityController.getTimeline));
router.get('/analytics/:studentId', asyncHandler(activityController.getAnalytics));
router.get('/export/:studentId', asyncHandler(activityController.exportTimeline as any));

export default router;
