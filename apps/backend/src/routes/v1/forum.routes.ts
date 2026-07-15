/**
 * Forum Routes
 *
 * Public / Private thread and message endpoints.
 */

import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
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
router.get('/threads', listThreads);
router.post('/threads', createThread);
router.get('/threads/:threadId', getThread);
router.patch('/threads/:threadId', updateThread);
router.delete('/threads/:threadId', deleteThread);

// Messages within a thread
router.post('/threads/:threadId/messages', createMessage);

// Message deletion
router.delete('/messages/:messageId', deleteMessage);

// Organization members (for participant selection)
router.get('/members', listOrgMembers);

export default router;