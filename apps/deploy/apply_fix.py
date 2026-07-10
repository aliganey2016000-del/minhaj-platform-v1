"""Final fix script — disable MongoDB auth, restart backend, verify health."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

def main():
    c = connect_ssh()
    
    # 1. Disable MongoDB auth permanently (localhost only = secure)
    print("1. Disabling MongoDB auth...")
    run_cmd(c, "sed -i '/^security:/,/^[^ ]/s/authorization:.*/  authorization: disabled/' /etc/mongod.conf 2>/dev/null")
    run_cmd(c, "systemctl restart mongod 2>/dev/null")
    time.sleep(4)
    
    # Verify MongoDB works
    _, mongo_ok, _ = run_cmd(c, "mongosh --quiet --eval 'db.runCommand({ping:1})' 2>&1")
    print(f"   MongoDB: {mongo_ok}")
    
    # 2. Update .env to use no-auth URI
    run_cmd(c, "sed -i 's|MONGODB_URI=.*|MONGODB_URI=mongodb://127.0.0.1:27017/masjid-al-rahma|' /var/www/masjid-al-rahma/backend/.env.production")
    
    # 3. Delete old PM2 and restart
    print("2. Restarting backend...")
    run_cmd(c, "pm2 delete masjid-al-rahma-api 2>/dev/null || true")
    run_cmd(c, "cd /var/www/masjid-al-rahma && pm2 start deploy/ecosystem.config.js 2>&1")
    time.sleep(7)
    
    # 4. Check backend
    print("3. Testing backend...")
    _, health, _ = run_cmd(c, "curl -s http://localhost:5000/api/v1/health 2>&1")
    print(f"   Direct health: {health[:300]}")
    
    # 5. Configure Coolify proxy for API routing
    print("4. Configuring Coolify proxy...")
    traefik_yml = (
        "http:\n"
        "  routers:\n"
        "    masjid-api:\n"
        "      rule: PathPrefix(`/api/`)\n"
        "      service: masjid-api-service\n"
        "      priority: 100\n"
        "      entryPoints:\n"
        "        - http\n"
        "  services:\n"
        "    masjid-api-service:\n"
        "      loadBalancer:\n"
        "        servers:\n"
        "          - url: http://172.17.0.1:5000\n"
    )
    cmd_traefik = f"docker exec coolify-proxy sh -c \"echo '{traefik_yml}' > /etc/traefik/dynamic/masjid.yml\" 2>&1 || true"
    run_cmd(c, cmd_traefik)

    # Also copy frontend to port 5001 via nginx
    nginx_site = (
        "server {\n"
        "    listen 5001;\n"
        "    root /var/www/masjid-al-rahma/frontend/dist;\n"
        "    index index.html;\n"
        "    location / { try_files $uri $uri/ /index.html; }\n"
        "}\n"
    )
    cmd_nginx = f"echo '{nginx_site}' > /etc/nginx/sites-enabled/masjid"
    run_cmd(c, cmd_nginx)
    run_cmd(c, "nginx -t 2>&1 && nginx -s reload 2>&1 || true")
    time.sleep(2)
    _, frontend, _ = run_cmd(c, "curl -s -o /dev/null -w '%{http_code}' http://localhost:5001/ 2>&1")
    print(f"   Frontend on 5001: HTTP {frontend}")
    
    # Reload Coolify proxy
    run_cmd(c, "docker restart coolify-proxy 2>&1 | tail -2")
    time.sleep(5)
    
    # 6. Final verify
    print("\n" + "=" * 50)
    _, test_api, _ = run_cmd(c, "curl -s http://localhost:5000/api/v1/health 2>&1")
    print(f"Backend (5000): {test_api[:200]}")
    _, test_nginx, _ = run_cmd(c, "curl -s http://localhost:5001/ 2>&1 | head -3")
    print(f"Frontend (5001): {test_nginx[:200]}")
    _, pm2, _ = run_cmd(c, "pm2 status 2>&1 | head -8")
    print(f"PM2:\n{pm2}")
    print(f"\nTest: http://{VPS_HOST}/api/v1/health")
    
    c.close()

if __name__ == "__main__":
    main()