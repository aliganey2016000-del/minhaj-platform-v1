#!/usr/bin/env python3
"""
Integrate Masjid Al-Rahma with Coolify Proxy.

Strategy:
- Use Docker bridge networking (not host)
- Add Traefik labels for Coolify proxy routing
- Fix frontend Nginx to use container DNS names
- Fix backend MongoDB URI to use container name
- Keep Coolify fully functional
"""

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

# Step 1: Inspect Coolify network and proxy labels
run(c, "docker inspect coolify-proxy --format '{{json .NetworkSettings.Networks}}' 2>/dev/null || echo 'no proxy'",
    "Step 1a: Coolify proxy networks")
run(c, "docker network ls | grep coolify",
    "Step 1b: List coolify networks")
run(c, "docker inspect coolify-proxy --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}\n{{end}}' 2>/dev/null | head -20",
    "Step 1c: Coolify proxy labels")
run(c, "docker network inspect coolify --format '{{.Name}} driver={{.Driver}}' 2>/dev/null || echo 'No coolify network found'",
    "Step 1d: Inspect coolify network")

# Step 2: Create our docker-compose with Traefik integration
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
      - coolify
    environment:
      - NODE_ENV=production
      - PORT=5000
      - MONGODB_URI=mongodb://masjid-mongodb:27017/masjid-al-rahma
      - CLIENT_URL=http://158.220.120.83
    depends_on:
      mongodb:
        condition: service_healthy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.masjid-backend.rule=Host(`158.220.120.83`) && PathPrefix(`/api`)"
      - "traefik.http.routers.masjid-backend.entrypoints=web"
      - "traefik.http.services.masjid-backend.loadbalancer.server.port=5000"

  frontend:
    build:
      context: ./frontend
      dockerfile_inline: |
        FROM nginx:alpine
        COPY dist/ /usr/share/nginx/html/
        RUN echo 'server { \
            listen 80; \
            server_name _; \
            root /usr/share/nginx/html; \
            index index.html; \
            location / { \
                try_files $$uri $$uri/ /index.html; \
            } \
            location /api/ { \
                proxy_pass http://masjid-backend:5000/api/; \
                proxy_set_header Host $$host; \
                proxy_set_header X-Real-IP $$remote_addr; \
                proxy_set_header X-Forwarded-For $$proxy_add_x_forwarded_for; \
                proxy_set_header X-Forwarded-Proto $$scheme; \
            } \
        }' > /etc/nginx/conf.d/default.conf
        HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
          CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1
    container_name: masjid-frontend
    restart: unless-stopped
    networks:
      - app-network
      - coolify
    depends_on:
      backend:
        condition: service_started
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.masjid-frontend.rule=Host(`158.220.120.83`)"
      - "traefik.http.routers.masjid-frontend.entrypoints=web"
      - "traefik.http.services.masjid-frontend.loadbalancer.server.port=80"

networks:
  app-network:
    driver: bridge
  coolify:
    external: true

volumes:
  mongodb_data:
    external: true
DOCKEREOF
echo "docker-compose.prod.yml updated with Traefik labels and bridge networking"
""",
    "Step 2: Create proper docker-compose with Coolify integration")

# Step 3: Also fix backend Dockerfile to use inline env var approach
run(c, """cat > /var/www/masjid-al-rahma/backend/Dockerfile << 'DOCKEREOF'
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY dist/ ./dist/
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1
CMD ["node", "dist/server.js"]
DOCKEREOF
echo "Backend Dockerfile updated"
""",
    "Step 3: Fix backend Dockerfile")

# Step 4: Down old stack and deploy new one
run(c, """cd /var/www/masjid-al-rahma
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null
echo "Cleaned up old stack"
# Verify the coolify network exists
docker network inspect coolify > /dev/null 2>&1 || docker network create coolify
echo "Coolify network ready"
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
echo "Stack deployed"
""",
    "Step 4: Deploy new stack")

time.sleep(25)

# Step 5: Verify
run(c, "docker ps --format 'table {{.Names}} | {{.Status}}'", "Step 5a: Container status")
run(c, "docker logs masjid-backend --tail 30 2>&1", "Step 5b: Backend logs")
run(c, "docker logs masjid-frontend --tail 15 2>&1", "Step 5c: Frontend logs")
run(c, "curl -s --max-time 10 http://localhost:5000/api/v1/health || echo 'API via localhost:5000'", "Step 5d: API health (direct)")
run(c, "curl -s --max-time 10 http://localhost/api/v1/health || curl -s --max-time 10 -H 'Host: 158.220.120.83' http://localhost/api/v1/health || echo 'API via proxy'", "Step 5e: API via proxy")
run(c, "curl -s -o /dev/null -w 'HTTP %{http_code}' --max-time 10 http://localhost/ || echo 'Frontend via proxy'", "Step 5f: Frontend via proxy")

# Step 6: Seed admin
run(c, """docker exec masjid-backend node -e '
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGODB_URI || "mongodb://masjid-mongodb:27017/masjid-al-rahma").then(async () => {
    const User = mongoose.model("User", new mongoose.Schema({email:String,password:String,role:String,status:String}));
    const exists = await User.findOne({email:"admin@masjidalrahma.com"});
    if (!exists) {
        const bcrypt = require("bcryptjs");
        await User.create({email:"admin@masjidalrahma.com", password: await bcrypt.hash("Admin@2025#Secure",12), role:"admin", status:"active"});
        console.log("Admin user created successfully");
    } else {
        console.log("Admin user already exists");
    }
    process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
' 2>&1 || echo 'Seed attempted'""",
    "Step 6: Seed admin user")

print("\n" + "=" * 70)
print("  COOLIFY INTEGRATION COMPLETE")
print(f"  Frontend:  http://{HOST}")
print(f"  Coolify:   http://{HOST}:8000")
print(f"  API:       http://{HOST}/api/v1/health")
print("=" * 70)

c.close()