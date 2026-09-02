/**
 * Security middleware for transport, browser and request hardening.
 */

import { Request, Response, NextFunction } from 'express';

export const enforceHttps = (req: Request, res: Response, next: NextFunction): void => {
  const isHealthCheck = req.path === '/api/v1/health';

  if (
    process.env.NODE_ENV === 'production' &&
    !isHealthCheck &&
    req.header('x-forwarded-proto') !== 'https'
  ) {
    const host = req.header('host');
    if (!host) {
      res.status(400).json({ success: false, statusCode: 400, message: 'Invalid host', data: null, errors: null });
      return;
    }
    return res.redirect(301, `https://${host}${req.url}`);
  }
  next();
};

/** Prevent slow requests from consuming server resources indefinitely. */
export const requestTimeout = (
  timeout: number = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10)
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
      req.destroy();
    }, timeout);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
};

export const stripSensitiveHeaders = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.removeHeader('Server');
  res.removeHeader('X-Powered-By');
  res.removeHeader('X-AspNet-Version');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
};

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
 * Helmet 7 does not expose a Permissions-Policy option in its TypeScript
 * options. Set the browser policy explicitly instead of using an invalid
 * Helmet configuration that breaks the TypeScript build.
 */
export const setPermissionsPolicy = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
};

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
 * This middleware is intentionally not used for body-size enforcement.
 * Express's parser limits in app.ts are the authoritative protection.
 */
export const validateRequestSize = (
  _req: Request,
  _res: Response,
  next: NextFunction
): void => next();

export const addApiVersionHeader = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.setHeader('API-Version', '1.0.0');
  res.setHeader('X-API-Version', '1.0.0');

  if (process.env.API_DEPRECATION_DATE) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', process.env.API_DEPRECATION_DATE);
  }

  next();
};

/** Log only metadata; never serialize request bodies into security logs. */
export const securityLogging = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const suspiciousPatterns = ['<script', 'drop table', 'union select', '--', '/*'];
  const checkString = req.url.toLowerCase();

  if (suspiciousPatterns.some((pattern) => checkString.includes(pattern))) {
    console.warn('[SECURITY] Suspicious request detected', {
      url: req.url,
      method: req.method,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });
  }

  next();
};
