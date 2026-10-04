# Database Backups

`scripts/backup.ts` dumps MongoDB with `mongodump`, tars and optionally
AES-256-encrypts the result, and applies a retention window. It exists in
the repo today but **nothing runs it automatically** — this doc is how the
owner wires it up.

## Why it can't just run inside the backend container

`mongodump`/`mongorestore` (the MongoDB Database Tools) are **not installed
in the backend's Docker image** (see `apps/backend/Dockerfile` — it only
installs the Node runtime and app dependencies). The backup script needs
them on `PATH`, so it must run either:

- on the **host** (the VPS/Coolify server itself), via a host cron job, or
- from a **sidecar container** that has the Mongo tools installed and can
  reach both the Mongo instance and a persistent volume for `BACKUP_DIR`.

The host-cron route is simplest for a single-VPS Coolify deployment and is
what's documented below.

## npm scripts

Run these from `apps/backend`:

| Script | What it does |
|---|---|
| `npm run backup` | Create one backup now (`scripts/backup.ts`, default command) |
| `npm run backup:list` | List existing backups in `BACKUP_DIR` |
| `npm run backup:cleanup` | Delete backups older than `BACKUP_RETENTION_DAYS` |
| `npm run backup:restore -- <file>` | Restore from a backup file (drops and restores the target DB — see Restore below) |

## Environment variables

Set these wherever the backup actually runs (the host's crontab environment,
or an env file sourced by the cron job — **not** necessarily the same
`.env`/`.env.production` the app container uses, though `MONGODB_URI` should
point at the same database):

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MONGODB_URI` | yes | — | Same connection string the backend uses. Must be reachable from wherever the script runs (the host, if Mongo is a Docker container, needs the port published or the script run inside the Docker network). |
| `BACKUP_DIR` | no | `./backups` | Point this at a persistent path outside any container's writable layer, e.g. `/var/backups/minhaj-platform`. |
| `BACKUP_RETENTION_DAYS` | no | `30` | Backups older than this are deleted by `backup:cleanup`. |
| `BACKUP_ENCRYPTION_PASSWORD` | strongly recommended | — | AES-256 encrypts the backup at rest. Without it, backups are plain `tar.gz` — fine for a quick local test, not for anything containing real student/financial data. Store this password somewhere other than the backup directory itself (a secrets manager, or Coolify's own secret store) — a password kept next to the backups it protects defeats the point. |

## Setting it up in Coolify (host cron)

1. SSH into the VPS Coolify runs on.
2. Make sure the MongoDB Database Tools are installed on the host (not just
   inside a container): `mongodump --version` should succeed. If missing,
   install the `mongodb-database-tools` package for the host's distro.
3. Pick a persistent directory for backups, e.g. `/var/backups/minhaj-platform`,
   and make sure it isn't inside any path Coolify would wipe on redeploy.
4. Add a crontab entry (`crontab -e`) that `cd`s into the backend's deployed
   source (wherever Coolify checks it out / or a dedicated clone just for
   this) and runs the backup with the env vars above, e.g.:

   ```cron
   # Daily backup at 2:00 AM server time
   0 2 * * * cd /path/to/minhaj-platform-v1/apps/backend && \
     MONGODB_URI='mongodb://...' \
     BACKUP_DIR='/var/backups/minhaj-platform' \
     BACKUP_RETENTION_DAYS=30 \
     BACKUP_ENCRYPTION_PASSWORD='<set via a secrets file, not inline>' \
     npm run backup >> /var/log/minhaj-backup.log 2>&1

   # Weekly cleanup of anything past retention (backup itself does not
   # delete old files, only --cleanup does)
   0 3 * * 0 cd /path/to/minhaj-platform-v1/apps/backend && \
     MONGODB_URI='mongodb://...' \
     BACKUP_DIR='/var/backups/minhaj-platform' \
     BACKUP_RETENTION_DAYS=30 \
     npm run backup:cleanup >> /var/log/minhaj-backup.log 2>&1
   ```

   Prefer sourcing the secrets (especially `BACKUP_ENCRYPTION_PASSWORD`)
   from a root-only env file (`. /etc/minhaj-backup.env &&  ...`) rather than
   inlining the password directly in the crontab, which any user able to
   run `crontab -l` as that user could read.
5. Confirm `node`/`npx`/`ts-node` are resolvable in cron's minimal
   environment — cron does not read your shell's `.bashrc`/`.profile`, so
   if `npm run backup` fails with "command not found", use absolute paths
   (`/usr/bin/node`, or the output of `which npm`) in the crontab line, or
   wrap the command in a small shell script that sets `PATH` first.
6. Copy backups off the VPS periodically (e.g. an `rclone`/`rsync` cron job
   to off-site storage) — backups that live only on the same disk as the
   database they protect don't survive a disk failure.

## Restore

**Restoring drops the target database first** (`mongorestore --drop`) — never
run this against a database you don't intend to fully replace.

```bash
cd apps/backend
MONGODB_URI='mongodb://...' \
BACKUP_ENCRYPTION_PASSWORD='...' \
npm run backup:restore -- /var/backups/minhaj-platform/backup-2026-01-15T02-00-00-000Z.tar.gz.enc
```

Steps the script performs:
1. Decrypts the file if it ends in `.enc` (requires `BACKUP_ENCRYPTION_PASSWORD`).
2. Extracts the tarball.
3. Runs `mongorestore --uri $MONGODB_URI --drop` against the extracted dump.
4. Cleans up its temp files.

Test restores periodically against a scratch database (a different
`MONGODB_URI`, e.g. a throwaway local/staging Mongo) — a backup you've never
restored is unverified, not a backup.

> **Round 4 fix (2026-10-04):** an earlier version of this script's restore
> path was actually broken — it extracted the archive into `BACKUP_DIR`
> directly and then looked for the dump at a hardcoded `BACKUP_DIR/dump/<db>`
> path that `createBackup` never produces (it writes a timestamped temp
> directory name instead), so a real restore would always fail to find the
> data it had just extracted. Restore now extracts into a disposable temp
> directory and locates the dump by searching for a directory named after
> the database, which works regardless of the archive's internal layout.
> `src/__tests__/backup-restore.e2e.ts` exercises the full create→restore
> cycle (with stand-in `mongodump`/`mongorestore` executables, since the
> real tools aren't installed in CI or most dev sandboxes) and would have
> caught this.

## Listing and manually cleaning up

```bash
cd apps/backend
BACKUP_DIR='/var/backups/minhaj-platform' npm run backup:list
BACKUP_DIR='/var/backups/minhaj-platform' BACKUP_RETENTION_DAYS=30 npm run backup:cleanup
```
