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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=auth.routes.d.ts.map