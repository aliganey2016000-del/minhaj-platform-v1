/**
 * Auth Routes — /api/v1/auth
 *
 * Public endpoints (no auth required):
 *   POST /register
 *   POST /login
 *   POST /refresh-token
 *   POST /forgot-password
 *   POST /reset-password/:token
 *   POST /verify-email/:token
 *
 * Protected endpoints (auth required):
 *   POST /logout
 *   GET  /me
 *   PATCH /change-password
 *   PATCH /update-profile
 *   POST /upload-avatar
 *   POST /resend-verification
 */

import { Router } from 'express';
import * as authController from '../../controllers/auth.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../../validators/auth.validator';

const router = Router();

// ---------------------------------------------------------------------------
// Public Routes
// ---------------------------------------------------------------------------

// POST /api/v1/auth/register
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(authController.register)
);

// POST /api/v1/auth/login
router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(authController.login)
);

// POST /api/v1/auth/refresh-token
router.post(
  '/refresh-token',
  asyncHandler(authController.refreshToken)
);

// POST /api/v1/auth/forgot-password
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword)
);

// POST /api/v1/auth/reset-password/:token
router.post(
  '/reset-password/:token',
  validate(resetPasswordSchema),
  asyncHandler(authController.resetPassword)
);

// POST /api/v1/auth/verify-email/:token
router.post(
  '/verify-email/:token',
  asyncHandler(authController.verifyEmail)
);

// ---------------------------------------------------------------------------
// Protected Routes (require valid JWT)
// ---------------------------------------------------------------------------

// POST /api/v1/auth/logout
router.post(
  '/logout',
  authMiddleware,
  asyncHandler(authController.logout)
);

// GET /api/v1/auth/me
router.get(
  '/me',
  authMiddleware,
  asyncHandler(authController.getMe)
);

// PATCH /api/v1/auth/me — Update user preferences (language, etc.)
router.patch(
  '/me',
  authMiddleware,
  asyncHandler(authController.updatePreferences)
);

// PATCH /api/v1/auth/change-password
router.patch(
  '/change-password',
  authMiddleware,
  validate(changePasswordSchema),
  asyncHandler(authController.changePassword)
);

// PATCH /api/v1/auth/update-profile
// router.patch(
//   '/update-profile',
//   authMiddleware,
//   validate(updateProfileSchema),
//   asyncHandler(authController.updateProfile)
// );

// POST /api/v1/auth/upload-avatar
// router.post(
//   '/upload-avatar',
//   authMiddleware,
//   upload.single('avatar'),
//   asyncHandler(authController.uploadAvatar)
// );

// POST /api/v1/auth/resend-verification
// router.post(
//   '/resend-verification',
//   authMiddleware,
//   asyncHandler(authController.resendVerification)
// );

export default router;