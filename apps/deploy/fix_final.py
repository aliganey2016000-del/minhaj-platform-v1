"""Final fix — check backend logs, fix nginx, configure proxy"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

def main():
    c = connect_ssh()
    
    # 1. Check backend logs to see if it connected to MongoDB
    print("1. Checking backend logs...")
    _, logs, _ = run_cmd(c, "pm2 logs masjid-al-rahma-api --lines 30 --nostream 2>&1")
    # Print only important lines
    for line in logs.split('\n'):
        if any(k in line for k in ['Connected','Mongo','Error','Server','running','health','FAILED']):
            print(f"   {line.strip()}")
    
    # 2. Check if port 5000 is actually listening
    print("\n2. Checking ports...")
    _, ports, _ = run_cmd(c, "ss -tlnp | grep -E ':(5000|5001|80|443)' 2>&1")
    print(f"   {ports}")
    
    # 3. Try running the backend directly to see errors
    print("\n3. Testing backend directly...")
    run_cmd(c, "pm2 stop masjid-al-rahma-api 2>/dev/null")
    # Run with timeout to see startup errors
    _, direct, _ = run_cmd(c, "cd /var/www/masjid-al-rahma/backend && timeout 8 node dist/server.js 2>&1 || true")
    print(f"   {direct[-500:]}")
    
    # 4. Fix nginx - kill any running nginx, remove bad PID file, restart
    print("\n4. Fixing nginx...")
    run_cmd(c, "pkill -9 nginx 2>/dev/null; rm -f /run/nginx.pid /var/run/nginx.pid; sleep 1")
    # Check what's on port 80 (should be coolify-proxy docker)
    _, port80, _ = run_cmd(c, "fuser 80/tcp 2>&1 || echo 'nothing_on_80'")
    print(f"   Port 80: {port80}")
    
    # Start nginx on port 5001 only
    nginx_conf = '''
worker_processes 1;
pid /run/nginx.pid;
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
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
'''
    run_cmd(c, f"cat > /tmp/masjid-nginx.conf << 'EOF'\n{nginx_conf}\nEOF")
    run_cmd(c, "nginx -c /tmp/masjid-nginx.conf 2>&1")
    time.sleep(2)
    _, frontend, _ = run_cmd(c, "curl -s http://localhost:5001/ 2>&1 | head -3")
    print(f"   Frontend (5001): {frontend[:200]}")
    
    # 5. Restart backend with PM2
    print("\n5. Restarting backend...")
    run_cmd(c, "cd /var/www/masjid-al-rahma && pm2 start masjid-al-rahma-api 2>&1")
    time.sleep(5)
    _, health, _ = run_cmd(c, "curl -s http://localhost:5000/api/v1/health 2>&1")
    print(f"   Health: {health[:300]}")
    
    # 6. Configure Coolify proxy (find correct directory)
    print("\n6. Configuring Coolify proxy...")
    # Find Traefik config directory
    _, traefik_dir, _ = run_cmd(c, "docker exec coolify-proxy find / -name 'traefik.yml' -maxdepth 4 2>/dev/null | head -3 || echo 'not_found'")
    print(f"   Traefik configs: {traefik_dir}")
    
    # Check Coolify proxy logs
    _, proxy_logs, _ = run_cmd(c, "docker logs coolify-proxy --tail 5 2>&1")
    print(f"   Proxy logs: {proxy_logs[-300:]}")
    
    # 7. Final status
    print("\n" + "=" * 60)
    print("FINAL STATUS")
    print("=" * 60)
    _, pm2, _ = run_cmd(c, "pm2 status 2>&1")
    print(pm2[:500])
    print(f"\n📍 Backend:  http://{VPS_HOST}:5000/api/v1/health")
    print(f"📍 Frontend: http://{VPS_HOST}:5001/")
    print(f"📍 Main:     http://{VPS_HOST}/ (via Coolify)")
    
    c.close()

if __name__ == "__main__":
    main()