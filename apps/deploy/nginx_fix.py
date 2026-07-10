"""Fix Nginx on port 80 via Coolify proxy container or native nginx."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

# ── 1. Verify frontend dist exists ──
print("1. Verifying frontend dist...")
_, dist, _ = run_cmd(c, "ls -la /var/www/masjid-al-rahma/frontend/dist/index.html 2>&1")
print(f"   {dist}")
_, dist2, _ = run_cmd(c, "ls /var/www/masjid-al-rahma/frontend/dist/ 2>&1 | head -10")
print(f"   Files: {dist2}")

# ── 2. Check what's on port 80 and 443 ──
print("\n2. Checking proxy container...")
_, proxy_type, _ = run_cmd(c, "docker exec coolify-proxy which nginx 2>/dev/null && echo 'nginx' || (docker exec coolify-proxy which traefik 2>/dev/null && echo 'traefik' || echo 'unknown')")
print(f"   Proxy type: {proxy_type}")

_, proxy_conf, _ = run_cmd(c, "docker exec coolify-proxy ls /etc/nginx/conf.d/ 2>/dev/null | head -10; docker exec coolify-proxy ls /etc/traefik/ 2>/dev/null | head -10")
print(f"   Proxy config dirs: {proxy_conf}")

# ── 3. Add our config to the Coolify proxy ──
# Coolify uses Nginx-based proxy (not Traefik in this version)
print("\n3. Adding config to Coolify proxy...")

our_nginx_conf = """# Masjid Al-Rahma — API + Frontend
server {
    listen 80;
    server_name _;

    # Frontend SPA
    location / {
        root /var/www/masjid-al-rahma/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # API proxy to backend
    location /api/ {
        proxy_pass http://172.17.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # Don't cache index.html
    location = /index.html {
        root /var/www/masjid-al-rahma/frontend/dist;
        expires -1;
        add_header Cache-Control "no-cache";
    }
}
"""

# Copy frontend dist into the proxy container
run_cmd(c, "docker exec coolify-proxy mkdir -p /var/www/masjid-al-rahma/frontend/dist 2>/dev/null")
run_cmd(c, "docker cp /var/www/masjid-al-rahma/frontend/dist/. coolify-proxy:/var/www/masjid-al-rahma/frontend/dist/ 2>&1 | tail -3")

# Write our nginx config
run_cmd(c, f"echo '{our_nginx_conf}' | docker exec -i coolify-proxy tee /etc/nginx/conf.d/masjid-al-rahma.conf 2>&1 | tail -3")

# Test config
_, test, _ = run_cmd(c, "docker exec coolify-proxy nginx -t 2>&1")
print(f"   Nginx test: {test}")

# Reload
if 'successful' in test:
    run_cmd(c, "docker exec coolify-proxy nginx -s reload 2>&1")
    print("   ✅ Nginx reloaded")
    time.sleep(2)
else:
    print("   ⚠️ Config test failed, trying native nginx...")
    # Fallback: Kill coolify-proxy and run nginx natively
    run_cmd(c, "docker stop coolify-proxy 2>&1 | tail -2")
    time.sleep(2)
    # Write native nginx config
    native_conf = f"""worker_processes 1;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log warn;
events {{ worker_connections 1024; }}
http {{
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 10M;
    {our_nginx_conf}
}}"""
    run_cmd(c, f"cat > /etc/nginx/nginx.conf << 'NATIVE_EOF'\n{native_conf}\nNATIVE_EOF")
    _, test2, _ = run_cmd(c, "nginx -t 2>&1")
    print(f"   Native nginx test: {test2}")
    if 'successful' in test2:
        run_cmd(c, "pkill nginx 2>/dev/null; sleep 1; nginx 2>&1; sleep 1")
        print("   ✅ Native nginx started")
    else:
        # Start coolify back
        run_cmd(c, "docker start coolify-proxy 2>&1 | tail -2")
        print("   Restored coolify proxy")

# ── 4. Verify ──
print("\n" + "=" * 60)
print("VERIFYING")
print("=" * 60)

time.sleep(2)
_, health, _ = run_cmd(c, "curl -sv http://localhost/api/v1/health 2>&1")
print(f"\n💚 /api/v1/health: {health[-300:]}")

_, frontend, _ = run_cmd(c, "curl -sv http://localhost/ 2>&1 | tail -20")
print(f"\n🌐 Frontend: {frontend[:300]}")

_, index_exists, _ = run_cmd(c, "curl -s http://localhost/ 2>&1 | head -5")
print(f"\n📄 Index content: {index_exists[:200]}")

print(f"\n{'=' * 60}")
print(f"📍 http://{VPS_HOST}/")
print(f"📍 http://{VPS_HOST}/api/v1/health")
print(f"{'=' * 60}")

c.close()