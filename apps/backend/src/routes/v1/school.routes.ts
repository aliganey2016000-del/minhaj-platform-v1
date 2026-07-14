/**
 * School Routes
 *
 * Mounted at /api/v1/schools
 * All routes require authentication. Write operations are admin-only.
 */

import { Router } from 'express';
import * as ctrl from '../../controllers/school.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher, roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ── Read (admin, org_admin, or teacher — results scoped to own org inside the controller for org_admin) ──
router.get('/', adminOrTeacher, asyncHandler(ctrl.getAll));
router.get('/:id', adminOrTeacher, asyncHandler(ctrl.getById));

// ── Update own org info (admin, or org_admin for their own organization only) ──
router.patch('/:id', adminOnly, asyncHandler(ctrl.update));

// ── Registering new organizations, activation/deactivation, and deletion are
//    super-admin only — an org_admin must never create another tenant,
//    suspend their own org, or delete organizations. ──
router.post('/', roleMiddleware(['admin']), asyncHandler(ctrl.create));
router.patch('/:id/status', roleMiddleware(['admin']), asyncHandler(ctrl.updateStatus));
router.delete('/:id', roleMiddleware(['admin']), asyncHandler(ctrl.remove));

export default router;