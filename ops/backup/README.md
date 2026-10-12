# Off-server backup to Google Drive (rclone + crypt + cron)

Daily 03:00: MongoDB dump + app files/uploads + config → verified → encrypted by rclone `crypt` →
Google Drive folder `server-backup` → keep newest 14 → alert (Telegram/email) on any failure.

Each backup is a folder `YYYY-MM-DD_HHMMSS/` holding `db-*.archive.gz`, `files-*.tar.gz`,
`config-*.tar.gz`, `SHA256SUMS-*.txt`. Names and contents are encrypted on Drive.

## Size / quota
Run on the VPS and keep it under ~1 GB per backup (14 × 1 GB ≈ 14 GB, near the 15 GB limit):
```
du -sh /var/www /opt/minhaj-platform-v1/apps/backend/uploads
mongodump --uri="$MONGODB_URI" --archive --gzip | wc -c
```
If larger: lower `KEEP_BACKUPS`, or exclude big regenerable folders via `FILES_EXCLUDE`.
Uploads are re-sent in full every day (compressed), so uploads dominate the size.

## One-time setup (as root on the VPS)
```
curl https://rclone.org/install.sh | bash                     # rclone
apt-get install -y mongodb-database-tools                     # mongodump / mongorestore (or MongoDB's repo)
mkdir -p /opt/server-backup && cp server-backup.sh server-restore.sh /opt/server-backup/
chmod 700 /opt/server-backup/*.sh
cp server-backup.env.example /etc/server-backup.env && chmod 600 /etc/server-backup.env && nano /etc/server-backup.env
```
Create the remotes with the **dedicated** Google account (`rclone config`):
1. `n` → name `gdrive` → storage `drive` → scope `drive.file` (only files rclone creates) →
   `root_folder_id` = ID of the Drive folder `server-backup` → auth. On a headless VPS answer
   "n" to "auto config" and run `rclone authorize "drive"` on your laptop, paste the token.
   Create your own Google Cloud OAuth client_id/secret for reliability (the shared one is rate-limited).
2. `n` → name `gdrive-crypt` → storage `crypt` → remote `gdrive:` → filename encryption `standard`,
   directory name encryption `true` → set your own long password **and** salt.
```
chmod 600 /root/.config/rclone/rclone.conf
rclone obscure ...   # not needed; `rclone config` stores passwords obscured
```
**Back up `rclone.conf` (or at least the two crypt passwords) in a password manager, off the server.
Without them the backups cannot be decrypted.** The server's `.env`, `rclone.conf`, and
`/etc/server-backup.env` are not part of this Git repo; never commit them.

Alerts: create a Telegram bot with @BotFather, send it a message, get `chat_id` from
`https://api.telegram.org/bot<TOKEN>/getUpdates`, put both in `/etc/server-backup.env`.

Install the schedule and do a first manual run:
```
cp server-backup.cron /etc/cron.d/server-backup && chmod 644 /etc/cron.d/server-backup
/opt/server-backup/server-backup.sh && tail /var/log/server-backup/backup-*.log
```
Test the alert once: temporarily set a wrong `MONGODB_URI` and run the script; you must receive the alert.

## Restore (step by step)
Needs `/etc/server-backup.env` + `rclone.conf` on the machine (copy them there from the password manager).
```
S=/opt/server-backup/server-restore.sh
$S list                                    # available backups
$S verify  2026-10-11_030001               # download + checksum + archive test (restores nothing)
$S files   2026-10-11_030001 /restore      # files+config extracted under /restore (absolute paths preserved)
$S db      2026-10-11_030001 "mongodb://127.0.0.1:27017/minhaj_restore_test"   # to a TEST db first
$S db      2026-10-11_030001 "$PROD_URI" --drop                               # real recovery
```
Then copy needed files from `/restore/...` into place (e.g. uploads, `.env`, nginx config), restart the app
(`pm2 restart all` / `systemctl restart ...`).

Monthly drill: run `verify` and a `db` restore into a scratch database, then open the app against it.

## What was tested (and what was not)
Tested locally with stand-ins for rclone/mongodump: backup flow, checksums, exclusion of `node_modules`,
retention (5 runs, 3 kept), restore of files/config/db, non-zero exit + cleanup on failure.
**Not tested here:** real Google Drive/crypt, real `mongodump`, Telegram/email delivery
(no access to the VPS or those services from the build sandbox). Do the first-run and alert tests above on the server.
