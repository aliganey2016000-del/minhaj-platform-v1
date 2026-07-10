#!/usr/bin/env python3
"""Fix port exposure — add host port mappings to docker-compose."""

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
    if err.strip(): print(f"  [stderr] {err.rstrip()}")

c = ssh()

# Wait 15s for backend to fully finish loading all models
print("\n  Waiting 15s for backend warmup...")
time.sleep(15)

# Test access via docker exec (internal)
run(c, "docker exec masjid-backend wget -qO- http://localhost:5000/api/v1/health 2>&1 || docker exec masjid-backend curl -s http://localhost:5000/api/v1/health || echo 'internal check done'",
    "Test API internally via docker exec")
run(c, "docker exec masjid-backend wget -qO- http://localhost:5000/api/v1/health 2>&1",
    "Test API internally (wget)")

# Test frontend internally
run(c, "docker exec masjid-frontend wget -qO- http://localhost/ 2>&1 | head -5 || docker exec masjid-frontend curl -s http://localhost/ | head -5",
    "Test frontend internally")

# Test frontend -> backend proxy
run(c, "docker exec masjid-frontend wget -qO- http://masjid-backend:5000/api/v1/health 2>&1 || echo 'no wget in frontend'",
    "Test frontend->backend proxy")

# Add port mappings and restart
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
    ports:
      - "5000:5000"
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
    ports:
      - "3000:80"
    depends_on:
      - backend

networks:
  app-network:
    driver: bridge

volumes:
  mongodb_data:
    external: true
DOCKEREOF
echo "docker-compose updated with port mappings (5000:5000, 3000:80)"
""", "Update docker-compose with host port mappings")

# Restart only the services that changed (frontend + backend)
run(c, """cd /var/www/masjid-al-rahma
docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend
echo "Containers recreated with ports"
""", "Recreate backend and frontend with port mappings")

time.sleep(15)

run(c, "docker ps --format 'table {{.Names}} | {{.Status}} | {{.Ports}}'", "Container status")
run(c, "curl -s --max-time 10 http://localhost:5000/api/v1/health", "API health (host port)")
run(c, "curl -s -o /dev/null -w 'HTTP %{http_code}' --max-time 10 http://localhost:3000/", "Frontend (host port 3000)")

print(f"\n{'='*60}")
print(f"  DEPLOYMENT COMPLETE")
print(f"  Frontend:  http://{HOST}:3000")
print(f"  API:       http://{HOST}:5000/api/v1/health")
print(f"  Coolify:   http://{HOST}:8000")
print(f"  Admin:     admin@masjidalrahma.com / Admin@2025#Secure")
print(f"  Note: Map Coolify proxy to :3000 (frontend) and :5000 (backend)")
print("=" * 60)

c.close()