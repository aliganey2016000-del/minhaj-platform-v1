# Quick Integration Guide - All Security Systems

This guide shows how to integrate all the new security systems into your Express app.

## Step 1: Update `src/app.ts`

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';

// ✅ NEW: Import security utilities
import {
  enforceHttps,
  requestTimeout,
  stripSensitiveHeaders,
  setContentSecurityPolicy,
  validateSecurityEnv,
  addApiVersionHeader,
  securityLogging,
} from './middleware/security.middleware';
import { requestResponseLoggingMiddleware, initializeLogger } from './utils/logger';
import { apiKeyMiddleware } from './utils/api-key-manager';

const app = express();

// ✅ NEW: Initialize logger first
const logger = initializeLogger();

// Validate Security Configuration at Startup
validateSecurityEnv();

// Trust proxy
app.set('trust proxy', 1);

// ✅ ENHANCED: Security middleware with all new systems
app.use(enforceHttps);
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
}));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'API-Version'],
  maxAge: 86400,
}));
app.use(stripSensitiveHeaders);
app.use(setContentSecurityPolicy);
app.use(addApiVersionHeader);

// Rate Limiting
const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW || '1')) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '1000'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests, please try again later',
    data: null,
    errors: null,
  },
  skip: (req) => req.path === '/api/v1/health',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many login attempts, please try again later',
    data: null,
    errors: null,
  },
  skipSuccessfulRequests: true,
});

app.use('/api/', limiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// Body Parsing
app.use(requestTimeout());
app.use(securityLogging);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Data Sanitization
app.use(mongoSanitize());

// ✅ NEW: Request/Response logging
app.use(requestResponseLoggingMiddleware());

// ✅ NEW: API key validation
app.use(apiKeyMiddleware());

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Routes
app.use(routes);

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: 'Route not found',
    data: null,
    errors: null,
  });
});

// Global Error Handler
app.use(errorHandler);

export default app;
```

## Step 2: Update `src/server.ts`

```typescript
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const localEnvPath = path.resolve(__dirname, '../.env');
const prodEnvPath = path.resolve(__dirname, '../.env.production');
dotenv.config({ path: fs.existsSync(localEnvPath) ? localEnvPath : prodEnvPath });

import mongoose from 'mongoose';

// Register models
import './models/user.model';
import './models/payment.model';
// ... other models

import http from 'http';
import app from './app';
import { initSocket } from './realtime/socket';

// ✅ NEW: Import audit logger
import { AuditLogger } from './utils/audit-logger';

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/masjid-al-rahma';

async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // ✅ NEW: Schedule backup cleanup daily
    if (process.env.NODE_ENV === 'production') {
      setInterval(async () => {
        try {
          const deleted = await AuditLogger.cleanupOldLogs(90);
          console.log(`🧹 Cleaned up ${deleted} old audit logs`);
        } catch (error) {
          console.error('Error cleaning audit logs:', error);
        }
      }, 24 * 60 * 60 * 1000); // Daily
    }

    // Start server
    const httpServer = http.createServer(app);
    initSocket(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 API available at http://localhost:${PORT}/api/v1`);
      console.log(`💚 Health check: http://localhost:${PORT}/api/v1/health`);
      console.log(`🔌 Realtime (Socket.IO) ready`);
      console.log(`📊 Logging to: ${process.env.LOG_DIR || './logs'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
```

## Step 3: Update Routes with Audit Logging

### Example: User Management Route

```typescript
import { Router } from 'express';
import * as userController from '../../controllers/user.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { roleMiddleware } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { auditLoggingMiddleware } from '../../utils/audit-logger';

const router = Router();

// All routes require authentication + admin role
router.use(authMiddleware);
router.use(roleMiddleware(['admin', 'org_admin']));

// ✅ NEW: Add audit logging
router.get('/', asyncHandler(userController.getAll));
router.get('/:id', asyncHandler(userController.getById));

router.post(
  '/',
  auditLoggingMiddleware('USER_CREATED', 'User'),
  asyncHandler(userController.create)
);

router.patch(
  '/:id',
  auditLoggingMiddleware('USER_UPDATED', 'User'),
  asyncHandler(userController.update)
);

router.delete(
  '/:id',
  auditLoggingMiddleware('USER_DELETED', 'User'),
  asyncHandler(userController.remove)
);

export default router;
```

## Step 4: Create Admin Endpoints for Security Management

### New File: `src/routes/v1/security.routes.ts`

```typescript
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminOnly } from '../../middleware/role.middleware';
import { asyncHandler } from '../../middleware/async-handler.middleware';
import { AuditLogger } from '../../utils/audit-logger';
import { ApiKeyManager } from '../../utils/api-key-manager';
import { getLogger } from '../../utils/logger';

const router = Router();

// All security routes require admin auth
router.use(authMiddleware);
router.use(adminOnly);

// ===== AUDIT LOG ENDPOINTS =====

// Get all audit logs (with pagination)
router.get('/audit-logs', asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const logs = await AuditLogger.getCriticalLogs();
  const total = logs.length;

  res.json({
    success: true,
    statusCode: 200,
    message: 'Audit logs retrieved',
    data: logs.slice(skip, skip + limit),
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
    errors: null,
  });
}));

// Get audit logs for specific user
router.get('/audit-logs/user/:userId', asyncHandler(async (req, res) => {
  const logs = await AuditLogger.getUserAuditLog(req.params.userId);

  res.json({
    success: true,
    statusCode: 200,
    message: 'User audit logs retrieved',
    data: logs,
    errors: null,
  });
}));

// Get organization audit summary
router.get('/audit-summary', asyncHandler(async (req, res) => {
  const orgId = (req as any).user.organizationId;
  const days = parseInt(req.query.days as string) || 30;

  const summary = await AuditLogger.getOrganizationSummary(orgId, days);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Audit summary retrieved',
    data: summary,
    errors: null,
  });
}));

// Export audit logs
router.get('/audit-logs/export/:format', asyncHandler(async (req, res) => {
  const startDate = new Date(req.query.start as string);
  const endDate = new Date(req.query.end as string);
  const format = (req.params.format as 'json' | 'csv') || 'json';
  const orgId = (req as any).user.organizationId;

  const data = await AuditLogger.exportLogs(startDate, endDate, orgId, format);

  if (format === 'csv') {
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', 'attachment; filename=audit-logs.csv');
  } else {
    res.header('Content-Type', 'application/json');
    res.header('Content-Disposition', 'attachment; filename=audit-logs.json');
  }

  res.send(data);
}));

// ===== API KEY ENDPOINTS =====

// List API keys for user
router.get('/api-keys', asyncHandler(async (req, res) => {
  const userId = (req as any).user.userId;
  const keys = await ApiKeyManager.listKeys(userId);

  res.json({
    success: true,
    statusCode: 200,
    message: 'API keys retrieved',
    data: keys,
    errors: null,
  });
}));

// Create new API key
router.post('/api-keys', asyncHandler(async (req, res) => {
  const userId = (req as any).user.userId;
  const { name, permissions = ['read'], expiresInDays } = req.body;

  const newKey = await ApiKeyManager.createKey(
    userId,
    name,
    permissions,
    (req as any).user.organizationId,
    expiresInDays
  );

  res.json({
    success: true,
    statusCode: 201,
    message: 'API key created (save this key, it will not be shown again)',
    data: newKey,
    errors: null,
  });
}));

// Rotate API key
router.post('/api-keys/:id/rotate', asyncHandler(async (req, res) => {
  const userId = (req as any).user.userId;
  const keyId = req.params.id;

  const newKey = await ApiKeyManager.rotateKey(keyId, userId);

  res.json({
    success: true,
    statusCode: 200,
    message: 'API key rotated',
    data: newKey,
    errors: null,
  });
}));

// Revoke API key
router.delete('/api-keys/:id', asyncHandler(async (req, res) => {
  const userId = (req as any).user.userId;
  const keyId = req.params.id;

  await ApiKeyManager.revokeKey(keyId);

  res.json({
    success: true,
    statusCode: 200,
    message: 'API key revoked',
    data: null,
    errors: null,
  });
}));

// ===== LOGGING ENDPOINTS =====

// Get log statistics
router.get('/log-stats', asyncHandler(async (req, res) => {
  const logger = getLogger();
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const stats = logger.getLogStats(date);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Log statistics retrieved',
    data: stats,
    errors: null,
  });
}));

// Clean old logs
router.post('/logs/cleanup', asyncHandler(async (req, res) => {
  const logger = getLogger();
  const daysToKeep = parseInt(req.body.daysToKeep) || 30;
  const deletedCount = logger.cleanOldLogs(daysToKeep);

  res.json({
    success: true,
    statusCode: 200,
    message: `Cleaned up ${deletedCount} old log files`,
    data: { deletedCount },
    errors: null,
  });
}));

export default router;
```

## Step 5: Add to Main Routes

Update `src/routes/v1/index.ts`:

```typescript
import securityRoutes from './security.routes';

// ... other routes

router.use('/security', securityRoutes);
```

## Step 6: Update Environment Variables

Add to `.env` and `.env.production`:

```bash
# Logging
LOG_DIR=./logs
LOG_LEVEL=info

# API Keys
API_KEY_RATE_LIMIT=100  # requests per minute per key

# Backups
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_PASSWORD=your_secure_password_here
```

## Step 7: Add Package.json Scripts

```json
{
  "scripts": {
    "dev": "nodemon --ext ts,json --exec ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "lint": "eslint src --ext .ts",
    "backup": "node dist/scripts/backup.js",
    "backup:list": "node dist/scripts/backup.js --list",
    "backup:cleanup": "node dist/scripts/backup.js --cleanup",
    "backup:restore": "node dist/scripts/backup.js --restore"
  }
}
```

## Step 8: Test Integration

```bash
# Build
npm run build

# Start server
npm start

# In another terminal, test logging
curl http://localhost:5000/api/v1/health

# Test API key management
curl -X POST http://localhost:5000/api/v1/security/api-keys \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My API Key","permissions":["read"]}'

# Test audit logs
curl http://localhost:5000/api/v1/security/audit-logs \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# Create backup
npm run backup

# List backups
npm run backup:list
```

## Dashboard Queries

### Check Current Logs
```bash
tail -f logs/info-$(date +%Y-%m-%d).log
```

### Count Request Types
```bash
grep '"type":"REQUEST"' logs/info-$(date +%Y-%m-%d).log | wc -l
```

### Find Security Events
```bash
grep '"type":"SECURITY"' logs/warn-$(date +%Y-%m-%d).log
```

### List Backups
```bash
ls -lh backups/backup-*.tar.gz*
```

## Verification Checklist

After integration, verify:

- [ ] Logs are being written to `./logs/`
- [ ] API keys can be created and managed
- [ ] Audit logs capture admin actions
- [ ] Backups are created and encrypted
- [ ] Rate limiting is working
- [ ] Security headers are present
- [ ] Error logs show no TypeScript issues
- [ ] Admin endpoints require authentication

## Support

For issues with integration:

1. Check `./logs/error-*.log` for errors
2. Verify all environment variables are set
3. Ensure MongoDB is connected
4. Check that utilities are imported correctly
5. Review ADDITIONAL_SECURITY_ENHANCEMENTS.md for detailed docs

---

**Status**: ✅ Ready for integration  
**Difficulty**: Medium  
**Estimated Time**: 30-45 minutes
