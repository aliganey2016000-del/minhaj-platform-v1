import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middleware/error.middleware';

const app = express();

// ---------------------------------------------------------------------------
// Trust proxy (required for rate limiting behind reverse proxy)
// ---------------------------------------------------------------------------
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Security Middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------
const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW || '15')) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests, please try again later',
    data: null,
    errors: null,
  },
});
app.use('/api/', limiter);

// ---------------------------------------------------------------------------
// Body Parsing
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

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