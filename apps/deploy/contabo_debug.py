#!/usr/bin/env python3
"""Debug backend restart loop on Contabo VPS."""

import paramiko, time, sys

HOST = "158.220.120.83"
USER = "root"
PASS = "635110Liiali"

def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)
    return c

def run(c, cmd, desc=""):
    print(f"\n--- {desc} ---")
    print(f"> {cmd[:140]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=60, get_pty=True)
    for line in iter(stdout.readline, ''):
        print(f"  {line.rstrip()}")
    err = stderr.read().decode()
    if err.strip():
        print(f"  [stderr] {err.rstrip()}")

c = ssh()

run(c, "docker ps -a --format 'table {{.Names}} | {{.Status}}'", "All containers")
run(c, "docker logs masjid-backend --tail 50 2>&1", "Backend logs")
run(c, "docker logs mongodb --tail 20 2>&1", "MongoDB logs")
run(c, "cat /var/www/masjid-al-rahma/backend/.env.production | head -5", "Env file")
run(c, "ls -la /var/www/masjid-al-rahma/backend/dist/src/ | head -10", "Backend dist contents")
run(c, "cat /var/www/masjid-al-rahma/docker-compose.prod.yml", "Compose file")

# Check if port 5000 is accessible
run(c, "netstat -tlnp | grep 5000 || ss -tlnp | grep 5000 || echo 'Port 5000 not listening'", "Port 5000")

c.close()
print("\n--- DONE ---")