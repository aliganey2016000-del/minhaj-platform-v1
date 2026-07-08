import { Router } from 'express';
import * as ctrl from '../../controllers/content.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly, adminOrTeacher } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';

function contentRoutes(modelName: 'Announcement' | 'News' | 'Event' | 'Gallery') {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', adminOrTeacher, asyncHandler(ctrl.getAll(modelName)));
  router.post('/', adminOnly, asyncHandler(ctrl.create(modelName)));
  router.patch('/:id', adminOnly, asyncHandler(ctrl.update(modelName)));
  router.patch('/:id/status', adminOnly, asyncHandler(ctrl.updateStatus(modelName)));
  router.delete('/:id', adminOnly, asyncHandler(ctrl.remove(modelName)));

  if (modelName === 'Announcement') {
    router.patch('/:id/toggle-pin', adminOnly, asyncHandler(ctrl.togglePin));
  }

  return router;
}

export default contentRoutes;