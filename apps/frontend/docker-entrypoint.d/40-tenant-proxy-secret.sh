#!/bin/sh
# Writes the include that adds the shared secret to every API-bound request.
# With TENANT_PROXY_SECRET unset the include is empty and nothing changes.
# Set the same value on the backend so it only trusts X-Tenant-Host from this
# proxy (see docs/multi-tenant-domains.md).
set -eu
target=/etc/nginx/tenant-proxy-secret.inc
if [ -n "${TENANT_PROXY_SECRET:-}" ]; then
  case "$TENANT_PROXY_SECRET" in
    *[!A-Za-z0-9._~-]*) echo "TENANT_PROXY_SECRET may only contain letters, digits and . _ ~ -" >&2; exit 1 ;;
  esac
  printf 'proxy_set_header X-Tenant-Proxy-Secret "%s";\n' "$TENANT_PROXY_SECRET" > "$target"
else
  : > "$target"
fi
