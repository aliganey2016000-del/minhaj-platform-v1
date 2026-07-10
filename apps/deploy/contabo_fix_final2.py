#!/usr/bin/env python3
"""Final fixes: proper frontend Dockerfile, correct bcrypt module, verify health."""

import paramiko, time

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

# 1. Create proper frontend Dockerfile (separate file, no dockerfile_inline)
run(c, """cat > /var/www/masjid-al-rahma/frontend/Dockerfile << 'DOCKEREOF'
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1
DOCKEREOF
echo "Frontend Dockerfile created"
cat > /var/www/masjid-al-rahma/frontend/nginx.conf << 'NGINXEOF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://masjid-backend:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF
echo "Nginx config created"
""", "Step 1: Create proper frontend Dockerfile + nginx.conf")

# 2. Simplify docker-compose — remove dockerfile_inline, use proper Dockerfile
run(c, """cat > /var/www/masjid-al-rahma/docker-compose.prod.yml << 'DOCKEREOF'
services:
  mongodb:
    image: mongo:7
    container_name: masjid-mongodb
    restart: unless-stopped
    networks:
      - app-network
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  backend:
    build: ./backend
    container_name: masjid-backend
    restart: unless-stopped
    networks:
      - app-network
    environment:
      - NODE_ENV=production
      - PORT=5000
      - MONGODB_URI=mongodb://masjid-mongodb:27017/masjid-al-rahma
      - CLIENT_URL=http://158.220.120.83
    depends_on:
      mongodb:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: masjid-frontend
    restart: unless-stopped
    networks:
      - app-network
    depends_on:
      - backend

networks:
  app-network:
    driver: bridge

volumes:
  mongodb_data:
    external: true
DOCKEREOF
echo "docker-compose simplified"
""", "Step 2: Simplify docker-compose (no dockerfile_inline)")

# 3. Rebuild and restart
run(c, """cd /var/www/masjid-al-rahma
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
echo "Stack redeployed"
""", "Step 3: Rebuild and redeploy")

time.sleep(20)

# 4. Seed admin with bcrypt (not bcryptjs)
run(c, """docker exec masjid-backend node -e '
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
mongoose.connect(process.env.MONGODB_URI || "mongodb://masjid-mongodb:27017/masjid-al-rahma").then(async () => {
    const User = mongoose.model("User", new mongoose.Schema({email:String,password:String,role:String,status:String}));
    const exists = await User.findOne({email:"admin@masjidalrahma.com"});
    if (!exists) {
        await User.create({email:"admin@masjidalrahma.com", password: await bcrypt.hash("Admin@2025#Secure", 12), role:"admin", status:"active"});
        console.log("Admin user created successfully");
    } else {
        console.log("Admin user already exists");
    }
    process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
' 2>&1 || echo 'Seed attempted'
""", "Step 4: Seed admin user (using bcrypt)")

# 5. Verify
run(c, "docker ps --format 'table {{.Names}} | {{.Status}}'", "Step 5a: Container status")
run(c, "docker logs masjid-backend --tail 10", "Step 5b: Backend logs")
run(c, "docker logs masjid-frontend --tail 5", "Step 5c: Frontend logs")
run(c, "curl -s --max-time 10 http://localhost:5000/api/v1/health", "Step 5d: API health")
run(c, "curl -s -o /dev/null -w 'HTTP %{http_code}' --max-time 10 http://localhost/", "Step 5e: Frontend (direct)")
run(c, "docker inspect masjid-frontend --format '{{json .NetworkSettings.Networks}}' 2>/dev/null | python3 -m json.tool 2>/dev/null || echo 'net info'", "Step 5f: Frontend network")

print(f"\n{'='*60}")
print(f"  Frontend:  http://{HOST}")
print(f"  Coolify:   http://{HOST}:8000")
print(f"  API:       http://{HOST}:5000/api/v1/health")
print("=" * 60)

c.close()