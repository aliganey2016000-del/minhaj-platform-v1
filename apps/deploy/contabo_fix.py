#!/usr/bin/env python3
"""Fix Contabo deployment — resolve port conflicts and start the stack."""

import paramiko
import time
import sys

HOST = "158.220.120.83"
USER = "root"
PASS = "635110Liiali"

def ssh():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASS, timeout=30)
    return client

def run(client, cmd, desc=""):
    if desc:
        print(f"\n  --- {desc} ---")
    print(f"  > {cmd[:140]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300, get_pty=True)
    while True:
        line = stdout.readline()
        if not line:
            break
        print(f"    {line.rstrip()}")
    err = stderr.read().decode()
    if err.strip():
        print(f"    [stderr] {err.rstrip()}")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        print(f"    => Exit code: {code}")

try:
    c = ssh()

    # 1. Stop coolify-proxy (it hogs port 80/443)
    run(c, "docker stop coolify-proxy && docker rm coolify-proxy 2>/dev/null || echo 'coolify-proxy removed'",
        "Step 1: Remove coolify-proxy from port 80/443")

    # 2. Remove standalone MongoDB (compose will manage it)
    run(c, "docker stop mongodb 2>/dev/null; docker rm mongodb 2>/dev/null; echo 'Cleaned up old mongodb'",
        "Step 2: Remove old mongodb container")

    # 3. cd to app dir and rebuild + start stack
    run(c, """cd /var/www/masjid-al-rahma
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null
echo "Removing version field from compose file..."
sed -i '/^version:/d' docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d --build""",
        "Step 3: Rebuild and start the full stack")

    time.sleep(15)

    # 4. Check containers
    run(c, "docker ps --format 'table {{.Names}} | {{.Status}} | {{.Ports}}'",
        "Step 4: Running containers")

    # 5. Wait and check API health
    run(c, "for i in 1 2 3 4 5; do curl -s http://localhost:5000/api/v1/health && break; echo 'Waiting...'; sleep 3; done",
        "Step 5: API health check")

    # 6. Check frontend
    run(c, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost/ || echo 'Frontend not ready'",
        "Step 6: Frontend check")

    # 7. Seed admin user
    run(c, """docker exec masjid-backend node -e '
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/masjid-al-rahma").then(async () => {
    const User = mongoose.model("User", new mongoose.Schema({email:String,password:String,role:String,status:String}));
    const exists = await User.findOne({email:"admin@masjidalrahma.com"});
    if (!exists) {
        await User.create({email:"admin@masjidalrahma.com", password: await bcrypt.hash("Admin@2025#Secure",12), role:"admin", status:"active"});
        console.log("Admin user created successfully");
    } else {
        console.log("Admin user already exists");
    }
    process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
'""",
        "Step 7: Seed admin user")

    print("\n" + "=" * 60)
    print("  FIX COMPLETE")
    print(f"  Frontend:  http://{HOST}")
    print(f"  Coolify:   http://{HOST}:8000")
    print(f"  API:       http://{HOST}/api/v1/health")
    print("=" * 60)

except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
finally:
    c.close()