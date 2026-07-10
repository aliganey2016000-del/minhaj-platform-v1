#!/usr/bin/env python3
"""Expose port 3000 for frontend and verify external access."""

import paramiko, time

HOST = "158.220.120.83"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password="635110Liiali", timeout=30)

def run(cmd, desc=""):
    if desc:
        print(f"\n[{desc}]")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=120, get_pty=True)
    for line in iter(stdout.readline, ''):
        print(f"  {line.rstrip()}")
    err = stderr.read().decode()
    if err.strip():
        print(f"  [stderr] {err.strip()}")

# 1. Check current docker-compose
run("cat /var/www/masjid-al-rahma/docker-compose.prod.yml | grep -A3 frontend", "Current frontend config")

# 2. Add port mapping to frontend
run("""cd /var/www/masjid-al-rahma
cat > docker-compose.prod.yml << 'DOCKEREOF'
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
docker compose -f docker-compose.prod.yml up -d --force-recreate
echo "Port 3000 mapped to frontend:80, 5000 mapped to backend:5000"
""", "Update compose with port 3000:80")

time.sleep(10)

# 3. Verify internal + external
run("docker ps --format 'table {{.Names}} | {{.Status}} | {{.Ports}}'", "Container status")
run("curl -s -o /dev/null -w 'Internal HTTP: %{http_code}\n' --max-time 5 http://localhost:3000/", "Frontend (localhost:3000)")
run("curl -s -o /dev/null -w 'API HTTP: %{http_code}\n' --max-time 5 http://localhost:5000/api/v1/health", "API (localhost:5000)")

print(f"""
============================================================
  EXTERNAL VERIFICATION URLs
============================================================
  Frontend: http://{HOST}:3000/
  API:      http://{HOST}:5000/api/v1/health
  Coolify:  http://{HOST}:8000
  Admin:    admin@masjidalrahma.com / Admin@2025#Secure
============================================================
""")

c.close()