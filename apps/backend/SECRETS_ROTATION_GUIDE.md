# Secrets Rotation & Key Management Guide

## Overview

Rotating secrets regularly is a critical security practice that minimizes the impact of compromised credentials. This guide provides procedures for rotating all sensitive credentials in the Masjid Al-Rahma Platform.

## Secrets Inventory

| Secret | Location | Rotation Frequency | Impact | Priority |
|--------|----------|-------------------|--------|----------|
| JWT_ACCESS_SECRET | .env.production | Quarterly | High | CRITICAL |
| JWT_REFRESH_SECRET | .env.production | Quarterly | High | CRITICAL |
| MONGODB_PASSWORD | .env.production | Bi-annually | Medium | HIGH |
| PAYMENT_API_KEY | .env.production | Quarterly | Critical | CRITICAL |
| PAYMENT_WEBHOOK_SECRET | .env.production | Quarterly | Critical | CRITICAL |
| DEEPSEEK_API_KEY | .env.production | Quarterly | Low | MEDIUM |
| SMTP_PASSWORD | .env.production | Annually | Low | MEDIUM |
| BACKUP_ENCRYPTION_PASSWORD | Secure vault | Semi-annually | High | HIGH |
| SSL/TLS Certificate | CA | Annually | Critical | CRITICAL |
| API Keys | Database | Quarterly | Medium | MEDIUM |

## Pre-Rotation Checklist

- [ ] Schedule maintenance window (low traffic period)
- [ ] Backup current production database
- [ ] Notify all team members
- [ ] Prepare rollback plan
- [ ] Test in staging environment first
- [ ] Have 2FA and sudo access ready
- [ ] Document current secrets (in secure vault only)

## JWT Secrets Rotation

### Why Rotate?
- Invalidate old tokens
- Reduce token forgery risk
- Comply with security standards

### Step 1: Generate New Secrets
```bash
# Generate new JWT_ACCESS_SECRET
node -e "console.log('NEW_JWT_ACCESS_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate new JWT_REFRESH_SECRET
node -e "console.log('NEW_JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### Step 2: Graceful Token Migration
Create a dual-validation phase (1-2 hours):

```typescript
// Allow both old and new secrets temporarily
const secrets = [
  process.env.JWT_ACCESS_SECRET_NEW,
  process.env.JWT_ACCESS_SECRET_OLD, // Keep old for validation
];

export function verifyAccessToken(token: string): AccessTokenPayload {
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret);
    } catch (error) {
      // Try next secret
    }
  }
  throw new UnauthorizedError('Invalid token');
}
```

### Step 3: Update Environment
1. Set `JWT_ACCESS_SECRET_NEW` and `JWT_REFRESH_SECRET_NEW`
2. Deploy code with dual-validation
3. Wait for old tokens to expire naturally
4. Update `.env.production`:
   ```bash
   JWT_ACCESS_SECRET=<NEW_VALUE>
   JWT_REFRESH_SECRET=<NEW_VALUE>
   ```
5. Remove old secret references from code
6. Redeploy application

### Step 4: Verification
```bash
# Test with new tokens
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com", "password":"..."}'

# Verify token works
curl -X GET http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer <NEW_TOKEN>"
```

## MongoDB Password Rotation

### Step 1: Create New Database User
```bash
# Connect to MongoDB
mongosh "mongodb+srv://<current_user>:<current_password>@cluster.mongodb.net/admin"

# Create new user
db.createUser({
  user: "rahma_db_user_new",
  pwd: "NEW_SECURE_PASSWORD_32CHARS_MIN",
  roles: [
    { role: "readWrite", db: "masjid-al-rahma" },
    { role: "dbOwner", db: "masjid-al-rahma" }
  ]
})
```

### Step 2: Test Connection
```bash
# Test new credentials
mongosh "mongodb+srv://rahma_db_user_new:NEW_PASSWORD@cluster.mongodb.net/masjid-al-rahma"
```

### Step 3: Update Application
```bash
# Update .env.production
MONGODB_URI="mongodb+srv://rahma_db_user_new:NEW_PASSWORD@cluster.mongodb.net/masjid-al-rahma?..."
```

### Step 4: Verify & Cleanup
```bash
# Connect as admin and drop old user
db.dropUser("rayan2016003_db_user")
```

## Payment Gateway Secrets Rotation

### Stripe API Key Rotation
1. Log into Stripe Dashboard
2. Go to Developers → API Keys
3. Generate new **Restricted API Key**:
   - Permissions: Full access
   - IP Whitelist: Production server IPs only
4. Store in secure vault
5. Update `.env.production`:
   ```bash
   PAYMENT_API_KEY=sk_live_<NEW_KEY>
   ```
6. Redeploy application
7. Revoke old key in Stripe Dashboard

### Webhook Secret Rotation
1. In Stripe Dashboard → Webhooks
2. Select production endpoint
3. Generate new Signing Secret
4. Update:
   ```bash
   PAYMENT_WEBHOOK_SECRET=whsec_<NEW_SECRET>
   ```
5. Redeploy
6. Verify webhooks work
7. Delete old secret

## API Key Rotation (User-Generated)

### Automated Rotation
```bash
# Run migration to rotate all API keys
node -e "
const { ApiKeyManager } = require('./src/utils/api-key-manager');
const { User } = require('./src/models/user.model');

async function rotateAllKeys() {
  const users = await User.find({ isActive: true });
  
  for (const user of users) {
    const keys = await ApiKeyManager.listKeys(user._id);
    for (const key of keys) {
      await ApiKeyManager.rotateKey(key._id, user._id);
      console.log(\`✅ Rotated key: \${key.name}\`);
    }
  }
  
  console.log('✅ All API keys rotated');
}

rotateAllKeys().catch(console.error);
"
```

### Manual User Notification
Send email to all active API key users:
```
Subject: Security Alert: Please Rotate Your API Keys

Dear User,

As part of our security practices, we recommend rotating your API keys.

To rotate your API key:
1. Go to Settings → API Keys
2. Click "Rotate" on your current key
3. Save the new key in a secure location
4. Update your applications with the new key

Old keys will remain valid for 7 days before being revoked.

Questions? Contact security@masjid-al-rahma.com
```

## SSL/TLS Certificate Rotation

### For Let's Encrypt (Auto-Renewal)
```bash
# Check renewal status
certbot renew --dry-run

# Automatic renewal runs via cron (usually daily)
# Verify with:
0 0,12 * * * certbot renew --quiet --post-hook "systemctl reload nginx"
```

### For Manual Certificates
1. Obtain new certificate from CA
2. Place in `/etc/ssl/certs/`
3. Update nginx configuration
4. Test configuration:
   ```bash
   sudo nginx -t
   ```
5. Reload nginx:
   ```bash
   sudo systemctl reload nginx
   ```
6. Verify with:
   ```bash
   openssl s_client -connect localhost:443 | grep "issuer"
   ```

## Backup Encryption Password Rotation

### Step 1: Re-encrypt Existing Backups
```bash
# Decrypt with old password, encrypt with new
for backup in backups/backup-*.tar.gz.enc; do
  node scripts/decrypt-backup.js "$backup" "OLD_PASSWORD" | \
  node scripts/encrypt-backup.js -  "NEW_PASSWORD" > "${backup%.enc}.new.enc"
  rm "$backup"
  mv "${backup%.enc}.new.enc" "$backup"
done
```

### Step 2: Update Environment
```bash
BACKUP_ENCRYPTION_PASSWORD=NEW_SECURE_PASSWORD
```

### Step 3: Test Backup & Restore
```bash
# Create test backup
BACKUP_ENCRYPTION_PASSWORD=NEW_PASSWORD node scripts/backup.js

# Restore test backup
BACKUP_ENCRYPTION_PASSWORD=NEW_PASSWORD node scripts/backup.js --restore <test_backup>
```

## Third-Party API Keys Rotation

### General Procedure
1. Log into third-party service
2. Regenerate API key
3. Document old key expiration date
4. Update `.env.production`
5. Deploy application
6. Monitor error logs for 24 hours
7. Confirm no 401/403 errors
8. Delete old key from third-party service

### Specific Services

#### DeepSeek AI
1. Log into DeepSeek Console
2. Go to API Keys
3. Create new API key
4. Update `DEEPSEEK_API_KEY`
5. Deploy and test
6. Delete old key

#### SendGrid/SMTP
1. Generate new password
2. Update `SMTP_PASSWORD`
3. Test email sending
4. Delete old password

## Rotation Schedule Template

Create `ROTATION_SCHEDULE.md`:

```markdown
# Security Rotation Schedule 2026

| Date | Secret | Rotated By | Status | Notes |
|------|--------|-----------|--------|-------|
| Q1 2026 (Jan-Mar) | JWT_ACCESS_SECRET | [Name] | ☐ | - |
| Q1 2026 (Jan-Mar) | JWT_REFRESH_SECRET | [Name] | ☐ | - |
| Q2 2026 (Apr-Jun) | PAYMENT_API_KEY | [Name] | ☐ | - |
| Q2 2026 (Apr-Jun) | DEEPSEEK_API_KEY | [Name] | ☐ | - |
| Q3 2026 (Jul-Sep) | JWT_ACCESS_SECRET | [Name] | ☐ | - |
| Q3 2026 (Jul-Sep) | JWT_REFRESH_SECRET | [Name] | ☐ | - |
| Q4 2026 (Oct-Dec) | MONGODB_PASSWORD | [Name] | ☐ | - |
| Annually (Jan) | SSL/TLS Certificate | [Name] | ☐ | - |
```

## Monitoring & Alerts

### Set Up Alerts for Expiring Secrets

```typescript
// Add to monitoring job
async function checkExpiringSecrets() {
  const checks = [
    {
      name: 'SSL Certificate',
      expiresAt: process.env.SSL_EXPIRY_DATE,
    },
    {
      name: 'JWT Secrets',
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    },
  ];

  checks.forEach((check) => {
    const daysUntilExpiry = (check.expiresAt - Date.now()) / (24 * 60 * 60 * 1000);

    if (daysUntilExpiry < 30) {
      sendAlert(`⚠️  ${check.name} expires in ${daysUntilExpiry} days`);
    }
  });
}
```

## Emergency Secret Rotation

If compromise suspected:

1. **Immediately** (within minutes):
   - [ ] Disable compromised credential
   - [ ] Alert security team
   - [ ] Check access logs for unauthorized access

2. **Within 1 hour**:
   - [ ] Generate new credentials
   - [ ] Deploy new credentials
   - [ ] Verify service connectivity
   - [ ] Monitor for attacks

3. **Within 24 hours**:
   - [ ] Audit logs for compromise scope
   - [ ] Notify affected users
   - [ ] Document incident
   - [ ] Post-mortem analysis

4. **Within 1 week**:
   - [ ] Complete incident investigation
   - [ ] Implement preventive measures
   - [ ] Update security procedures

## Best Practices

1. **Never share secrets** via email or chat
2. **Use secure vault** (HashiCorp Vault, AWS Secrets Manager, etc.)
3. **Automate rotation** where possible
4. **Document procedures** in secure wiki
5. **Test rotation** in staging first
6. **Keep audit trail** of all rotations
7. **Monitor services** after rotation
8. **Use strong passwords** (32+ characters)
9. **Enable MFA** for secret access
10. **Review access logs** regularly

## Tools & Services

### Secret Management
- [HashiCorp Vault](https://www.vaultproject.io/)
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)
- [Azure Key Vault](https://azure.microsoft.com/services/key-vault/)
- [1Password Business](https://1password.com/business/)

### Monitoring
- [Snyk](https://snyk.io/)
- [WhiteSource](https://www.whitesourcesoftware.com/)
- [Dependency-check](https://owasp.org/www-project-dependency-check/)

### Automation
- [Ansible](https://www.ansible.com/) - Configuration management
- [Terraform](https://www.terraform.io/) - Infrastructure as code
- [CI/CD pipelines](https://github.com/features/actions) - Automated deployment

---

**Last Updated**: July 20, 2026  
**Next Review**: October 20, 2026
