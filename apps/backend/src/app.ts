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
  setPermissionsPolicy,
  validateSecurityEnv,
  addApiVersionHeader,
  securityLogging,
} from './middleware/security.middleware';

const app = express();

validateSecurityEnv();

// Keep this aligned with the deployment topology: one trusted reverse proxy.
app.set('trust proxy', 1);

app.use(enforceHttps);
app.use(helmet({
  contentSecurityPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
}));

const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'API-Version'],
  maxAge: 86400,
}));
app.use(stripSensitiveHeaders);
app.use(setContentSecurityPolicy);
app.use(setPermissionsPolicy);
app.use(addApiVersionHeader);

app.use(requestTimeout());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(securityLogging);

const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW || '1', 10)) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests, please try again later',
    data: null,
    errors: null,
  },
  skip: (req) => req.path === '/v1/health',
});

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

app.use(mongoSanitize());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.use(routes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: 'Route not found',
    data: null,
    errors: null,
  });
});

app.use(errorHandler);

export default app;
