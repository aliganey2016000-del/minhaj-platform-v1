/**
 * Forum Routes
 *
 * Public / Private thread and message endpoints.
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import {
  listThreads,
  createThread,
  getThread,
  updateThread,
  deleteThread,
  createMessage,
  deleteMessage,
  listOrgMembers,
} from '../../controllers/forum.controller';

const router = Router();

// All forum routes require authentication
router.use(authMiddleware);

// Threads
router.get('/threads', asyncHandler(listThreads));
router.post('/threads', asyncHandler(createThread));
router.get('/threads/:threadId', asyncHandler(getThread));
router.patch('/threads/:threadId', asyncHandler(updateThread));
router.delete('/threads/:threadId', asyncHandler(deleteThread));

// Messages within a thread
router.post('/threads/:threadId/messages', asyncHandler(createMessage));

// Message deletion
router.delete('/messages/:messageId', asyncHandler(deleteMessage));

// Organization members (for participant selection)
router.get('/members', asyncHandler(listOrgMembers));

export default router;