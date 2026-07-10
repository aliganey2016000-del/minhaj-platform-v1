#!/usr/bin/env python3
"""
Masjid Al-Rahma — Contabo VPS Deployment Script

Deploys the entire platform (MongoDB, Backend, Frontend) on the Contabo VPS
using Docker + Coolify for production readiness.

Usage: python deploy/contabo_deploy.py
"""

import paramiko
import time
import sys
import os
from scp import SCPClient

# ========== CONFIG ==========
VPS_HOST = "158.220.120.83"
VPS_USER = "root"
VPS_PASS = "635110Liiali"
VPS_PORT = 22

PROJECT_ROOT = r"c:\Users\Exam Office\Desktop\masjid-al-rahma-platform\apps"
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
DEPLOY_DIR = os.path.join(PROJECT_ROOT, "deploy")

# ========== SSH CLIENT ==========
def create_ssh_client():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(VPS_HOST, port=VPS_PORT, username=VPS_USER, password=VPS_PASS, timeout=30)
    return client

def run_ssh(client, cmd, desc=""):
    """Run a command on the VPS and stream output."""
    if desc:
        print(f"\n{'='*60}")
        print(f"  {desc}")
        print(f"{'='*60}")
    print(f"  > {cmd[:120]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=600, get_pty=True)
    exit_code = 0
    while True:
        line = stdout.readline()
        if not line:
            break
        print(f"  {line.rstrip()}")
    stderr_lines = stderr.read().decode()
    if stderr_lines:
        print(f"  [stderr] {stderr_lines.rstrip()}")
    exit_code = stdout.channel.recv_exit_status()
    if exit_code != 0:
        print(f"  WARNING: exit code {exit_code}")
    return exit_code

def upload_file(client, local_path, remote_path):
    """Upload a single file via SCP."""
    with SCPClient(client.get_transport()) as scp:
        scp.put(local_path, remote_path)

def upload_dir(client, local_dir, remote_dir):
    """Upload a directory recursively."""
    print(f"  Uploading {local_dir} -> {remote_dir} ...")
    with SCPClient(client.get_transport()) as scp:
        scp.put(local_dir, remote_dir, recursive=True)

# ========== MAIN DEPLOYMENT ==========
def main():
    print("\n" + "=" * 70)
    print("  Masjid Al-Rahma — Contabo VPS Deployment")
    print("=" * 70)

    client = create_ssh_client()
    try:
        # ─── Step 1: System Info ───
        run_ssh(client, "cat /etc/os-release | head -4", "Step 1: System Info")

        # ─── Step 2: Install Docker ───
        run_ssh(client, """
            apt update -y && apt upgrade -y
            apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
            apt update -y
            apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            systemctl enable docker --now
            docker --version
            docker compose version
        """, "Step 2: Install Docker + Docker Compose")

        # ─── Step 3: Create Docker network + MongoDB ───
        run_ssh(client, """
            docker network create masjid-network 2>/dev/null || true
            docker volume create mongodb_data
            docker stop mongodb 2>/dev/null || true
            docker rm mongodb 2>/dev/null || true
            docker run -d \
                --name mongodb \
                --network masjid-network \
                --restart unless-stopped \
                -v mongodb_data:/data/db \
                -p 27017:27017 \
                -e MONGO_INITDB_ROOT_USERNAME=admin \
                -e MONGO_INITDB_ROOT_PASSWORD=masjid_rahma_2025_secure \
                mongo:7
            sleep 5
            docker ps | grep mongodb
        """, "Step 3: Deploy MongoDB container")

        # ─── Step 4: Install Coolify ───
        run_ssh(client, """
            curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
        """, "Step 4: Install Coolify")

        # Wait for Coolify to start
        time.sleep(10)
        run_ssh(client, "docker ps | grep coolify", "Step 4b: Verify Coolify running")

        # ─── Step 5: Build and upload the frontend ───
        print("\n" + "=" * 60)
        print("  Step 5: Building frontend locally...")
        print("=" * 60)
        os.chdir(FRONTEND_DIR)
        os.system("cmd /c \"npx vite build\"")
        os.chdir(PROJECT_ROOT)

        # ─── Step 6: Upload backend files ───
        print("\n" + "=" * 60)
        print("  Step 6: Uploading backend files...")
        print("=" * 60)
        run_ssh(client, "mkdir -p /var/www/masjid-al-rahma/backend /var/www/masjid-al-rahma/frontend")
        upload_dir(client, os.path.join(BACKEND_DIR, "dist"), "/var/www/masjid-al-rahma/backend/dist")
        upload_file(client, os.path.join(BACKEND_DIR, "package.json"), "/var/www/masjid-al-rahma/backend/package.json")
        upload_file(client, os.path.join(BACKEND_DIR, "package-lock.json"), "/var/www/masjid-al-rahma/backend/package-lock.json")
        upload_file(client, os.path.join(BACKEND_DIR, ".env.production"), "/var/www/masjid-al-rahma/backend/.env.production")

        # ─── Step 7: Upload frontend build ───
        print("\n" + "=" * 60)
        print("  Step 7: Uploading frontend dist...")
        print("=" * 60)
        upload_dir(client, os.path.join(FRONTEND_DIR, "dist"), "/var/www/masjid-al-rahma/frontend/dist")

        # ─── Step 8: Create Dockerfiles ───
        run_ssh(client, """
cat > /var/www/masjid-al-rahma/backend/Dockerfile << 'DOCKEREOF'
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY dist/ ./dist/
COPY .env.production ./.env
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1
CMD ["node", "dist/src/server.js"]
DOCKEREOF

cat > /var/www/masjid-al-rahma/frontend/Dockerfile << 'DOCKEREOF'
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
COPY <<'NGINXEOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://backend:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINXEOF
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1
DOCKEREOF

cat > /var/www/masjid-al-rahma/docker-compose.prod.yml << 'DOCKEREOF'
version: '3.8'
services:
  backend:
    build: ./backend
    container_name: masjid-backend
    network_mode: host
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=5000
    volumes:
      - /var/www/masjid-al-rahma/backend/.env.production:/app/.env
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    container_name: masjid-frontend
    network_mode: host
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend

  mongodb:
    image: mongo:7
    container_name: mongodb
    network_mode: host
    restart: unless-stopped
    volumes:
      - mongodb_data:/data/db
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=masjid_rahma_2025_secure
    ports:
      - "27017:27017"

volumes:
  mongodb_data:
    external: true
DOCKEREOF
        """, "Step 8: Create Dockerfiles + docker-compose")

        # ─── Step 9: Start the stack ───
        run_ssh(client, """
            cd /var/www/masjid-al-rahma
            docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true
            docker compose -f docker-compose.prod.yml build
            docker compose -f docker-compose.prod.yml up -d
            sleep 10
            docker compose -f docker-compose.prod.yml ps
        """, "Step 9: Build and start the stack")

        # ─── Step 10: Verify health ───
        print("\n" + "=" * 60)
        print("  Step 10: Verification")
        print("=" * 60)
        run_ssh(client, "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'", "Running containers")
        run_ssh(client, "curl -s http://localhost:5000/api/v1/health || echo 'API not ready yet'", "API health check")
        run_ssh(client, "curl -s -o /dev/null -w '%{http_code}' http://localhost/ || echo 'Frontend not ready'", "Frontend status")

        # ─── Step 11: Seed admin user ───
        run_ssh(client, """
            docker exec masjid-backend node -e "
                const mongoose = require('mongoose');
                const bcrypt = require('bcryptjs');
                mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/masjid-al-rahma')
                .then(async () => {
                    const User = mongoose.model('User', new mongoose.Schema({
                        email: String, password: String, role: String, status: String
                    }));
                    const exists = await User.findOne({ email: 'admin@masjidalrahma.com' });
                    if (!exists) {
                        await User.create({
                            email: 'admin@masjidalrahma.com',
                            password: await bcrypt.hash('Admin@2025#Secure', 12),
                            role: 'admin',
                            status: 'active'
                        });
                        console.log('Admin user created');
                    } else {
                        console.log('Admin already exists');
                    }
                    process.exit(0);
                }).catch(e => { console.error(e); process.exit(1); });
            " 2>&1 || echo "Seed script note: run manually if needed"
        """, "Step 11: Seed admin user")

        print("\n" + "=" * 70)
        print("  DEPLOYMENT COMPLETE")
        print("=" * 70)
        print(f"  Frontend:  http://{VPS_HOST}")
        print(f"  Coolify:   http://{VPS_HOST}:8000")
        print(f"  API:       http://{VPS_HOST}/api/v1/health")
        print(f"  Admin:     admin@masjidalrahma.com / Admin@2025#Secure")
        print("=" * 70)

    except Exception as e:
        print(f"\n  ERROR: {e}")
        sys.exit(1)
    finally:
        client.close()

if __name__ == "__main__":
    main()