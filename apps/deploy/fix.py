#!/usr/bin/env python3
"""Fix Nginx, MongoDB auth, and restart backend automatically."""
import time, sys, os; sys.path.insert(0, os.path.dirname(__file__))
from deploy import connect_ssh, run_cmd, VPS_HOST

def main():
    c = connect_ssh()
    try:
        # 1. FIX NGINX
        print("\n🔧 Fixing Nginx...")
        run_cmd(c, "rm -f /run/nginx.pid 2>/dev/null")
        run_cmd(c, "pkill nginx 2>/dev/null; sleep 1")
        e, o, _ = run_cmd(c, "nginx -t 2>&1")
        print(f"Test: {o}")
        run_cmd(c, "nginx 2>&1 && sleep 1")
        _, o, _ = run_cmd(c, "ps aux | grep 'nginx' | grep -v grep")
        print(f"Running: {o}")

        # 2. FIX MONGODB
        print("\n🗄 Fixing MongoDB...")
        # First try without auth
        run_cmd(c, "sed -i 's/authorization: enabled/authorization: disabled/' /etc/mongod.conf 2>/dev/null; systemctl restart mongod 2>/dev/null || true; sleep 3")
        run_cmd(c, "mongosh --quiet --eval 'use admin; db.createUser({user:\"masjid_admin\",pwd:\"RahmaDB2026Secure!\",roles:[{role:\"readWrite\",db:\"masjid-al-rahma\"}]})' 2>&1")
        # Enable auth back
        run_cmd(c, "sed -i 's/authorization: disabled/authorization: enabled/' /etc/mongod.conf 2>/dev/null")
        run_cmd(c, "systemctl restart mongod 2>/dev/null || true; sleep 3")
        # Test auth
        _, o, _ = run_cmd(c, 'mongosh "mongodb://masjid_admin:RahmaDB2026Secure!@127.0.0.1:27017/masjid-al-rahma?authSource=admin" --quiet --eval "db.runCommand({ping:1})" 2>&1')
        print(f"Auth test: {o}")

        # 3. RESTART BACKEND
        print("\n🚀 Restarting backend...")
        run_cmd(c, "export NODE_ENV=production")
        run_cmd(c, "cd /var/www/masjid-al-rahma && pm2 restart masjid-al-rahma-api 2>&1")
        time.sleep(6)

        # 4. CHECK LOGS
        _, logs, _ = run_cmd(c, "pm2 logs masjid-al-rahma-api --lines 20 --nostream 2>&1")
        print(f"\n📋 Backend logs:\n{logs}")

        # 5. VERIFY
        _, o, _ = run_cmd(c, "curl -s http://localhost:5000/api/v1/health 2>&1")
        print(f"\n💚 Direct health: {o}")
        _, o, _ = run_cmd(c, "curl -s http://localhost/api/v1/health 2>&1")
        print(f"🌐 Via Nginx: {o}")
        _, o, _ = run_cmd(c, "ss -tlnp | grep -E ':(80|5000)' 2>&1")
        print(f"📡 Ports: {o}")
        _, o, _ = run_cmd(c, "pm2 status 2>&1")
        print(f"📊 PM2:\n{o}")

        print(f"\n✅ Visit: http://{VPS_HOST}")
    finally:
        c.close()

if __name__ == "__main__":
    main()