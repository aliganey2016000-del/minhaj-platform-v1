# Production hardening — what must be configured outside the code

The code changes in the 2026-10-04 audit are inert until the settings below are
in place. Nothing here needs a database migration.

## Coolify

| Setting | Where | Notes |
| --- | --- | --- |
| `TENANT_PROXY_SECRET` | Backend app **and** frontend (nginx) app, same value | Optional but recommended. The frontend container writes it into every API-bound request; the API then trusts `X-Tenant-Host` only with it. Letters, digits and `. _ ~ -` only. **Set it on both apps in the same deployment**: backend-only breaks every school site (404), frontend-only is harmless. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Backend app | Must differ from each other and must not be a copied placeholder, or the API refuses to start in production. 32+ random characters (a shorter secret only logs a warning). |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Backend app | Without SMTP, password-reset and verification mails are **not sent** in production (their links are no longer written to the logs). |
| Persistent storage `/app/uploads` | Backend app | Required, or every upload disappears on deploy. |
| Backups | Coolify database backups, or a host with `mongodb-database-tools` | The API image has no `mongodump`, so `scripts/backup.ts` cannot run inside it. Schedule backups (Coolify → database → Backups, or cron on a host), keep a copy off the server, and **test a restore** with `node backup.js --restore <file> --yes` against a scratch database. Set `BACKUP_ENCRYPTION_PASSWORD`. |
| Graceful stop | Backend app | Coolify's default `SIGTERM` is now handled (in-flight requests finish, up to 20 s). Keep the stop timeout at 30 s or more. |

## Cloudflare

- Proxy (orange cloud) on for `sahaledu.com`, `*.sahaledu.com` and `api.sahaledu.com`; SSL/TLS mode **Full (strict)**.
- Restrict the origin's firewall to Cloudflare's IP ranges (the API only honours `CF-Connecting-IP` from Cloudflare or private proxies).
- Add a rate-limiting rule for `/api/v1/auth/*` (the API also limits per account and per IP, but edge limits stop floods earlier).
- Bypass cache for `/api/*`.
- Custom domains: certificates are not issued by the app. Use Cloudflare for SaaS (custom hostnames) or an ACME proxy.

## Dependencies that cannot be fixed from npm

`xlsx` (SheetJS) 0.18.5 has known prototype-pollution and ReDoS advisories and no fixed version on npm.
Spreadsheet imports are limited to signed-in staff and 10–25 MB files, which limits exposure, but upgrade:

```
cd apps/backend && npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

`exceljs` pulls a moderate `uuid` advisory (no API impact here; fixed by a major `exceljs` upgrade).

## Data

- No required migration or backfill.
- `ActivityLog` gained an optional, indexed `school`. Entries written before this carry none and are visible to the platform admin only.
- `School.customDomainVerified` is unset on existing organizations, which counts as verified (grandfathered).
- Review existing `customDomain` values once; to force re-verification set `customDomainVerified: false` for a school.
