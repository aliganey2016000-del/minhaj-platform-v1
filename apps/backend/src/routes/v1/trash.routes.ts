import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as trashController from '../../controllers/trash.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

const router = Router();

router.use(authMiddleware);
router.use(adminOnly);

// Empty Trash is the single most destructive endpoint in the app — it can
// wipe out every soft-deleted record an admin can see in one call. Rate
// limit it on top of the frontend's confirm modal and the controller's own
// { confirm: true } body guard, same shape as the existing auth-login
// limiter in app.ts.
const emptyTrashLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, statusCode: 429, message: 'Too many Empty Trash attempts, please try again later', data: null, errors: null },
});

router.get('/', asyncHandler(trashController.getAll));
router.post('/bulk-restore', asyncHandler(trashController.bulkRestore));
router.delete('/bulk', asyncHandler(trashController.bulkPurge));
router.post('/:id/restore', asyncHandler(trashController.restore));
router.delete('/:id', asyncHandler(trashController.purge));
router.delete('/', emptyTrashLimiter, asyncHandler(trashController.empty));

export default router;
