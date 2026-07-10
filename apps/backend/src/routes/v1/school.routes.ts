/**
 * School Routes
 *
 * Mounted at /api/v1/schools
 * All routes require authentication. Write operations are admin-only.
 */

import { Router } from 'express';
import * as ctrl from '../../controllers/school.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ── Read (admin or teacher) ──
router.get('/', adminOrTeacher, asyncHandler(ctrl.getAll));
router.get('/:id', adminOrTeacher, asyncHandler(ctrl.getById));

// ── Write (admin only) ──
router.post('/', adminOnly, asyncHandler(ctrl.create));
router.patch('/:id', adminOnly, asyncHandler(ctrl.update));
router.patch('/:id/status', adminOnly, asyncHandler(ctrl.updateStatus));
router.delete('/:id', adminOnly, asyncHandler(ctrl.remove));

export default router;