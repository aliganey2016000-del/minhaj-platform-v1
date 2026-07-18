/**
 * User Routes — /api/v1/users
 *
 * Admin/Org Admin (auth required):
 *   GET    /          — List users
 *   GET    /:id       — Get single user
 *   POST   /          — Create user
 *   PATCH  /:id       — Update user
 *   DELETE /:id       — Deactivate user
 */

import { Router } from 'express';
import * as userController from '../../controllers/user.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

// All routes require authentication + admin or org_admin role
router.use(authMiddleware);
router.use(roleMiddleware(['admin', 'org_admin']));

router.get('/', asyncHandler(userController.getAll));
router.get('/:id', asyncHandler(userController.getById));
router.post('/', asyncHandler(userController.create));
router.patch('/:id', asyncHandler(userController.update));
router.delete('/:id', asyncHandler(userController.remove));

export default router;