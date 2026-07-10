#!/usr/bin/env python3
"""Final verification for Contabo deployment."""

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
    print(f"> {cmd[:160]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120, get_pty=True)
    for line in iter(stdout.readline, ''):
        print(f"  {line.rstrip()}")
    err = stderr.read().decode()
    if err.strip():
        print(f"  [stderr] {err.rstrip()}")

c = ssh()

# 1. Kill coolify-proxy that keeps restarting and grabs port 80
run(c, "docker update --restart=no coolify-proxy 2>/dev/null; docker stop coolify-proxy 2>/dev/null; docker rm coolify-proxy 2>/dev/null; echo 'coolify-proxy disabled'",
    "Step 1: Permanently disable coolify-proxy (port 80 conflict)")

# 2. Wait and check backend
print("\n  Waiting 15 seconds for backend to fully initialize...")
time.sleep(15)

run(c, "docker ps --format 'table {{.Names}} | {{.Status}}'", "Container status")
run(c, "docker logs masjid-backend --tail 5", "Backend recent logs")
run(c, "curl -s --max-time 5 http://localhost:5000/api/v1/health", "API health check")
run(c, "curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost/ || echo 'Frontend http code above'", "Frontend check")

# 3. Remove port conflict more permanently
run(c, """cd /etc/coolify 2>/dev/null || echo 'No coolify config dir'
ls docker-compose*.yml 2>/dev/null || echo 'No compose files in /etc/coolify'""",
    "Check Coolify config")

print("\n" + "=" * 60)
print(f"  RESULTS")
print(f"  Frontend:  http://{HOST}")
print(f"  Coolify:   http://{HOST}:8000 (UI only)")
print(f"  API:       http://{HOST}:5000/api/v1/health")
print("=" * 60)

c.close()