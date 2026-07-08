/**
 * Main Route Aggregator
 *
 * Mounts the v1 API routes under /api/v1.
 * This is the single entry point for all API routes in the application.
 *
 * Usage (in app.ts):
 *   import routes from './routes';
 *   app.use(routes);
 */

import { Router } from 'express';
import v1Routes from './v1';

const router = Router();

// Mount API version 1
router.use('/api/v1', v1Routes);

// Future API versions:
// router.use('/api/v2', v2Routes);

export default router;