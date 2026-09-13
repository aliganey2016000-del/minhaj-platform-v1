import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../../controllers/class-schedule.controller';
import * as schoolCtrl from '../../controllers/school-class-schedule.controller';
import * as schoolListCtrl from '../../controllers/school-class-schedule-list.controller';
import * as schoolTemplateCtrl from '../../controllers/school-class-schedule-template.controller';
import * as dispatchCtrl from '../../controllers/class-schedule-dispatch.controller';
import * as studioCtrl from '../../controllers/ai-timetable-studio.controller';
import * as safeStudioCtrl from '../../controllers/ai-timetable-studio-safe.controller';
import * as aiTimetableCtrl from '../../controllers/ai-timetable.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { validateScheduleRoomConflict } from '../../middleware/timetable-room-conflict.middleware';
import { preflightTimetableDraft } from '../../middleware/timetable-draft-preflight.middleware';
import { preflightTimetablePublish } from '../../middleware/timetable-publish-preflight.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// AI generation can trigger an external DeepSeek request with a long timeout,
// so protect it with a tighter limit than the app-wide API limiter. Validation
// and publishing remain unaffected because they are local operations and have
// their own authorization/confirmation safeguards.
const aiPlanLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many AI timetable generation requests, please try again later',
    data: null,
    errors: null,
  },
});

const router = Router();
router.use(authMiddleware);

router.get('/', adminOrTeacher, asyncHandler(dispatchCtrl.getAllSchedules));
router.post('/', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.create));

// AI Timetable Studio foundation. All AI/solver operations remain server-side;
// the browser only submits validated draft/rule changes. Published timetable
// recovery paths also protect draft creation/reset from legacy bad references.
router.get('/school/studio/bootstrap', roleMiddleware(['admin', 'org_admin']), asyncHandler(safeStudioCtrl.getBootstrap));
router.patch('/school/studio/config', roleMiddleware(['admin', 'org_admin']), asyncHandler(studioCtrl.updateConfig));
router.put('/school/studio/teachers/:teacherId/availability', roleMiddleware(['admin', 'org_admin']), asyncHandler(studioCtrl.upsertTeacherAvailability));
router.post('/school/studio/constraints', roleMiddleware(['admin', 'org_admin']), asyncHandler(studioCtrl.createConstraint));
router.delete('/school/studio/constraints/:id', roleMiddleware(['admin', 'org_admin']), asyncHandler(studioCtrl.deleteConstraint));
router.post('/school/studio/conflicts', roleMiddleware(['admin', 'org_admin']), asyncHandler(safeStudioCtrl.checkConflicts));
router.post('/school/studio/drafts', roleMiddleware(['admin', 'org_admin']), asyncHandler(preflightTimetableDraft), asyncHandler(safeStudioCtrl.createDraft));
router.put('/school/studio/drafts/:id', roleMiddleware(['admin', 'org_admin']), asyncHandler(studioCtrl.saveDraft));
router.post('/school/studio/drafts/:id/reset', roleMiddleware(['admin', 'org_admin']), asyncHandler(safeStudioCtrl.resetDraft));
router.post('/school/studio/drafts/:id/publish', roleMiddleware(['admin', 'org_admin']), asyncHandler(preflightTimetablePublish), asyncHandler(studioCtrl.publishDraft));
router.post('/school/studio/versions/:version/rollback', roleMiddleware(['admin', 'org_admin']), asyncHandler(studioCtrl.rollbackVersion));

// Simplified school-only CRUD/import/export workflow.
router.get('/school/list', roleMiddleware(['admin', 'org_admin']), asyncHandler(schoolListCtrl.getSchoolSchedules));
router.post('/school', roleMiddleware(['admin', 'org_admin']), asyncHandler(validateScheduleRoomConflict), asyncHandler(schoolCtrl.createSchoolSchedule));
router.put('/school/:id', roleMiddleware(['admin', 'org_admin']), asyncHandler(validateScheduleRoomConflict), asyncHandler(schoolCtrl.updateSchoolSchedule));
router.post('/school/import', roleMiddleware(['admin', 'org_admin']), upload.single('file'), asyncHandler(schoolCtrl.importSchoolSchedules));
router.get('/school/export', roleMiddleware(['admin', 'org_admin']), asyncHandler(schoolCtrl.exportSchoolSchedules as any));
router.get('/school/template', roleMiddleware(['admin', 'org_admin']), asyncHandler(schoolTemplateCtrl.downloadSchoolTemplate as any));
router.post('/school/ai-plan', roleMiddleware(['admin', 'org_admin']), aiPlanLimiter, asyncHandler(aiTimetableCtrl.generatePlan));
router.post('/school/ai-validate', roleMiddleware(['admin', 'org_admin']), asyncHandler(aiTimetableCtrl.validatePlan));
router.post('/school/ai-publish', roleMiddleware(['admin', 'org_admin']), asyncHandler(aiTimetableCtrl.publishPlan));

// Legacy/comprehensive workflow retained for university, college, training
// center and super-admin use.
router.post('/bulk-import', roleMiddleware(['admin', 'org_admin']), upload.single('file'), asyncHandler(ctrl.bulkImport));
router.post('/import', roleMiddleware(['admin', 'org_admin']), upload.single('file'), asyncHandler(ctrl.bulkImportTransactional));
router.get('/export', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.exportSchedules as any));
router.get('/template', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.downloadTemplate as any));
router.get('/my', roleMiddleware(['student']), asyncHandler(ctrl.getMySchedules));
router.get('/my-teaching', roleMiddleware(['teacher']), asyncHandler(ctrl.getMyScheduleAsTeacher));
router.get('/status/:courseId', roleMiddleware(['admin', 'org_admin', 'teacher']), asyncHandler(ctrl.checkScheduleStatus));
router.post('/bulk-delete', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.bulkRemove));
router.get('/:id', adminOrTeacher, asyncHandler(ctrl.getById));
router.put('/:id', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.update));
router.delete('/:id', roleMiddleware(['admin', 'org_admin']), asyncHandler(ctrl.remove));

export default router;
