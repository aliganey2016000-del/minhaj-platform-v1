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

import net from 'net';
import { Request, Response, NextFunction } from 'express';

/**
 * Resolve the client IP behind Cloudflare.
 *
 * The API is reached through several proxy hops that vary by request path
 * (Cloudflare edge, Coolify/Traefik, and the frontend's nginx container
 * proxying /api/ back out through Cloudflare for suganhub.com-style custom
 * domains). `app.set('trust proxy', N)` needs a single fixed hop count, so
 * any request path with a different hop count either collapses many real
 * users onto one IP (under-counting, causing false 429s) or lets a spoofed
 * X-Forwarded-For entry through (over-counting). Cloudflare's own
 * CF-Connecting-IP header is set at its edge from the real client's TCP
 * connection and carried through unchanged by every hop after it, so when
 * present it is used as the single X-Forwarded-For entry — Express then
 * resolves req.ip to this value regardless of how many proxies sit between
 * here and Cloudflare. This relies on the origin not being reachable except
 * through Cloudflare (handled at the infrastructure/firewall level); it is
 * no more spoofable than the trust-proxy-only setup it replaces.
 */
/**
 * Networks allowed to hand us a CF-Connecting-IP header: Cloudflare's
 * published edge ranges (https://www.cloudflare.com/ips/) plus private and
 * loopback ranges (the Coolify/Traefik hop and local development). Extra
 * ranges can be added with TRUSTED_PROXY_CIDRS (comma-separated CIDRs).
 */
const CLOUDFLARE_CIDRS = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
  '2a06:98c0::/29', '2c0f:f248::/32',
];
const PRIVATE_CIDRS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '::1/128', 'fc00::/7'];

function buildTrustedProxies(): net.BlockList {
  const list = new net.BlockList();
  const extra = String(process.env.TRUSTED_PROXY_CIDRS || '').split(',').map((value) => value.trim()).filter(Boolean);
  for (const cidr of [...CLOUDFLARE_CIDRS, ...PRIVATE_CIDRS, ...extra]) {
    const [address, prefix] = cidr.split('/');
    const family = net.isIPv6(address) ? 'ipv6' : 'ipv4';
    try { list.addSubnet(address, Number(prefix), family); } catch { /* ignore a malformed extra range */ }
  }
  return list;
}
const trustedProxies = buildTrustedProxies();

export function isTrustedProxyAddress(raw: string | undefined): boolean {
  if (!raw) return false;
  const address = raw.trim().replace(/^::ffff:/i, '');
  if (net.isIPv4(address)) return trustedProxies.check(address, 'ipv4');
  if (net.isIPv6(address)) return trustedProxies.check(address, 'ipv6');
  return false;
}

/**
 * The address that connected to our edge proxy: the last X-Forwarded-For
 * entry (appended by Traefik, the one hop `trust proxy` already trusts), or
 * the socket peer when no proxy is in front.
 */
function immediatePeer(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const chain = (Array.isArray(forwarded) ? forwarded.join(',') : forwarded || '').split(',').map((value) => value.trim()).filter(Boolean);
  return chain.length ? chain[chain.length - 1] : req.socket?.remoteAddress;
}

export const resolveCloudflareClientIp = (req: Request, _res: Response, next: NextFunction): void => {
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  const clientIp = Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
  // Only Cloudflare (or our own private proxy hop) may name the client. A
  // request that reached the origin from anywhere else could otherwise pick
  // any IP it liked and step around every per-IP rate limit.
  if (clientIp && clientIp.trim() && isTrustedProxyAddress(immediatePeer(req))) {
    req.headers['x-forwarded-for'] = clientIp.trim();
  }
  next();
};

/**
 * Enforce HTTPS in production
 * Redirect HTTP to HTTPS with appropriate security headers.
 *
 * The internal health endpoint is intentionally exempt because Docker's
 * healthcheck runs inside the container over plain HTTP; redirecting it to
 * HTTPS would make the container appear unhealthy even when the API is up.
 */
export const enforceHttps = (req: Request, res: Response, next: NextFunction): void => {
  const isHealthCheck = req.path === '/api/v1/health';

  if (
    process.env.NODE_ENV === 'production' &&
    !isHealthCheck &&
    req.header('x-forwarded-proto') !== 'https'
  ) {
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
