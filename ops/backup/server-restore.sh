#!/usr/bin/env bash
# Restore / verify a backup made by server-backup.sh
#   server-restore.sh list
#   server-restore.sh verify  <backup-name> [work-dir]          # download + integrity check, restores nothing
#   server-restore.sh files   <backup-name> <target-dir>        # extract files/config archives into target-dir
#   server-restore.sh db      <backup-name> <mongodb-uri> [--drop]   # restore DB (use a TEST uri first!)
set -Eeuo pipefail
umask 077
ENV_FILE="${SERVER_BACKUP_ENV:-/etc/server-backup.env}"
# shellcheck disable=SC1090
. "$ENV_FILE"
[ -n "${RCLONE_CONFIG:-}" ] && export RCLONE_CONFIG
BASE="$RCLONE_REMOTE"; case "$BASE" in *:|*/) ;; *) BASE="$BASE/";; esac

cmd="${1:-}"; name="${2:-}"
fetch() { # fetch <name> <dir>
  mkdir -p "$2"; rclone copy "${BASE}$1" "$2"
  (cd "$2" && sha256sum -c SHA256SUMS-*.txt)
}
case "$cmd" in
  list) rclone lsf --dirs-only "$BASE" | tr -d '/' | sort ;;
  verify)
    [ -n "$name" ] || { echo "backup name required"; exit 2; }
    dir="${3:-$(mktemp -d)}"; fetch "$name" "$dir"
    gzip -t "$dir"/db-*.archive.gz
    for f in "$dir"/files-*.tar.gz "$dir"/config-*.tar.gz; do [ -f "$f" ] && tar -tzf "$f" >/dev/null; done
    echo "OK: checksums and archives valid in $dir" ;;
  files)
    target="${3:?target dir required}"; [ -n "$name" ] || exit 2
    dir="$(mktemp -d)"; fetch "$name" "$dir"; mkdir -p "$target"
    for f in "$dir"/files-*.tar.gz "$dir"/config-*.tar.gz; do [ -f "$f" ] && tar -xzf "$f" -C "$target"; done
    rm -rf "$dir"; echo "Extracted into $target (original absolute paths are preserved under it)" ;;
  db)
    uri="${3:?mongodb uri required}"; [ -n "$name" ] || exit 2
    dir="$(mktemp -d)"; fetch "$name" "$dir"
    flag=""; [ "${4:-}" = "--drop" ] && flag="--drop"
    mongorestore --uri="$uri" --archive="$(ls "$dir"/db-*.archive.gz)" --gzip $flag
    rm -rf "$dir"; echo "Database restored" ;;
  *) sed -n 2,7p "$0"; exit 2 ;;
esac
