import express from 'express';
import { ForbiddenError } from './utils/api-error';
import path from 'path';
import { verifyAccessToken } from './utils/jwt';
import { PRIVATE_UPLOAD_PREFIXES, UPLOADS_ROOT, setUploadHeaders } from './utils/upload-safety';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';
import { isAllowedOrigin } from './utils/cors-origins';
import {
  resolveCloudflareClientIp,
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
app.use(resolveCloudflareClientIp);

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

app.use(cors({
  origin: (origin, callback) => {
    void isAllowedOrigin(origin).then((allowed) => {
      if (allowed) callback(null, true);
      else callback(new ForbiddenError('This website origin is not registered.'));
    }).catch(callback);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Login-Session-Id', 'X-Timezone'],
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
// Student and teacher documents are private: they are only served through
// their authenticated, school-checked view endpoints, never as public files.
app.use('/uploads', (req, res, next) => {
  let requested: string;
  try {
    requested = path.posix.normalize(decodeURIComponent(req.path)).toLowerCase();
  } catch {
    requested = '';
  }
  if (!requested || PRIVATE_UPLOAD_PREFIXES.some((prefix) => requested.startsWith(prefix))) {
    res.status(404).json({ success: false, statusCode: 404, message: 'Not found', data: null, errors: null });
    return;
  }
  next();
});
// Stored file names are unique, so a day of caching is safe and keeps
// repeat views of logos, photos and gallery images off the Node process.
app.use('/uploads', express.static(UPLOADS_ROOT, {
  maxAge: '1d',
  index: false,
  dotfiles: 'deny',
  setHeaders: setUploadHeaders,
}));

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
  // Signed-in traffic is counted per account, not per IP: a whole campus or
  // school office behind one NAT address would otherwise share one budget.
  // The token's signature is checked, so a made-up user id cannot be used
  // to dodge the per-IP limit. Everything else stays per IP.
  keyGenerator: (req) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        return `user:${verifyAccessToken(header.slice(7)).userId}`;
      } catch {
        // fall through to the IP
      }
    }
    return `ip:${req.ip}`;
  },
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

// forgot-password and resend-verification always respond 200 (the generic
// "if an account exists..." body, win or lose) so that an attacker can't
// enumerate accounts by response code — but that means `skipSuccessfulRequests`
// would never count a single request against either limit, since every
// response looks "successful" to express-rate-limit. These two routes get
// their own limiters, counting every request, instead of reusing the
// login/register limiters above.
const accountLookupAccountLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests, please try again later',
    data: null,
    errors: null,
  },
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : 'unknown-account';
    return `account:${email}`;
  },
});

const accountLookupIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests from this network, please try again later',
    data: null,
    errors: null,
  },
});

app.use('/api/', limiter);
app.use('/api/v1/auth/login', authAccountLimiter, authIpLimiter);
app.use('/api/v1/auth/register', authAccountLimiter, authIpLimiter);
// forgot-password and resend-verification both look up a user by email and
// await an SMTP send before responding with the same generic "if an account
// exists..." body either way — without a per-target limit, an attacker can
// still time the enumeration by hammering one address until the account
// limiter trips (an unknown email returns immediately; a real one waits on
// mail delivery), and without an IP limit can sweep many addresses quickly.
app.use('/api/v1/auth/forgot-password', accountLookupAccountLimiter, accountLookupIpLimiter);
app.use('/api/v1/auth/resend-verification', accountLookupAccountLimiter, accountLookupIpLimiter);

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
