"""Quick fix: update nginx proxy_pass to 127.0.0.1 and reload"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deploy import connect_ssh, run_cmd, VPS_HOST

c = connect_ssh()

# Fix the nginx proxy_pass from Docker bridge IP to localhost
print("Fixing nginx proxy_pass...")
run_cmd(c, "sed -i 's|proxy_pass http://172.17.0.1:5000|proxy_pass http://127.0.0.1:5000|' /etc/nginx/nginx.conf")
_, t, _ = run_cmd(c, "nginx -t 2>&1")
print(f"  Test: {t.strip()}")
if 'successful' in t:
    run_cmd(c, "nginx -s reload 2>&1")
    print("  ✅ Reloaded")

time.sleep(1)

# Verify both endpoints
_, api, _ = run_cmd(c, "curl -s http://localhost/api/v1/health 2>&1")
_, front, _ = run_cmd(c, "curl -s -o /dev/null -w '%{http_code}' http://localhost/ 2>&1")

print(f"\n🌐 Frontend: HTTP {front}")
print(f"💚 API: {api[:200]}")

# Also verify from external perspective
print(f"\n{'='*50}")
print(f"✅ http://{VPS_HOST}/")
print(f"✅ http://{VPS_HOST}/api/v1/health")
print(f"{'='*50}")

# Restore coolify (it uses different ports)
_, coolify, _ = run_cmd(c, "docker ps -a --filter name=coolify-proxy --format '{{.Status}}' | head -1")
if 'Exited' in coolify or not coolify.strip():
    run_cmd(c, "docker start coolify-proxy 2>&1 | tail -2")
    print("\n🐳 Coolify restored")

c.close()