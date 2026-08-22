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
// Body Parsing
// ---------------------------------------------------------------------------
// Authentication rate limiting below keys failed attempts by account and IP,
// so the request body must be parsed before those limiters run.
app.use(requestTimeout());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(securityLogging);

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

// Authentication protection uses TWO independent limits:
// 1) Account limit: five failed attempts for one normalized email in 10 min.
//    This follows the account across changing IP addresses.
// 2) IP limit: thirty failed authentication attempts from one IP in 10 min.
//    This prevents an attacker from rotating email addresses to evade the
//    account limit, while still allowing legitimate users on shared networks.
// Successful requests are removed from both counters.
const authAccountLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
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
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : 'unknown-account';
    return `account:${email}`;
  },
});

const authIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many login attempts from this network, please try again later',
    data: null,
    errors: null,
  },
  skipSuccessfulRequests: true,
});

app.use('/api/', limiter);
app.use('/api/v1/auth/login', authAccountLimiter, authIpLimiter);
app.use('/api/v1/auth/register', authAccountLimiter, authIpLimiter);

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
