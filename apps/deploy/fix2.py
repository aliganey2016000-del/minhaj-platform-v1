#!/usr/bin/env python3
"""Fix: MongoDB auth mismatch + Nginx Docker + Backend restart"""
import time, sys, os; sys.path.insert(0, os.path.dirname(__file__))
from deploy import connect_ssh, run_cmd, VPS_HOST

def main():
    c = connect_ssh()
    try:
        # ── 1. Fix MongoDB — create user in masjid-al-rahma DB (not admin) ──
        print("\n🗄 Fixing MongoDB (user in masjid-al-rahma db)...")
        run_cmd(c, "sed -i 's/authorization: *enabled/authorization: disabled/' /etc/mongod.conf 2>/dev/null; systemctl restart mongod 2>/dev/null; sleep 3")
        # Drop old user, create new one in correct db
        run_cmd(c, 'mongosh --quiet --eval "use masjid-al-rahma; db.dropUser(\"masjid_admin\"); db.createUser({user:\"masjid_admin\",pwd:\"RahmaDB2026Secure!\",roles:[{role:\"readWrite\",db:\"masjid-al-rahma\"}]})" 2>&1')
        run_cmd(c, "sed -i 's/authorization: *disabled/authorization: enabled/' /etc/mongod.conf 2>/dev/null; systemctl restart mongod 2>/dev/null; sleep 3")
        # Test with correct URI
        _, o, _ = run_cmd(c, 'mongosh "mongodb://masjid_admin:RahmaDB2026Secure!@127.0.0.1:27017/masjid-al-rahma?authSource=masjid-al-rahma" --quiet --eval "db.runCommand({ping:1})" 2>&1')
        print(f"Auth test: {o}")

        # Also ensure .env.production has the right URI
        run_cmd(c, 'sed -i "s|authSource=.*|authSource=masjid-al-rahma|" /var/www/masjid-al-rahma/backend/.env.production')
        _, env, _ = run_cmd(c, "grep MONGODB_URI /var/www/masjid-al-rahma/backend/.env.production")
        print(f"MONGODB_URI: {env}")

        # ── 2. Check Docker containers running on port 80 ──
        print("\n🐳 Checking Docker on port 80...")
        _, containers, _ = run_cmd(c, "docker ps --format '{{.Names}} {{.Ports}}' 2>&1 | head -10")
        print(f"Containers:\n{containers}")
        
        # Find the nginx container and update its config
        _, nginx_cont, _ = run_cmd(c, "docker ps --filter 'name=nginx' --format '{{.Names}}' 2>&1")
        print(f"Nginx container: {nginx_cont}")
        
        if nginx_cont.strip():
            cont_name = nginx_cont.strip().split('\n')[0]
            print(f"  Copying config to Docker container: {cont_name}")
            # Copy our nginx config into the Docker container
            run_cmd(c, f"docker cp /var/www/masjid-al-rahma/deploy/nginx.conf {cont_name}:/etc/nginx/conf.d/masjid-al-rahma.conf 2>&1")
            _, nginx_test, _ = run_cmd(c, f"docker exec {cont_name} nginx -t 2>&1")
            print(f"  Docker nginx test: {nginx_test}")
            if 'successful' in nginx_test:
                run_cmd(c, f"docker exec {cont_name} nginx -s reload 2>&1")
                print("  ✅ Docker Nginx reloaded")
            
            # Also copy frontend into Docker
            run_cmd(c, f"docker cp /var/www/masjid-al-rahma/frontend/dist/. {cont_name}:/var/www/masjid-al-rahma/frontend/dist/ 2>&1")
        else:
            # No Docker nginx, check what's on port 80
            _, proc80, _ = run_cmd(c, "fuser 80/tcp 2>&1 || ss -tlnp | grep ':80'")
            print(f"Port 80 owner: {proc80}")

        # ── 3. Restart backend with env ──
        print("\n🚀 Restarting backend...")
        run_cmd(c, "pm2 stop masjid-al-rahma-api 2>/dev/null")
        # Source env and restart
        run_cmd(c, "cd /var/www/masjid-al-rahma && pm2 start masjid-al-rahma-api --update-env 2>&1")
        time.sleep(6)

        # ── 4. Final checks ──
        _, o, _ = run_cmd(c, "curl -s http://localhost:5000/api/v1/health 2>&1")
        print(f"\n💚 Direct health (5000): {o[:300]}")
        _, o2, _ = run_cmd(c, "curl -s http://localhost/api/v1/health 2>&1")
        print(f"🌐 Via Nginx: {o2[:300]}")
        _, logs, _ = run_cmd(c, "pm2 logs masjid-al-rahma-api --lines 5 --nostream 2>&1 | grep -E '(Connected|Server|Error|Mongo|health|started)' | tail -5")
        print(f"📋 Key logs: {logs}")
        _, pm2, _ = run_cmd(c, "pm2 status 2>&1")
        print(f"📊 PM2: {pm2.split(chr(10))[2:10]}")
        
        print(f"\n✅ Test: http://{VPS_HOST}/api/v1/health")
        print(f"✅ Test: http://{VPS_HOST}")
    finally:
        c.close()

if __name__ == "__main__":
    main()