"""Verify public endpoints and service status"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

print("=" * 60)
print("LIVE VERIFICATION")
print("=" * 60)

# API health
_, h, _ = run_cmd(c, "curl -s http://localhost/api/v1/health")
print(f"\nAPI Health: {h[:200]}")

# Frontend
_, f, _ = run_cmd(c, "curl -s -o /dev/null -w '%{http_code}' http://localhost/")
print(f"Frontend HTTP: {f}")

# Ports
_, p, _ = run_cmd(c, "ss -tlnp | grep -E ':(80|5000) '")
print(f"Ports: {p}")

# PM2
_, m, _ = run_cmd(c, "pm2 status 2>&1 | grep -E 'masjid|online' | head -5")
print(f"PM2: {m}")

# NGINX
_, n, _ = run_cmd(c, "ps aux | grep nginx | grep -v grep | wc -l")
print(f"Nginx workers: {n.strip()}")

# External connectivity test using curl from VPS to itself via public IP
_, ext, _ = run_cmd(c, f"curl -s -o /dev/null -w '%{{http_code}}' --connect-timeout 5 http://{VPS_HOST}/api/v1/health 2>&1")
print(f"\nExternal API (via {VPS_HOST}): HTTP {ext}")

_, ext2, _ = run_cmd(c, f"curl -s -o /dev/null -w '%{{http_code}}' --connect-timeout 5 http://{VPS_HOST}/ 2>&1")
print(f"External Frontend (via {VPS_HOST}): HTTP {ext2}")

# Test login
_, login, _ = run_cmd(c, '''curl -s -X POST http://localhost:5000/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"test@rahma.com","password":"Test123!"}' 2>&1''')
if 'accessToken' in login:
    print("\n✅ Login working")
else:
    print(f"\n⚠️ Login: {login[:150]}")

# Firewall check
_, ufw, _ = run_cmd(c, "ufw status 2>&1 | head -10")
print(f"\nFirewall: {ufw}")

print(f"\n{'=' * 60}")
print(f"LIVE URLS:")
print(f"  Frontend: http://{VPS_HOST}/")
print(f"  API:      http://{VPS_HOST}/api/v1/health")
print(f"{'=' * 60}")

c.close()