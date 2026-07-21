# API Security Policy & Best Practices

## Overview
This document outlines the security policies and best practices for the Masjid Al-Rahma Platform APIs.

## 1. Authentication & Authorization

### JWT Token Management
- **Access Token**: 15 minutes expiry (configurable via `JWT_ACCESS_EXPIRY`)
- **Refresh Token**: 7 days expiry (configurable via `JWT_REFRESH_EXPIRY`)
- **Secrets**: Must be at least 32 characters and stored in environment variables
- **Token Validation**: All protected routes MUST verify tokens before processing

### Role-Based Access Control (RBAC)
- **Admin**: Full system access
- **Org Admin**: Organization-scoped access
- **Teacher**: Course and student management
- **Student**: Limited personal and course access
- **Parent**: Child progress monitoring

### Implementation Rules
```typescript
// ALWAYS use authMiddleware for protected routes
router.get('/protected', authMiddleware, handler);

// ALWAYS apply role checking after auth
router.get('/admin-only', authMiddleware, adminOnly, handler);

// Use pre-configured role guards for common patterns
router.get('/staff', authMiddleware, adminOrTeacher, handler);
```

## 2. Data Protection

### Input Validation
- **All user input must be validated** using Joi schemas
- **Sanitize** using provided validation utilities
- **Never trust** client-provided data

### Database Security
- Use `mongoSanitize` to prevent NoSQL injection
- Validate ObjectIds before querying
- Use parameterized queries (already handled by Mongoose)

### Output Encoding
- Escape HTML entities when returning user-generated content
- Remove sensitive fields from API responses
- Use sanitization utilities for XSS prevention

## 3. API Security Features Implemented

### Middleware Security
- ✅ **Helmet.js**: Security headers (HSTS, X-Frame-Options, etc.)
- ✅ **CORS**: Origin whitelist with credential support
- ✅ **Rate Limiting**: General (1000/min) and auth-specific (5/15min)
- ✅ **Request Timeout**: 30 seconds default (prevents slow-read attacks)
- ✅ **mongoSanitize**: NoSQL injection prevention
- ✅ **HTTPS Enforcement**: Redirects in production
- ✅ **CSP Headers**: Content Security Policy
- ✅ **Security Logging**: Monitors suspicious patterns

### Response Headers
```
API-Version: 1.0.0
X-API-Version: 1.0.0
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'...
Strict-Transport-Security: max-age=31536000
```

## 4. Password Policy

### Requirements
- **Minimum 8 characters**
- **At least 1 uppercase letter**
- **At least 1 lowercase letter**
- **At least 1 number**
- **At least 1 special character** (!@#$%^&*)

### Hashing
- Use `bcrypt` with salt rounds 10 (minimum)
- Never log or expose password hashes
- Always compare with bcrypt.compare()

## 5. Rate Limiting Strategy

### General API
- **Limit**: 1000 requests per minute
- **Window**: 1 minute (configurable)
- **Skip**: Health checks

### Authentication Endpoints
- **Login**: 5 failed attempts per 15 minutes
- **Register**: 5 requests per 15 minutes
- **Password Reset**: 5 requests per hour

### Implementation
```typescript
// Apply stricter limiting to sensitive endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
});

router.post('/auth/login', authLimiter, handler);
```

## 6. HTTPS/TLS Requirements

### Production (MANDATORY)
- **Protocol**: HTTPS only
- **TLS Version**: 1.2 or higher
- **HSTS**: Enabled (max-age: 31536000 seconds = 1 year)
- **Certificates**: Valid SSL/TLS certificates from trusted CA

### Environment Configuration
```bash
# .env.production
NODE_ENV=production
HTTPS_ONLY=true
TLS_MIN_VERSION=1.2
HSTS_MAX_AGE=31536000
```

## 7. Environment Variables (Security-Critical)

### Must Be Set
- `JWT_ACCESS_SECRET` - ≥32 characters
- `JWT_REFRESH_SECRET` - ≥32 characters  
- `MONGODB_URI` - Connection string
- `NODE_ENV` - production/development

### Should Be Set
- `CLIENT_URL` - Frontend origin for CORS
- `RATE_LIMIT_MAX` - Default 1000
- `RATE_LIMIT_WINDOW` - Default 1 minute
- `REQUEST_TIMEOUT_MS` - Default 30000

### Never Commit
- Database credentials
- JWT secrets
- API keys
- Private keys

Use `.env.production` and `.env.example` only.

## 8. File Upload Security

### Validation Rules
```typescript
const uploadOptions = {
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedMimeTypes: ['image/jpeg', 'image/png'],
  allowedExtensions: ['jpg', 'jpeg', 'png'],
};

const validation = validateFileUpload(file, uploadOptions);
```

### Best Practices
- **Always validate** file size, type, and extension
- **Sanitize** filenames to prevent directory traversal
- **Store** files outside webroot when possible
- **Generate** random filenames to prevent enumeration
- **Scan** for malware using third-party services

## 9. SQL/NoSQL Injection Prevention

### Safe Patterns
```typescript
// ✅ SAFE: Mongoose with validation
const user = await User.findById(userId);

// ✅ SAFE: Validated input
const validated = validateObjectId(userId);
const user = await User.findById(validated);

// ❌ DANGEROUS: Direct string interpolation
const user = await User.findById(`${userId}`);
```

### Always Use
- Mongoose models and methods
- Joi validation schemas
- Type-safe queries
- Prepared statements

## 10. Cross-Site Request Forgery (CSRF)

### Current Implementation
- Cookie-based CSRF tokens embedded in session
- SameSite cookie attribute enforced
- Origin validation via CORS

### Best Practices
- **SameSite=Strict** for sensitive endpoints
- **Custom CSRF tokens** for state-changing operations
- **Verify Origin header** for POST/PUT/DELETE

## 11. Logging & Monitoring

### Log Everything
- Authentication attempts (success/failure)
- Authorization failures
- Suspicious patterns (SQL, script tags)
- Rate limit violations
- API errors with context

### Never Log
- Passwords
- JWT tokens
- Credit card numbers
- Sensitive user data

### Example
```typescript
// ✅ GOOD: Log security events
console.log(`[SECURITY] Failed login attempt for user ${userId} from ${ip}`);

// ❌ BAD: Logging sensitive data
console.log(`User password: ${password}`);
```

## 12. API Endpoint Security Checklist

### For Each Endpoint
- [ ] Authentication required? (except public endpoints)
- [ ] Proper role checks applied?
- [ ] Input validation with schemas?
- [ ] Output sanitization?
- [ ] Rate limiting appropriate?
- [ ] Error messages don't leak info?
- [ ] Database queries safe?
- [ ] File uploads validated?
- [ ] Logging implemented?

### Protected Route Template
```typescript
router.post(
  '/resource',
  authMiddleware,           // Verify JWT
  roleMiddleware(['admin']), // Check role
  validate(schema),          // Validate input
  asyncHandler(controller)   // Handle errors
);
```

## 13. Third-Party Dependencies

### Security Updates
- Run `npm audit` regularly
- Update dependencies monthly minimum
- Test updates in staging before production
- Monitor security advisories

### Current Security Dependencies
- `helmet` - Security headers
- `cors` - Cross-Origin Resource Sharing
- `express-rate-limit` - Rate limiting
- `express-mongo-sanitize` - NoSQL injection prevention
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT handling

## 14. Deployment Security

### Pre-Deployment Checklist
- [ ] All environment variables set correctly
- [ ] SSL/TLS certificates installed
- [ ] Rate limits configured
- [ ] CORS origins whitelist updated
- [ ] Database backups enabled
- [ ] Logging configured
- [ ] Monitoring alerts set up
- [ ] Security headers verified
- [ ] No debug logging in production

### Docker Security
```dockerfile
# Use minimal base image
FROM node:18-alpine

# Run as non-root
USER node

# Don't expose secrets
RUN --mount=type=secret,id=npm_token

# Regular security updates
RUN apk update && apk upgrade
```

## 15. Incident Response

### If Breach Suspected
1. Disable affected user accounts
2. Rotate JWT secrets
3. Require password reset
4. Audit access logs
5. Notify affected users
6. Post-mortem analysis

### Contacts
- Security Officer: [contact]
- Development Lead: [contact]
- System Administrator: [contact]

## 16. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-20 | Initial security policy |

---

**For questions or to report security issues, contact the security team.**
