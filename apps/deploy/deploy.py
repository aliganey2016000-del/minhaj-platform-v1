#!/usr/bin/env python3
"""
Automated VPS Deployment Script — Masjid Al-Rahma
Connects via SSH, uploads files, installs dependencies, and starts services.
"""

import os
import sys
import time
from paramiko import SSHClient, AutoAddPolicy
from scp import SCPClient

# ───────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────

VPS_HOST = "152.239.119.129"
VPS_USER = "root"
VPS_PASS = "635110Liiali@"
DEPLOY_ROOT = "/var/www/masjid-al-rahma"
LOCAL_BASE = r"c:\Users\Exam Office\Desktop\masjid-al-rahma-platform\apps"

# ───────────────────────────────────────────────────
# SSH Connection
# ───────────────────────────────────────────────────

def connect_ssh():
    client = SSHClient()
    client.set_missing_host_key_policy(AutoAddPolicy())
    print(f"Connecting to {VPS_HOST}...")
    client.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS, timeout=30)
    print("✅ Connected")
    return client

def run_cmd(client, cmd, log=True):
    if log:
        print(f"  → {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if log and out:
        for line in out.split('\n')[-10:]:
            print(f"    {line}")
    if err and log:
        for line in err.split('\n')[-5:]:
            print(f"    ERR: {line}")
    return exit_code, out, err

# ───────────────────────────────────────────────────
# Upload Files
# ───────────────────────────────────────────────────

def upload_files(client):
    print("\n📤 Uploading files...")
    
    # Ensure remote directories exist
    run_cmd(client, f"mkdir -p {DEPLOY_ROOT}/backend/dist {DEPLOY_ROOT}/frontend/dist {DEPLOY_ROOT}/deploy /root")
    
    local_backend = os.path.join(LOCAL_BASE, "backend")
    local_frontend = os.path.join(LOCAL_BASE, "frontend")
    local_deploy = os.path.join(LOCAL_BASE, "deploy")
    
    with SCPClient(client.get_transport()) as scp:
        # Backend dist
        print("  Uploading backend/dist...")
        scp.put(f"{local_backend}/dist", f"{DEPLOY_ROOT}/backend/", recursive=True)
        
        # Backend configs
        print("  Uploading backend configs...")
        scp.put(f"{local_backend}/package.json", f"{DEPLOY_ROOT}/backend/")
        scp.put(f"{local_backend}/package-lock.json", f"{DEPLOY_ROOT}/backend/")
        scp.put(f"{local_backend}/.env.production", f"{DEPLOY_ROOT}/backend/")
        
        # Frontend dist
        print("  Uploading frontend/dist...")
        scp.put(f"{local_frontend}/dist", f"{DEPLOY_ROOT}/frontend/", recursive=True)
        
        # Deploy files
        print("  Uploading deploy configs...")
        scp.put(f"{local_deploy}/nginx.conf", f"{DEPLOY_ROOT}/deploy/")
        scp.put(f"{local_deploy}/ecosystem.config.js", f"{DEPLOY_ROOT}/deploy/")
        scp.put(f"{local_deploy}/setup.sh", "/root/setup.sh")
    
    print("✅ All files uploaded")

# ───────────────────────────────────────────────────
# Main Deployment
# ───────────────────────────────────────────────────

def main():
    client = connect_ssh()
    
    try:
        # ── 1. Upload files ──
        upload_files(client)
        
        # ── 2. Check current state ──
        print("\n🔍 Checking current VPS state...")
        _, node_ver, _ = run_cmd(client, "node --version 2>/dev/null || echo 'NONE'")
        _, mongo_ver, _ = run_cmd(client, "mongod --version 2>/dev/null | head -1 || echo 'NONE'")
        _, nginx_ver, _ = run_cmd(client, "nginx -v 2>&1 || echo 'NONE'")
        print(f"  Node.js: {node_ver}")
        print(f"  MongoDB: {mongo_ver}")
        print(f"  Nginx:   {nginx_ver}")
        
        # ── 3. Run setup.sh ──
        print("\n🛠  Running setup script...")
        exit_code, out, err = run_cmd(client, "bash /root/setup.sh 2>&1")
        if exit_code != 0:
            print(f"  ⚠️  Setup exited with code {exit_code}")
            print(f"  Last output: {out[-500:] if out else 'none'}")
            print(f"  Errors: {err[-500:] if err else 'none'}")
        
        # ── 4. Install backend dependencies ──
        print("\n📦 Installing backend dependencies...")
        run_cmd(client, f"cd {DEPLOY_ROOT}/backend && npm install --omit=dev 2>&1")
        
        # ── 5. Install PM2 if not installed ──
        _, pm2_check, _ = run_cmd(client, "which pm2 2>/dev/null || echo 'NONE'")
        if 'NONE' in pm2_check:
            print("\n📦 Installing PM2...")
            run_cmd(client, "npm install -g pm2 2>&1")
        
        # ── 6. Stop old PM2 processes ──
        run_cmd(client, "pm2 delete all 2>/dev/null || true")
        
        # ── 7. Configure Nginx ──
        print("\n🌐 Configuring Nginx...")
        run_cmd(client, f"cp {DEPLOY_ROOT}/deploy/nginx.conf /etc/nginx/sites-available/masjid-al-rahma")
        run_cmd(client, "ln -sf /etc/nginx/sites-available/masjid-al-rahma /etc/nginx/sites-enabled/")
        run_cmd(client, "rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true")
        
        exit_code, nginx_test, _ = run_cmd(client, "nginx -t 2>&1")
        if exit_code == 0:
            run_cmd(client, "systemctl reload nginx 2>/dev/null || nginx -s reload")
            print("  ✅ Nginx configured and reloaded")
        else:
            print(f"  ⚠️  Nginx test failed: {nginx_test}")
            # Try fixing common issues
            run_cmd(client, "apt install -y nginx 2>&1 | tail -5")
            run_cmd(client, "systemctl start nginx 2>/dev/null || nginx")
            exit_code2, nginx_test2, _ = run_cmd(client, "nginx -t 2>&1")
            if exit_code2 == 0:
                run_cmd(client, "systemctl reload nginx 2>/dev/null || nginx -s reload")
                print("  ✅ Nginx fixed and reloaded")
        
        # ── 8. Check/Start MongoDB ──
        print("\n🗄  Checking MongoDB...")
        _, mongo_status, _ = run_cmd(client, "systemctl is-active mongod 2>/dev/null || echo 'inactive'")
        if 'inactive' in mongo_status:
            print("  Starting MongoDB...")
            run_cmd(client, "systemctl enable mongod && systemctl start mongod 2>&1")
        
        # Test MongoDB connection
        exit_code, mongo_test, _ = run_cmd(client, "mongosh --quiet --eval 'db.version()' 2>&1")
        if exit_code == 0:
            print(f"  ✅ MongoDB running: {mongo_test}")
        else:
            print(f"  ⚠️  MongoDB test: {mongo_test}")
            # Try without auth (fresh install)
            exit_code2, mongo_test2, _ = run_cmd(client, 'mongosh --quiet --eval "db.version()" --norc 2>&1')
            if exit_code2 == 0:
                print(f"  ✅ MongoDB running (no auth): {mongo_test2}")
            else:
                # Try installing MongoDB
                print("  Installing MongoDB...")
                run_cmd(client, "curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg 2>&1")
                run_cmd(client, 'echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-8.0.list')
                run_cmd(client, "apt update -y 2>&1 | tail -3")
                run_cmd(client, "apt install -y mongodb-org 2>&1 | tail -5")
                run_cmd(client, "systemctl enable mongod && systemctl start mongod")
                time.sleep(3)
                exit_code3, mongo_test3, _ = run_cmd(client, 'mongosh --quiet --eval "db.version()" 2>&1')
                if exit_code3 == 0:
                    print(f"  ✅ MongoDB installed and running: {mongo_test3}")
        
        # Create MongoDB user if needed
        _, user_check, _ = run_cmd(client, 'mongosh --quiet --eval "use masjid-al-rahma; db.getUser(\"masjid_admin\")" 2>&1')
        if 'null' in user_check or 'MongoServerError' in user_check:
            print("  Creating MongoDB user...")
            run_cmd(client, "mongosh --quiet --eval 'use masjid-al-rahma; db.createUser({user:\"masjid_admin\",pwd:\"RahmaDB2026Secure!\",roles:[{role:\"readWrite\",db:\"masjid-al-rahma\"}]});' 2>&1")
            
            # Enable auth if not already
            _, auth_check, _ = run_cmd(client, "grep 'authorization: enabled' /etc/mongod.conf 2>/dev/null || echo 'not_found'")
            if 'not_found' in auth_check:
                run_cmd(client, "sed -i 's/#security:/security:\\n  authorization: enabled/' /etc/mongod.conf 2>/dev/null || true")
                run_cmd(client, "systemctl restart mongod")
                time.sleep(3)
                print("  MongoDB authentication enabled")
        
        # ── 9. Create log directory ──
        run_cmd(client, "mkdir -p /var/log/masjid-al-rahma")
        
        # ── 10. Set NODE_ENV ──
        run_cmd(client, f"export NODE_ENV=production")
        
        # ── 11. Start backend with PM2 ──
        print("\n🚀 Starting backend with PM2...")
        run_cmd(client, f"cd {DEPLOY_ROOT} && pm2 start deploy/ecosystem.config.js 2>&1")
        run_cmd(client, "pm2 save")
        
        # Wait for startup
        time.sleep(5)
        
        # ── 12. PM2 setup for reboot ──
        print("\n⚙  Configuring PM2 startup...")
        run_cmd(client, "pm2 startup systemd 2>&1 | tail -3")
        
        # ── 13. Verify ──
        print("\n" + "=" * 60)
        print("VERIFYING DEPLOYMENT")
        print("=" * 60)
        
        print("\n📊 PM2 Status:")
        exit_code, pm2_status, _ = run_cmd(client, "pm2 status 2>&1")
        print(pm2_status)
        
        print("\n💚 Health Check:")
        exit_code, health, _ = run_cmd(client, "curl -s http://localhost:5000/api/v1/health 2>&1")
        print(health)
        
        print("\n🌐 Frontend Check:")
        exit_code, frontend, _ = run_cmd(client, "curl -s -o /dev/null -w '%{http_code}' http://localhost/api/v1/health 2>&1")
        print(f"  HTTP Status via Nginx: {frontend}")
        
        print("\n" + "=" * 60)
        if 'online' in pm2_status.lower() or '✅' in health:
            print("✅ DEPLOYMENT SUCCESSFUL!")
        else:
            print("⚠️  DEPLOYMENT NEEDS ATTENTION — Check the output above")
        print(f"📍 Visit: http://{VPS_HOST}")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    main()