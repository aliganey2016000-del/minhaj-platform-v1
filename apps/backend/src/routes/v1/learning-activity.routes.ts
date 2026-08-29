/**
 * Learning Activity Routes — /api/v1/activity
 * Student Activity Tracking & Analytics.
 */

import { Router } from 'express';
import * as activityController from '../../controllers/learning-activity.controller';
import * as sessionController from '../../controllers/learning-session.controller';
import { sessionAnalyticsOverride } from '../../middleware/session-analytics-override.middleware';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, anyAuthenticatedUser } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();
router.use(authMiddleware);

router.post('/session/start', anyAuthenticatedUser, asyncHandler(sessionController.startSession));
router.post('/session/heartbeat', anyAuthenticatedUser, asyncHandler(sessionController.heartbeat));
router.post('/session/end', anyAuthenticatedUser, asyncHandler(sessionController.endSession));
router.post('/event', anyAuthenticatedUser, asyncHandler(activityController.logEvent));

router.use(adminOrTeacher);
router.get('/roster', asyncHandler(activityController.getRoster));
router.get('/timeline/:studentId', asyncHandler(activityController.getTimeline));
router.get('/analytics/:studentId', sessionAnalyticsOverride, asyncHandler(activityController.getAnalytics));
router.get('/session-analytics/:studentId', asyncHandler(sessionController.getStudentAnalytics));
router.get('/export/:studentId', asyncHandler(activityController.exportTimeline as any));

export default router;
