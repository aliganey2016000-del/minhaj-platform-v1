import { Router } from 'express';
import * as analyticsController from '../../controllers/analytics.controller';
import * as performanceInsightsController from '../../controllers/performance-insights.controller';
import * as learningAssessmentsController from '../../controllers/learning-assessments.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);
router.use(adminOnly);

router.get('/dashboard', asyncHandler(analyticsController.getDashboardStats));
router.get('/performance', asyncHandler(performanceInsightsController.getAdminPerformance));
router.get('/learning-assessments', asyncHandler(learningAssessmentsController.getLearningAssessments));

export default router;