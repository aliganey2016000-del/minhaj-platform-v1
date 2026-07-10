"""Fix: Verify env file loading, force MONGODB_URI, restart."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

# 1. Check current .env
print("1. Current .env.production:")
_, env, _ = run_cmd(c, "cat /var/www/masjid-al-rahma/backend/.env.production")
print(env)

# 2. Test MongoDB connection directly from Node
print("\n2. Testing MongoDB from Node...")
_, node_test, _ = run_cmd(c, 'cd /var/www/masjid-al-rahma/backend && node -e "const m=require(\'mongoose\'); m.set(\'strictQuery\',false); m.connect(\'mongodb://127.0.0.1:27017/masjid-al-rahma\',{serverSelectionTimeoutMS:5000}).then(()=>{console.log(\'MONGO_OK\'); process.exit(0)}).catch(e=>{console.log(\'MONGO_FAIL:\'+e.message); process.exit(1)})" 2>&1 || true')
print(f"Node MongoDB test: {node_test}")

# 3. PM2 doesn't load .env files automatically — we need to source it
# Fix: update ecosystem.config.js to reference env properly, or use dotenv in code
# Quick fix: restart PM2 with explicit env
print("\n3. Restarting backend with explicit env...")
run_cmd(c, "pm2 delete masjid-al-rahma-api 2>/dev/null || true")
# Start with inline env vars
run_cmd(c, 'cd /var/www/masjid-al-rahma && NODE_ENV=production MONGODB_URI="mongodb://127.0.0.1:27017/masjid-al-rahma" PORT=5000 JWT_ACCESS_SECRET=7dac97af8f8f3ef8e7817786c9665ae84d356af78d37f31cf3bf2836b2c3e6fb2b19d34ca65692b3140d24416be8351c406ad3df2e5ccf038db4096bfa65cf59 JWT_REFRESH_SECRET=8a041cf2d52331ad09488131734ddb98198b66186b15a178ba5058f43fbc25792021bac282301458a3189a21a6106c79b686a7010138309f4417c2c11eb009db CLIENT_URL=http://152.239.119.129 pm2 start deploy/ecosystem.config.js 2>&1')
time.sleep(6)

# 4. Check logs
print("\n4. Backend logs:")
_, logs, _ = run_cmd(c, "pm2 logs masjid-al-rahma-api --lines 10 --nostream 2>&1")
for line in logs.split('\n'):
    if any(k in line.lower() for k in ['connected','server','error','running','mongo','health']):
        print(f"  {line.strip()}")

# 5. Check port
print("\n5. Checking port 5000...")
_, port, _ = run_cmd(c, "ss -tlnp | grep 5000")
print(f"  Port 5000: {port}")

# 6. Test health
_, health, _ = run_cmd(c, "curl -s http://localhost:5000/api/v1/health 2>&1")
print(f"\n6. Health (5000): {health[:300]}")

# 7. Start Nginx on 5001
print("\n7. Starting Nginx on 5001...")
nginx_cmd = "nginx -c /tmp/masjid-nginx.conf 2>&1 & sleep 2; curl -s -o /dev/null -w '%{http_code}' http://localhost:5001/"
_, nginx_ok, _ = run_cmd(c, nginx_cmd)
print(f"  Nginx 5001: HTTP {nginx_ok}")

# 8. PM2 status
_, pm2, _ = run_cmd(c, "pm2 status")
print(f"\n8. PM2:\n{pm2[:500]}")

print(f"\n\n📍 http://{VPS_HOST}:5000/api/v1/health")
print(f"📍 http://{VPS_HOST}:5001/ (frontend)")

c.close()