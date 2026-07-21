/**
 * Enhanced Security Middleware
 *
 * Provides comprehensive security features including:
 * - HTTPS/TLS enforcement
 * - Request timeout protection
 * - Content Security Policy
 * - Additional security headers
 * - Response header stripping
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Enforce HTTPS in production
 * Redirect HTTP to HTTPS with appropriate security headers
 */
export const enforceHttps = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'production' && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.header('host')}${req.url}`);
  }
  next();
};

/**
 * Request timeout middleware
 * Prevents slow-read attacks and resource exhaustion
 * Default: 30 seconds (configurable via environment)
 */
export const requestTimeout = (
  timeout: number = parseInt(process.env.REQUEST_TIMEOUT_MS || '120000')
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          statusCode: 408,
          message: 'Request timeout',
          data: null,
          errors: null,
        });
      }
    }, timeout);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
};

/**
 * Strip sensitive headers from response
 * Prevents information disclosure
 */
export const stripSensitiveHeaders = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Remove headers that might leak server information
  res.removeHeader('Server');
  res.removeHeader('X-Powered-By');
  res.removeHeader('X-AspNet-Version');

  // Set safe default headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  next();
};

/**
 * Validate and set Content Security Policy
 * Restricts what content can be loaded by the browser
 */
export const setContentSecurityPolicy = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isProd = process.env.NODE_ENV === 'production';
  const cspHeader = [
    "default-src 'self'",
    isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "media-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspHeader);
  next();
};

/**
 * Environment validation middleware
 * Ensures critical security environment variables are set
 */
export const validateSecurityEnv = (): void => {
  const requiredEnvVars = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'MONGODB_URI',
    'NODE_ENV',
  ];

  const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing critical security environment variables: ${missingVars.join(', ')}`
    );
  }
};

/**
 * Request size validation
 * Ensures JSON payload doesn't exceed safe limits
 */
export const validateRequestSize = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const maxJsonSize = 10 * 1024 * 1024; // 10MB default

  if (req.is('application/json') && req.socket.readableLength > maxJsonSize) {
    res.status(413).json({
      success: false,
      statusCode: 413,
      message: 'Payload too large',
      data: null,
      errors: null,
    });
    return;
  }

  next();
};

/**
 * API Version Header middleware
 * Adds API version information to responses
 */
export const addApiVersionHeader = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.setHeader('API-Version', '1.0.0');
  res.setHeader('X-API-Version', '1.0.0');

  // Add deprecation headers if needed
  if (process.env.API_DEPRECATION_DATE) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', process.env.API_DEPRECATION_DATE);
  }

  next();
};

/**
 * Request logging and monitoring
 * Logs suspicious request patterns
 */
export const securityLogging = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log requests with suspicious patterns
  const suspiciousPatterns = ['<script', 'drop table', 'union select', '--', '/*'];
  const checkString = `${req.url}${JSON.stringify(req.body)}`.toLowerCase();

  if (suspiciousPatterns.some((pattern) => checkString.includes(pattern))) {
    console.warn(`[SECURITY] Suspicious request detected from ${req.ip}:`, {
      url: req.url,
      method: req.method,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
  }

  next();
};
