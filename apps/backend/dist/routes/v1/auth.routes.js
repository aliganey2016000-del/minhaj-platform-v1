"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController = __importStar(require("../../controllers/auth.controller"));
const auth_middleware_1 = require("../../middleware/auth.middleware");
const validate_middleware_1 = require("../../middleware/validate.middleware");
const async_handler_middleware_1 = require("../../middleware/async-handler.middleware");
const auth_validator_1 = require("../../validators/auth.validator");
const router = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// Public Routes
// ---------------------------------------------------------------------------
// POST /api/v1/auth/register
router.post('/register', (0, validate_middleware_1.validate)(auth_validator_1.registerSchema), (0, async_handler_middleware_1.asyncHandler)(authController.register));
// POST /api/v1/auth/login
router.post('/login', (0, validate_middleware_1.validate)(auth_validator_1.loginSchema), (0, async_handler_middleware_1.asyncHandler)(authController.login));
// POST /api/v1/auth/refresh-token
router.post('/refresh-token', (0, async_handler_middleware_1.asyncHandler)(authController.refreshToken));
// POST /api/v1/auth/forgot-password
router.post('/forgot-password', (0, validate_middleware_1.validate)(auth_validator_1.forgotPasswordSchema), (0, async_handler_middleware_1.asyncHandler)(authController.forgotPassword));
// POST /api/v1/auth/reset-password/:token
router.post('/reset-password/:token', (0, validate_middleware_1.validate)(auth_validator_1.resetPasswordSchema), (0, async_handler_middleware_1.asyncHandler)(authController.resetPassword));
// POST /api/v1/auth/verify-email/:token
router.post('/verify-email/:token', (0, async_handler_middleware_1.asyncHandler)(authController.verifyEmail));
// ---------------------------------------------------------------------------
// Protected Routes (require valid JWT)
// ---------------------------------------------------------------------------
// POST /api/v1/auth/logout
router.post('/logout', auth_middleware_1.authMiddleware, (0, async_handler_middleware_1.asyncHandler)(authController.logout));
// GET /api/v1/auth/me
router.get('/me', auth_middleware_1.authMiddleware, (0, async_handler_middleware_1.asyncHandler)(authController.getMe));
// PATCH /api/v1/auth/me — Update user preferences (language, etc.)
router.patch('/me', auth_middleware_1.authMiddleware, (0, async_handler_middleware_1.asyncHandler)(authController.updatePreferences));
// PATCH /api/v1/auth/change-password
router.patch('/change-password', auth_middleware_1.authMiddleware, (0, validate_middleware_1.validate)(auth_validator_1.changePasswordSchema), (0, async_handler_middleware_1.asyncHandler)(authController.changePassword));
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
exports.default = router;
//# sourceMappingURL=auth.routes.js.map