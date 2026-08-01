import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';
import { getAllowedOrigins } from './utils/cors-origins';
import {
  enforceHttps,
  requestTimeout,
  stripSensitiveHeaders,
  setContentSecurityPolicy,
  validateSecurityEnv,
  addApiVersionHeader,
  securityLogging,
} from './middleware/security.middleware';

const app = express();

// ---------------------------------------------------------------------------
// Validate Security Configuration at Startup
// ---------------------------------------------------------------------------
validateSecurityEnv();

// ---------------------------------------------------------------------------
// Trust proxy (required for rate limiting behind reverse proxy)
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security Middleware
// ---------------------------------------------------------------------------
app.use(enforceHttps);
app.use(helmet({
  contentSecurityPolicy: false, // We handle this separately
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
}));
const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin: (origin, callback) => {
    // No Origin header (server-to-server, curl, same-origin) — allow.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'API-Version'],
  maxAge: 86400, // 24 hours
}));
app.use(stripSensitiveHeaders);
app.use(setContentSecurityPolicy);
app.use(addApiVersionHeader);

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------
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
  skip: (req) => req.path === '/v1/health', // Skip health checks — req.path is relative to the '/api/' mount point
});

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many login attempts, please try again later',
    data: null,
    errors: null,
  },
  skipSuccessfulRequests: true, // Only count failed requests
});

app.use('/api/', limiter);
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// ---------------------------------------------------------------------------
// Body Parsing
// ---------------------------------------------------------------------------
app.use(requestTimeout()); // Request timeout protection
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(securityLogging); // Monitor suspicious patterns — must run after body parsing so req.body is populated

// ---------------------------------------------------------------------------
// Data Sanitization
// ---------------------------------------------------------------------------
app.use(mongoSanitize());

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use(routes);

// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: 'Route not found',
    data: null,
    errors: null,
  });
});

// ---------------------------------------------------------------------------
// Global Error Handler (must be last)
// ---------------------------------------------------------------------------
app.use(errorHandler);

export default app;