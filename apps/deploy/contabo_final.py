#!/usr/bin/env python3
"""Final fix + deploy for Contabo VPS — correct Dockerfile and redeploy."""

import paramiko, time, sys

HOST = "158.220.120.83"
USER = "root"
PASS = "635110Liiali"

def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)
    return c

def run(c, cmd, desc=""):
    print(f"\n--- {desc} ---")
    print(f"> {cmd[:160]}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=300, get_pty=True)
    for line in iter(stdout.readline, ''):
        print(f"  {line.rstrip()}")
    err = stderr.read().decode()
    if err.strip():
        print(f"  [stderr] {err.rstrip()}")

c = ssh()

# 1. Fix the backend Dockerfile — correct CMD path
run(c, """cat > /var/www/masjid-al-rahma/backend/Dockerfile << 'DOCKEREOF'
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY dist/ ./dist/
COPY .env.production ./.env
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1
CMD ["node", "dist/server.js"]
DOCKEREOF
echo "Backend Dockerfile fixed — now uses dist/server.js"
""", "Step 1: Fix backend Dockerfile (CMD path)")

# 2. Kill coolify-proxy (keeps coming back — need persistent fix)
run(c, "docker stop coolify-proxy 2>/dev/null; docker rm coolify-proxy 2>/dev/null; echo 'Proxy removed'",
    "Step 2: Remove coolify-proxy")

# 3. Down everything and rebuild
run(c, """cd /var/www/masjid-al-rahma
docker compose -f docker-compose.prod.yml down --remove-orphans
docker compose -f docker-compose.prod.yml build --no-cache backend
docker compose -f docker-compose.prod.yml up -d""",
    "Step 3: Rebuild backend (no cache) and restart stack")

time.sleep(20)

# 4. Check
run(c, "docker ps --format 'table {{.Names}} | {{.Status}}'", "Step 4: Container status")
run(c, "docker logs masjid-backend --tail 20", "Backend logs")
run(c, "curl -s http://localhost:5000/api/v1/health || echo 'RETRY'", "API health")
run(c, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost/", "Frontend")

# 5. Seed admin if API is up
run(c, """for i in 1 2 3 4 5; do
  curl -s http://localhost:5000/api/v1/health && break
  sleep 3
done
docker exec masjid-backend node -e '
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/masjid-al-rahma").then(async () => {
    const User = mongoose.model("User", new mongoose.Schema({email:String,password:String,role:String,status:String}));
    const exists = await User.findOne({email:"admin@masjidalrahma.com"});
    if (!exists) {
        await User.create({email:"admin@masjidalrahma.com", password: await bcrypt.hash("Admin@2025#Secure",12), role:"admin", status:"active"});
        console.log("Admin created");
    } else { console.log("Admin exists"); }
    process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
'""",
    "Step 5: Seed admin user")

print("\n" + "="*60)
print("  VERIFICATION")
print("="*60)
run(c, "docker ps --format 'table {{.Names}} | {{.Status}}'", "Final container status")
run(c, "curl -s http://localhost:5000/api/v1/health", "Final API check")
run(c, """if [ -f /var/www/masjid-al-rahma/frontend/dist/index.html ]; then
  echo -n "Frontend build exists: " && ls -lh /var/www/masjid-al-rahma/frontend/dist/index.html | awk '{print $5}'
else
  echo "Frontend build MISSING"
fi""", "Frontend dist check")

print("\n" + "="*60)
print(f"  DEPLOYMENT COMPLETE")
print(f"  Frontend:  http://{HOST}")
print(f"  Coolify:   http://{HOST}:8000")
print(f"  API:       http://{HOST}/api/v1/health")
print(f"  Admin:     admin@masjidalrahma.com / Admin@2025#Secure")
print("="*60)

c.close()