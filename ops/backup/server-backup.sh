#!/usr/bin/env bash
# Daily encrypted off-server backup: MongoDB + files + config -> rclone crypt -> Google Drive.
# Config: /etc/server-backup.env (override with SERVER_BACKUP_ENV=/path)
set -Eeuo pipefail
umask 077

ENV_FILE="${SERVER_BACKUP_ENV:-/etc/server-backup.env}"
[ -r "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 2; }
# shellcheck disable=SC1090
. "$ENV_FILE"

: "${MONGODB_URI:?}" "${RCLONE_REMOTE:?}" "${WORK_DIR:?}" "${LOG_DIR:?}"
KEEP_BACKUPS="${KEEP_BACKUPS:-14}"
LOG_KEEP_DAYS="${LOG_KEEP_DAYS:-30}"
MIN_FREE_MB="${MIN_FREE_MB:-2048}"
[ -n "${RCLONE_CONFIG:-}" ] && export RCLONE_CONFIG
BASE="$RCLONE_REMOTE"; case "$BASE" in *:|*/) ;; *) BASE="$BASE/";; esac

STAMP="$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$LOG_DIR" "$WORK_DIR"
LOG="$LOG_DIR/backup-$STAMP.log"
exec > >(tee -a "$LOG") 2>&1
log() { echo "[$(date '+%F %T')] $*"; }

alert() {
  local msg="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -sS -m 20 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${msg}" >/dev/null || echo "Telegram alert failed" >&2
  fi
  if [ -n "${ALERT_EMAIL:-}" ] && command -v mail >/dev/null 2>&1; then
    printf '%s\n\nLog: %s\n' "$msg" "$LOG" | mail -s "BACKUP FAILED on $(hostname)" "$ALERT_EMAIL" || echo "Email alert failed" >&2
  fi
}

RUN_DIR="$WORK_DIR/$STAMP"
MONGO_CFG=""
cleanup() { rm -rf "$RUN_DIR"; [ -n "$MONGO_CFG" ] && rm -f "$MONGO_CFG"; return 0; }
fail() {
  local code=$? line="${1:-?}"
  log "FAILED (exit $code) at line $line"
  alert "Backup FAILED on $(hostname) ($STAMP): exit $code at line $line. Log: $LOG"
  cleanup
  exit "$code"
}
trap 'fail $LINENO' ERR
trap cleanup EXIT

# One run at a time
exec 9>"$WORK_DIR/.lock"
flock -n 9 || { log "Another backup is running, exiting"; exit 0; }

for bin in mongodump rclone tar gzip sha256sum flock; do
  command -v "$bin" >/dev/null || { log "Missing command: $bin"; false; }
done

mkdir -p "$RUN_DIR"
free_mb=$(df -Pm "$WORK_DIR" | awk 'NR==2{print $4}')
[ "$free_mb" -ge "$MIN_FREE_MB" ] || { log "Only ${free_mb}MB free in $WORK_DIR (< $MIN_FREE_MB)"; false; }

log "=== Backup $STAMP started ==="

# 1. Database (URI goes through a 600 config file so the password is not visible in `ps`)
MONGO_CFG="$(mktemp "$WORK_DIR/mongo-cfg.XXXXXX")"
printf 'uri: "%s"\n' "${MONGODB_URI//\"/\\\"}" > "$MONGO_CFG"
log "Dumping MongoDB"
mongodump --config="$MONGO_CFG" --archive="$RUN_DIR/db-$STAMP.archive.gz" --gzip --quiet
rm -f "$MONGO_CFG"; MONGO_CFG=""
gzip -t "$RUN_DIR/db-$STAMP.archive.gz"

# 2. Application files + uploads
excludes=()
for p in ${FILES_EXCLUDE:-}; do excludes+=(--exclude="$p"); done
existing=()
for p in ${FILES_PATHS:-}; do
  if [ -e "$p" ]; then existing+=("$p"); else log "WARN: files path missing, skipped: $p"; fi
done
[ ${#existing[@]} -gt 0 ] || { log "No files paths exist"; false; }
log "Archiving files: ${existing[*]}"
# tar exit 1 = "file changed while reading" (live uploads); treat as warning, >=2 is fatal
rc=0; tar -czf "$RUN_DIR/files-$STAMP.tar.gz" "${excludes[@]}" -P "${existing[@]}" || rc=$?
[ "$rc" -le 1 ] || { log "tar failed ($rc)"; false; }
[ "$rc" -eq 0 ] || log "WARN: some files changed during archiving"

# 3. Config
cfg=()
for p in ${CONFIG_PATHS:-}; do
  if [ -e "$p" ]; then cfg+=("$p"); else log "WARN: config path missing, skipped: $p"; fi
done
if [ ${#cfg[@]} -gt 0 ]; then
  log "Archiving config: ${cfg[*]}"
  rc=0; tar -czf "$RUN_DIR/config-$STAMP.tar.gz" -P "${cfg[@]}" || rc=$?
  [ "$rc" -le 1 ] || { log "tar config failed ($rc)"; false; }
fi

# 4. Integrity: verify archives, write checksums
for f in "$RUN_DIR"/*.tar.gz; do tar -tzf "$f" >/dev/null; done
(cd "$RUN_DIR" && sha256sum -- * > "SHA256SUMS-$STAMP.txt")
log "Sizes: $(du -sh "$RUN_DIR"/* | awk '{printf "%s=%s ",$2,$1}')"

# 5. Upload (encrypted by the rclone crypt remote) and verify
DEST="${BASE}$STAMP"
log "Uploading to $DEST"
rclone copy "$RUN_DIR" "$DEST" --transfers 2 --retries 3 --low-level-retries 5
rclone check "$RUN_DIR" "$DEST" --one-way --size-only
log "Upload verified"

# 6. Retention: keep newest $KEEP_BACKUPS backup folders. Only reached after a verified upload.
mapfile -t all < <(rclone lsf --dirs-only "$BASE" | tr -d '/' | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$' | sort)
total=${#all[@]}
if [ "$total" -gt "$KEEP_BACKUPS" ]; then
  for d in "${all[@]:0:$((total-KEEP_BACKUPS))}"; do
    log "Retention: deleting old backup $d"
    rclone purge "${BASE}$d"
  done
fi
log "Backups on remote: $(( total > KEEP_BACKUPS ? KEEP_BACKUPS : total ))"

# 7. Local log rotation
find "$LOG_DIR" -name 'backup-*.log' -mtime +"$LOG_KEEP_DAYS" -delete

log "=== Backup $STAMP finished OK ==="
