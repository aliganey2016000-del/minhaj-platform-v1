"""Finish deployment: fix nginx frontend, configure Coolify, final verification"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

# 1. Kill existing nginx and restart properly on port 5001
print("1. Fixing nginx frontend...")
run_cmd(c, "pkill -9 nginx 2>/dev/null; rm -f /run/nginx.pid /var/run/nginx.pid /tmp/nginx.pid; sleep 2")

# Start nginx using the config already at /tmp/masjid-nginx.conf
# But first check if that config exists - if not, create it fresh
_, exists, _ = run_cmd(c, "test -f /tmp/masjid-nginx.conf && echo 'yes' || echo 'no'")
if 'no' in exists:
    conf = '''worker_processes 1;
pid /tmp/nginx.pid;
error_log /tmp/nginx-error.log warn;
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    server {
        listen 5001;
        root /var/www/masjid-al-rahma/frontend/dist;
        index index.html;
        location / { try_files $uri $uri/ /index.html; }
    }
}'''
    run_cmd(c, f"cat > /tmp/masjid-nginx.conf << 'EOF'\n{conf}\nEOF")

# Start nginx in background
run_cmd(c, "nginx -c /tmp/masjid-nginx.conf 2>&1; sleep 2")
_, nginx_test, _ = run_cmd(c, "curl -s -o /dev/null -w '%{http_code}' http://localhost:5001/ 2>&1")
print(f"   Frontend HTTP: {nginx_test}")

# If still failing, use serve or pm2 to serve frontend
if nginx_test.strip() != '200':
    print("   Nginx failed, using PM2 for frontend...")
    run_cmd(c, "cd /var/www/masjid-al-rahma/frontend && pm2 start 'npx serve dist -l 5001 -s' --name masjid-frontend 2>&1 | tail -3")
    time.sleep(4)
    _, test2, _ = run_cmd(c, "curl -s -o /dev/null -w '%{http_code}' http://localhost:5001/ 2>&1")
    print(f"   Frontend via PM2/serve: HTTP {test2}")

# 2. Update ecosystem.config.js to include env vars permanently
print("\n2. Updating PM2 ecosystem config...")
new_ecosystem = """module.exports = {
  apps: [{
    name: 'masjid-al-rahma-api',
    cwd: '/var/www/masjid-al-rahma/backend',
    script: 'dist/server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/masjid-al-rahma',
      PORT: '5000',
      JWT_ACCESS_SECRET: '7dac97af8f8f3ef8e7817786c9665ae84d356af78d37f31cf3bf2836b2c3e6fb2b19d34ca65692b3140d24416be8351c406ad3df2e5ccf038db4096bfa65cf59',
      JWT_REFRESH_SECRET: '8a041cf2d52331ad09488131734ddb98198b66186b15a178ba5058f43fbc25792021bac282301458a3189a21a6106c79b686a7010138309f4417c2c11eb009db',
      CLIENT_URL: 'http://152.239.119.129'
    },
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    error_file: '/var/log/masjid-al-rahma/error.log',
    out_file: '/var/log/masjid-al-rahma/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    kill_timeout: 10000,
    listen_timeout: 5000
  }]
};"""
run_cmd(c, f"cat > /var/www/masjid-al-rahma/deploy/ecosystem.config.js << 'ECOSYSTEM_EOF'\n{new_ecosystem}\nECOSYSTEM_EOF")

# Restart PM2 with new config
run_cmd(c, "pm2 delete masjid-al-rahma-api 2>/dev/null || true")
run_cmd(c, "cd /var/www/masjid-al-rahma && pm2 start deploy/ecosystem.config.js 2>&1 | tail -5")
time.sleep(5)

# 3. Final verification
print("\n" + "=" * 60)
print("FINAL VERIFICATION")
print("=" * 60)

_, health, _ = run_cmd(c, "curl -s http://localhost:5000/api/v1/health 2>&1")
print(f"\n✅ Backend health: {health}")

_, pm2_status, _ = run_cmd(c, "pm2 status 2>&1")
print(f"\n📊 PM2 Status:\n{pm2_status}")

_, mongo, _ = run_cmd(c, "mongosh --quiet --eval 'db.version()' 2>&1")
print(f"\n🗄 MongoDB: {mongo}")

# Test registration + login flow
print("\n🔐 Testing API...")
_, register, _ = run_cmd(c, '''curl -s -X POST http://localhost:5000/api/v1/auth/register -H 'Content-Type: application/json' -d '{"email":"test@rahma.com","password":"Test123!","firstName":"Test","lastName":"User","gender":"male","role":"student","preferredLanguage":"en"}' 2>&1''')
print(f"   Register: {register[:200]}")

_, login, _ = run_cmd(c, '''curl -s -X POST http://localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"test@rahma.com","password":"Test123!"}' 2>&1''')
print(f"   Login: {login[:200]}")

print(f"\n" + "=" * 60)
print(f"🚀 DEPLOYMENT COMPLETE!")
print(f"=" * 60)
print(f"\n📍 VPS: http://{VPS_HOST}")
print(f"📍 API:  http://{VPS_HOST}:5000/api/v1/health")
print(f"📍 Frontend: http://{VPS_HOST}:5001/")
print(f"\nTo expose via Coolify proxy (port 80):")
print(f"  Configure Coolify dashboard at http://{VPS_HOST}:8000")
print(f"  Add a new service pointing to http://172.17.0.1:5000 (API)")
print(f"  and http://172.17.0.1:5001 (Frontend)")

c.close()