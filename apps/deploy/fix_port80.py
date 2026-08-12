#!/usr/bin/env python3
"""Fix: Remove coolify-proxy from port 80 and move frontend to port 80."""
import os
import paramiko, time

HOST = "158.220.120.83"
USER = "root"
PASS = os.environ["VPS_PASS"]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

# Step 1: Permanently remove coolify-proxy
print("=== Stopping and removing coolify-proxy ===")
for cmd in [
    'docker update --restart=no coolify-proxy 2>/dev/null; echo done',
    'docker stop coolify-proxy 2>/dev/null; echo done',
    'docker rm -f coolify-proxy 2>/dev/null; echo done',
]:
    stdin, stdout, stderr = c.exec_command(cmd, timeout=30)
    print(stdout.read().decode().strip())

# Step 2: Fix port mapping and recreate frontend
print("\n=== Reconfiguring frontend to use port 80 ===")
cmds = [
    'cd /var/www/masjid-al-rahma && sed -i "s/3000:80/80:80/g" docker-compose.prod.yml && echo "Port mapping updated"',
    'cd /var/www/masjid-al-rahma && docker compose -f docker-compose.prod.yml up -d --force-recreate frontend 2>&1',
]
for cmd in cmds:
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120)
    print(stdout.read().decode().strip())

# Step 3: Wait and verify
print("\n=== Waiting 20 seconds for frontend to start ===")
time.sleep(20)

print("\n=== Verifying frontend on port 80 ===")
stdin, stdout, stderr = c.exec_command(
    'curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost/',
    timeout=20
)
code = stdout.read().decode().strip()
print(f"Frontend HTTP code: {code}")

# Container status
stdin, stdout, stderr = c.exec_command(
    'docker ps --filter name=masjid --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"',
    timeout=10
)
print("\nMasjid containers:")
print(stdout.read().decode().strip())

# Verify content
stdin, stdout, stderr = c.exec_command(
    'curl -s --max-time 10 http://localhost/ | head -20',
    timeout=20
)
html = stdout.read().decode().strip()
print(f"\nFrontend HTML (first 500 chars): {html[:500]}")

c.close()
print("\n=== Fix complete ===")