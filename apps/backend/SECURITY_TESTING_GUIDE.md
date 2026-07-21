# API Security Testing Guide

## Quick Start

### 1. Environment Setup
```bash
cd backend
cp .env.example .env
# Edit .env with your test values
```

### 2. Generate Secure JWT Secrets
```bash
# Generate JWT_ACCESS_SECRET
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT_REFRESH_SECRET
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Run Automated Tests
```bash
npm test
```

## Manual Security Testing

### Authentication & Authorization

#### Test 1: Missing Auth Header
```bash
curl -X GET http://localhost:5000/api/v1/users
# Expected: 401 Unauthorized with error message
```

#### Test 2: Invalid Token
```bash
curl -X GET http://localhost:5000/api/v1/users \
  -H "Authorization: Bearer invalid_token"
# Expected: 401 Unauthorized
```

#### Test 3: Expired Token
```bash
# Use an expired token
curl -X GET http://localhost:5000/api/v1/users \
  -H "Authorization: Bearer eyJhbGc..."
# Expected: 401 Token expired
```

#### Test 4: Valid Token - Insufficient Role
```bash
# Use a student token to access admin endpoint
curl -X GET http://localhost:5000/api/v1/system/settings \
  -H "Authorization: Bearer student_token"
# Expected: 403 Forbidden with role message
```

#### Test 5: Valid Token - Correct Role
```bash
# Use an admin token to access admin endpoint
curl -X GET http://localhost:5000/api/v1/system/settings \
  -H "Authorization: Bearer admin_token"
# Expected: 200 with data
```

### Input Validation

#### Test 6: Missing Required Fields
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
# Expected: 400 validation error (missing password, etc.)
```

#### Test 7: Invalid Email Format
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "not_an_email",
    "password": "SecurePass123!",
    "name": "Test User"
  }'
# Expected: 400 validation error
```

#### Test 8: Weak Password
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "weak",
    "name": "Test User"
  }'
# Expected: 400 password policy error
```

### Rate Limiting

#### Test 9: Exceed Rate Limit
```bash
# Make 6 login attempts within 15 minutes
for i in {1..6}; do
  curl -X POST http://localhost:5000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "test@example.com", "password": "WrongPass123!"}'
  echo "Attempt $i"
done
# Expected: 429 Too Many Requests after 5th attempt
```

### XSS Prevention

#### Test 10: Script Injection
```bash
curl -X POST http://localhost:5000/api/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin_token" \
  -d '{
    "name": "<script>alert(\"XSS\")</script>",
    "email": "test@example.com"
  }'
# Expected: Input sanitized or rejected
```

### SQL/NoSQL Injection

#### Test 11: MongoDB Injection
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": {"$ne": null},
    "password": {"$ne": null}
  }'
# Expected: 400 validation error (mongoSanitize prevents this)
```

#### Test 12: NoSQL Query Injection
```bash
curl -X GET "http://localhost:5000/api/v1/users?id={\"\$ne\":null}" \
  -H "Authorization: Bearer admin_token"
# Expected: Properly escaped or rejected
```

### CSRF & CORS

#### Test 13: CORS - Disallowed Origin
```bash
curl -X GET http://localhost:5000/api/v1/health \
  -H "Origin: http://attacker.com"
# Expected: CORS headers not set for disallowed origin
```

#### Test 14: CORS - Allowed Origin
```bash
curl -X GET http://localhost:5000/api/v1/health \
  -H "Origin: http://localhost:5173"
# Expected: CORS headers present in response
```

### Security Headers

#### Test 15: Verify Security Headers
```bash
curl -I http://localhost:5000/api/v1/health
```

Expected headers:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: ...
API-Version: 1.0.0
```

### File Upload Security

#### Test 16: Upload Large File
```bash
# Create 15MB test file
dd if=/dev/zero of=large_file.bin bs=1M count=15

curl -X POST http://localhost:5000/api/v1/resources \
  -F "file=@large_file.bin" \
  -H "Authorization: Bearer teacher_token"
# Expected: 413 Payload Too Large
```

#### Test 17: Upload Malicious File Type
```bash
curl -X POST http://localhost:5000/api/v1/resources \
  -F "file=@malicious.exe" \
  -H "Authorization: Bearer teacher_token"
# Expected: 400 Invalid file type
```

### Request Timeout

#### Test 18: Slow Request
```bash
# Send partial request and wait > 30 seconds
timeout 35 curl -X POST http://localhost:5000/api/v1/test \
  -H "Content-Type: application/json" \
  --data-raw '{'
# Expected: 408 Request Timeout after 30 seconds
```

## Automated Security Test Script

Create `test-security.sh`:
```bash
#!/bin/bash

API_BASE="http://localhost:5000/api/v1"
ADMIN_TOKEN="your_admin_token_here"
STUDENT_TOKEN="your_student_token_here"

echo "🔐 Starting API Security Tests..."

# Test 1: Missing Auth
echo -n "Test 1: Missing Auth - "
response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_BASE/users")
if [ "$response" = "401" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL (got $response)"
fi

# Test 2: Invalid Token
echo -n "Test 2: Invalid Token - "
response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_BASE/users" \
  -H "Authorization: Bearer invalid")
if [ "$response" = "401" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL (got $response)"
fi

# Test 3: Insufficient Role
echo -n "Test 3: Insufficient Role - "
response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_BASE/system/settings" \
  -H "Authorization: Bearer $STUDENT_TOKEN")
if [ "$response" = "403" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL (got $response)"
fi

# Test 4: Rate Limiting
echo -n "Test 4: Rate Limiting - "
for i in {1..6}; do
  response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"bad@test.com","password":"BadPass123!"}')
done
if [ "$response" = "429" ]; then
  echo "✅ PASS"
else
  echo "❌ FAIL (got $response)"
fi

echo "🎉 Security Tests Complete!"
```

Run it:
```bash
chmod +x test-security.sh
./test-security.sh
```

## Security Checklist Before Deployment

- [ ] All environment variables set correctly
- [ ] JWT secrets are ≥32 characters and random
- [ ] Database credentials are secure
- [ ] CORS origins are whitelisted correctly
- [ ] HTTPS is enforced in production
- [ ] Rate limits are appropriate for load
- [ ] Security headers are returned correctly
- [ ] Input validation is working
- [ ] Auth middleware is on all protected routes
- [ ] Role checks are enforced
- [ ] No sensitive data in error responses
- [ ] File uploads are validated
- [ ] Logging is configured
- [ ] Database backups are enabled
- [ ] Monitoring/alerting is set up

## Security Testing Tools

### OWASP ZAP
```bash
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:5000/api/v1
```

### Burp Suite Community
- Download from https://portswigger.net/burp/communitydownload
- Proxy API requests through Burp
- Run active and passive scans

### npm audit
```bash
npm audit
npm audit fix  # Fix vulnerabilities
```

### SonarQube
```bash
docker run -d --name sonarqube -p 9000:9000 sonarqube:latest
```

## Reporting Security Issues

If you find a security vulnerability:

1. **DO NOT** create a public GitHub issue
2. **DO** email security@example.com with:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (optional)
3. **DO** allow time for response before public disclosure

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Guide](https://expressjs.com/en/advanced/best-practice-security.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [MongoDB Security](https://docs.mongodb.com/manual/security/)
