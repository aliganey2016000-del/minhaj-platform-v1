/**
 * School Routes
 *
 * Mounted at /api/v1/schools
 * All routes require authentication. Write operations are admin-only.
 */

import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../../controllers/school.controller';
import * as brandingCtrl from '../../controllers/school-branding.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { preventOrgAdminInstitutionTypeChange } from '../../middleware/institution-type-lock.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ── Read (admin, org_admin, or teacher — results scoped to own org inside the controller for org_admin) ──
router.get('/', adminOrTeacher, asyncHandler(ctrl.getAll));
router.get('/:id/branding', adminOnly, asyncHandler(brandingCtrl.getBranding));
router.get('/:id', adminOrTeacher, asyncHandler(ctrl.getById));
router.get('/:id/onboarding', adminOnly, asyncHandler(ctrl.getOnboardingStatus));

// ── Organization branding — admin can manage any org; org_admin can manage only their own. ──
router.post('/:id/branding/logo', adminOnly, upload.single('file'), asyncHandler(brandingCtrl.uploadLogo));
router.delete('/:id/branding/logo', adminOnly, asyncHandler(brandingCtrl.removeLogo));

// ── Update own org info (admin, or org_admin for their own organization only).
// The institution-type lock must run BEFORE adminOnly because the legacy
// role middleware strips this field from org-admin requests; we need to reject
// the attempted mutation explicitly rather than silently accepting it.
router.patch(
  '/:id',
  preventOrgAdminInstitutionTypeChange,
  adminOnly,
  asyncHandler(ctrl.update),
);
router.patch('/:id/complete-onboarding', adminOnly, asyncHandler(ctrl.completeOnboarding));

// ── Registering new organizations, activation/deactivation, and deletion are
//    super-admin only — an org_admin must never create another tenant,
//    suspend their own org, or delete organizations. ──
router.post('/', roleMiddleware(['admin']), asyncHandler(ctrl.create));
router.patch('/:id/status', roleMiddleware(['admin']), asyncHandler(ctrl.updateStatus));
// Registered before /:id so "bulk" is never swallowed as an id param.
router.delete('/bulk', roleMiddleware(['admin']), asyncHandler(ctrl.bulkRemove));
router.delete('/:id', roleMiddleware(['admin']), asyncHandler(ctrl.remove));

export default router;
