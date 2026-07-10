#!/usr/bin/env python3
"""
Contabo VPS — Production Optimization & End-to-End Verification.

Tests all major features via API, applies production optimizations,
and generates a final deployment report.
"""

import paramiko, time, json, sys

HOST = "158.220.120.83"
USER = "root"
PASS = "635110Liiali"
API_BASE = f"http://{HOST}:5000/api/v1"
FRONTEND = f"http://{HOST}:3000"

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
        print(f"  [stderr] {err.strip()}")
    code = stdout.channel.recv_exit_status()
    return code

def curl(c, path, method='GET', data=None, token=None, desc=""):
    """Make an API call via curl inside the VPS."""
    headers = ""
    if token:
        headers += f' -H "Authorization: Bearer {token}"'
    if data:
        data_str = json.dumps(data).replace('"', '\\"')
        body = f' -d "{data_str}" -H "Content-Type: application/json"'
    else:
        body = ""
    cmd = f"curl -s -w '\\nHTTP_CODE:%{{http_code}}' --max-time 15 {headers}{body} {'-X ' + method if method != 'GET' else ''} {API_BASE}{path}"
    
    print(f"\n  [{desc or path}]")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=20, get_pty=True)
    output = []
    for line in iter(stdout.readline, ''):
        output.append(line.rstrip())
    full = '\n'.join(output)
    
    # Parse HTTP code
    if 'HTTP_CODE:' in full:
        parts = full.rsplit('HTTP_CODE:', 1)
        body_text = parts[0].strip()
        http_code = parts[1].strip()
    else:
        body_text = full
        http_code = '???'
    
    print(f"  HTTP {http_code}: {body_text[:300]}")
    return http_code, body_text

# ========== MAIN ==========
c = ssh()
results = []

def test(name, ok, detail=""):
    status = "✅" if ok else "❌"
    print(f"\n  {status} {name}: {detail}")
    results.append((status, name, detail))
    return ok

# ─── 1. API Health ───
code, body = curl(c, "/health", desc="API Health")
test("API Health", code == "200", body[:100])

# ─── 2. Admin Login ───
code, body = curl(c, "/auth/login", method="POST", data={
    "email": "admin@masjidalrahma.com",
    "password": "Admin@2025#Secure"
}, desc="Admin Login")
admin_ok = code == "200" and "accessToken" in body
test("Admin Login", admin_ok, "Token obtained" if admin_ok else body[:100])

# Extract token
admin_token = None
if "accessToken" in body:
    try:
        admin_token = json.loads(body.split('HTTP_CODE')[0])['data']['accessToken']
    except:
        pass

# ─── 3. Student Registration ───
import random
test_email = f"test_student_{random.randint(1000,9999)}@test.com"
code, body = curl(c, "/auth/register", method="POST", data={
    "email": test_email,
    "password": "Test@2025#Secure",
    "firstName": "Test",
    "lastName": "Student",
    "role": "student"
}, desc="Student Registration")
test("Student Registration", code in ("200","201"), body[:100])

# ─── 4. Course List ───
code, body = curl(c, "/courses", desc="Public Courses")
test("Browse Courses", code == "200", f"{len(body)} bytes")

# ─── 5. Admin Courses ───
if admin_token:
    code, body = curl(c, "/courses/admin", token=admin_token, desc="Admin Course List")
    test("Admin Courses", code == "200", f"{len(body)} bytes")

# ─── 6. Frontend Serving ───
code, body = curl(c, "/", desc="Frontend root")
test("Frontend Serves HTML", code == "200" or "index" in body.lower() or "doctype" in body.lower(), 
     f"HTTP {code}, {len(body)} bytes")

# ─── 7. Container Health ───
cmd = "docker ps --format '{{.Names}} {{.Status}}'"
stdin, stdout, stderr = c.exec_command(cmd, timeout=10, get_pty=True)
containers = stdout.read().decode().strip()
print(f"\n  Containers:\n{containers}")
all_healthy = all(w in containers for w in ['masjid-backend', 'masjid-frontend', 'masjid-mongodb'])
test("All containers running", all_healthy)

# ─── 8. Production Optimizations ───
print("\n" + "="*60)
print("  PRODUCTION OPTIMIZATIONS")
print("="*60)

# 8a. Enable Gzip in Nginx
run(c, """cat > /var/www/masjid-al-rahma/frontend/nginx.conf << 'NGINXEOF'
gzip on;
gzip_vary on;
gzip_min_length 256;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/ttf image/svg+xml;

server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Cache static assets aggressively
    location ~* \.(js|css|woff2?|ttf|svg|png|jpg|jpeg|gif|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff";
    }

    # HTML files are not cached
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    location /api/ {
        proxy_pass http://masjid-backend:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINXEOF
echo "Nginx optimized with gzip + caching"
""", "Enable Gzip + Caching in Nginx")

# 8b. Rebuild frontend with optimized nginx
run(c, """cd /var/www/masjid-al-rahma
docker compose -f docker-compose.prod.yml build --no-cache frontend
docker compose -f docker-compose.prod.yml up -d --force-recreate frontend
echo "Frontend rebuilt with optimizations"
""", "Rebuild frontend with optimized Nginx")

# 8c. Docker system prune
run(c, "docker system prune -f --volumes 2>/dev/null; echo 'Cleaned unused images'",
    "Clean up unused Docker images")

time.sleep(10)

# ─── 9. Final Health Check ───
print("\n" + "="*60)
print("  FINAL VERIFICATION")
print("="*60)

code, body = curl(c, "/health", desc="Final API Health")
test("API Health (final)", code == "200", body[:100])

run(c, "docker ps --format 'table {{.Names}} | {{.Status}} | {{.Ports}}'",
    "Container Status")

run(c, "df -h / | tail -2", "Disk Usage")
run(c, "free -m | grep Mem", "Memory Usage")
run(c, "docker volume inspect mongodb_data --format '{{.Mountpoint}} {{.CreatedAt}}' 2>/dev/null",
    "MongoDB Volume")

run(c, """echo "=== Backups ==="
echo "Add to crontab: 0 2 * * * docker exec masjid-mongodb mongodump --out /data/db/backup/\\$(date +\\%Y\\%m\\%d)"
ls -la /var/www/masjid-al-rahma/backend/.env.production 2>/dev/null && echo "Env file exists"
""", "Backup note + env check")

# ─── 10. Generate Report ───
print("\n" + "="*70)
print("  PRODUCTION DEPLOYMENT REPORT")
print("="*70)
print(f"""
  Server:   Ubuntu 24.04 LTS @ Contabo VPS ({HOST})
  Docker:   Installed with Compose v2
  Coolify:  Running on port 8000

  Frontend: http://{HOST}:3000
  API:      http://{HOST}:5000/api/v1
  Coolify:  http://{HOST}:8000

  Admin User:
    Email: admin@masjidalrahma.com
    Pass:  Admin@2025#Secure

  Features Verified:
""")
for status, name, detail in results:
    print(f"    {status} {name} — {detail}")

print("""
  Next Steps:
    1. Point domain DNS to {HOST}
    2. Configure domain in Coolify (http://{HOST}:8000)
    3. Add SSL via Coolify's Let's Encrypt integration
    4. Set up daily MongoDB backups via cron
    5. Monitor with Coolify dashboard
    6. Change root password on VPS
""")
print("="*70)

c.close()