#!/usr/bin/env python3
"""Upload fresh frontend build and rebuild Docker container."""
import paramiko, os, tarfile, io, time

HOST = '158.220.120.83'
USER = 'root'
PASS = os.environ["VPS_PASS"]
dist_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')

# Create tar.gz of dist folder in memory
print(f"Archiving {dist_path}...")
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz') as tar:
    for root, dirs, files in os.walk(dist_path):
        for f in files:
            fp = os.path.join(root, f)
            an = os.path.relpath(fp, dist_path)
            tar.add(fp, arcname=an)
buf.seek(0)
data = buf.read()
print(f"Dist archive: {len(data)} bytes")

# Connect to VPS
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

# Upload tarball
print("Uploading to server...")
sftp = c.open_sftp()
sftp.putfo(io.BytesIO(data), '/tmp/frontend-dist.tar.gz')
sftp.close()
print("Uploaded!")

# Extract and rebuild
cmds = [
    'rm -rf /var/www/masjid-al-rahma/frontend/dist',
    'cd /var/www/masjid-al-rahma/frontend && tar xzf /tmp/frontend-dist.tar.gz',
    'ls /var/www/masjid-al-rahma/frontend/dist/index.html && echo DIST_OK || echo DIST_FAIL',
    'rm /tmp/frontend-dist.tar.gz',
    'cd /var/www/masjid-al-rahma && docker compose -f docker-compose.prod.yml build --no-cache frontend 2>&1',
    'cd /var/www/masjid-al-rahma && docker compose -f docker-compose.prod.yml up -d --force-recreate frontend',
]
for cmd in cmds:
    print(f"\n>>> {cmd[:80]}...")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=180, get_pty=True)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out: print(out[-400:])
    if err:
        err_clean = err.strip()
        if err_clean and 'warning' not in err_clean.lower():
            print(f"STDERR: {err_clean[-200:]}")

# Wait for container
print("\nWaiting 20 seconds for container to start...")
time.sleep(20)

# Verify
stdin, stdout, stderr = c.exec_command('curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost/', timeout=20)
code = stdout.read().decode().strip()
print(f"\nFrontend HTTP code: {code}")

stdin, stdout, stderr = c.exec_command('curl -s --max-time 10 http://localhost/ | grep -o "<title>[^<]*</title>"', timeout=20)
title = stdout.read().decode().strip()
print(f"Page title: {title}")

stdin, stdout, stderr = c.exec_command('docker ps --filter name=masjid-frontend --format "{{.Status}}"', timeout=10)
status = stdout.read().decode().strip()
print(f"Container status: {status}")

c.close()
print("\n=== Done! Landing page should now show the new design. ===")
print("Visit: http://158.220.120.83/")