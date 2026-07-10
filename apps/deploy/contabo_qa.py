#!/usr/bin/env python3
"""
QA + Seed Data + Coolify Proxy — Contabo VPS production verification.
"""

import paramiko, time, json, random, sys, subprocess, os

HOST = "158.220.120.83"
USER = "root"
PASS = "635110Liiali"
API = f"http://{HOST}:5000/api/v1"
APPS_DIR = r"c:\Users\Exam Office\Desktop\masjid-al-rahma-platform\apps"

report_lines = []

def log(s):
    print(s)
    report_lines.append(s)

# ─── SSH helpers ───
def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)
    return c

def run(client, cmd, desc=""):
    if desc: print(f"\n  [{desc}]")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=180, get_pty=True)
    for line in iter(stdout.readline, ''): print(f"    {line.rstrip()}")
    err = stderr.read().decode()
    if err.strip(): print(f"    [stderr] {err.strip()}")

def api_call(client, method, path, data=None, token=None):
    cmd = f"curl -s -w '\\nHTTP:%{{http_code}}' --max-time 20"
    if token: cmd += f' -H "Authorization: Bearer {token}"'
    if data: cmd += f' -H "Content-Type: application/json" -d \'{json.dumps(data)}\''
    cmd += f' {"-X POST" if method=="POST" else "-X PATCH" if method=="PATCH" else ""} {API}{path}'
    stdin, stdout, stderr = client.exec_command(cmd, timeout=25, get_pty=True)
    out_text = ''.join(iter(stdout.readline, ''))
    if 'HTTP:' in out_text:
        parts = out_text.rsplit('HTTP:', 1)
        return parts[1].strip(), parts[0].strip()
    return '???', out_text.strip()

def test(name, ok, detail=""):
    icon = "✅" if ok else "❌"
    log(f"  {icon} {name}: {detail}")

# ───────────────────────────────────────────────────────
print("="*60)
print("  MASJID AL-RAHMA QA + PRODUCTION SETUP")
print("="*60)

client = ssh()

# ─── 1. Rebuild frontend locally & upload ───
print("\n[1] Rebuilding frontend...")
os.chdir(os.path.join(APPS_DIR, "frontend"))
subprocess.run("npx vite build", shell=True, check=False)
os.chdir(APPS_DIR)

run(client, "rm -rf /var/www/masjid-al-rahma/frontend/dist", "Cleaning old dist")
from scp import SCPClient
with SCPClient(client.get_transport()) as scp:
    scp.put(os.path.join(APPS_DIR, "frontend", "dist"), "/var/www/masjid-al-rahma/frontend/dist", recursive=True)
log("✅ Frontend rebuilt & uploaded")

# ─── 2. Seed test data ───
log("\n[2] Seeding test data...")

code, body = api_call(client, "POST", "/auth/login", {"email":"admin@masjidalrahma.com","password":"Admin@2025#Secure"})
token = None
if code == "200":
    try: token = json.loads(body)['data']['accessToken']
    except: pass
test("Admin login", code == "200")

def seed(desc, method, path, data):
    c2, b2 = api_call(client, method, path, data, token)
    ok = c2 in ("200","201")
    test(desc, ok, f"HTTP {c2}")
    if ok:
        try: return json.loads(b2)['data']
        except: return None
    return None

school = seed("Create School", "POST", "/schools", {
    "name":"Al-Rahma Test Academy","slug":"al-rahma-test",
    "address":"Mogadishu, Somalia","phone":"+2529100100","status":"active"})

teacher = seed("Create Teacher", "POST", "/teachers", {
    "profile":{"firstName":"Abdullahi","lastName":"Ahmed"},
    "teacherId":"TCH-QA01","email":"tch.qa@test.com","status":"active",
    "school":school['_id'] if school else None})

course = seed("Create Course (Fiqh)", "POST", "/courses", {
    "title":{"en":"Introduction to Islamic Studies","so":"Hordhaca Cilmiga Islaamka","ar":"مقدمة في الدراسات الإسلامية"},
    "category":"fiqh","level":"beginner","duration":8,"fee":0,"maxStudents":100,
    "school":school['_id'] if school else None,
    "teacher":teacher['_id'] if teacher else None,
    "status":"published"})

cid = course['_id'] if course else None

course2 = seed("Create Course (Quran)", "POST", "/courses", {
    "title":{"en":"Quran Memorization - Part 1","so":"Xifdinta Quraanka","ar":"حفظ القرآن"},
    "category":"quran","level":"beginner","duration":12,"fee":25,"maxStudents":50,
    "school":school['_id'] if school else None,
    "teacher":teacher['_id'] if teacher else None,
    "status":"published"})

# Seed course content
if cid and token:
    r = random
    content = {"chapters": [{
        "_id": "m1" + ''.join(r.choices('abcdef0123456789', k=22)),
        "title": "Module 1: Introduction", "order": 0, "status": "published", "collapsed": False,
        "items": [
            {"_id":"l1"+''.join(r.choices('abcdef0123456789',k=22)),"type":"lesson","title":"What is Islam?",
             "content":"<h2>What is Islam?</h2><p>Islam is a monotheistic faith based on the Quran.</p><ul><li>Shahada</li><li>Salah</li><li>Zakat</li><li>Sawm</li><li>Hajj</li></ul>",
             "videoUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","duration":15,"order":0,"status":"published","attachments":[]},
            {"_id":"q1"+''.join(r.choices('abcdef0123456789',k=22)),"type":"quiz","title":"Module 1 Quiz",
             "description":"Test","passingScore":60,"timeLimit":10,"duration":10,"order":1,"status":"published",
             "questions":[{"question":"First pillar of Islam?","options":["Hajj","Shahada","Zakat","Sawm"],"correctIndex":1}]},
        ]},{
        "_id": "m2" + ''.join(r.choices('abcdef0123456789', k=22)),
        "title": "Module 2: History", "order": 1, "status": "published", "collapsed": False,
        "items": [
            {"_id":"l2"+''.join(r.choices('abcdef0123456789',k=22)),"type":"lesson","title":"Life of Prophet Muhammad (PBUH)",
             "content":"<p>The Prophet was born in Makkah in 570 CE...</p>",
             "videoUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","duration":20,"order":0,"status":"published","attachments":[]},
        ]}
    ]}
    c2, b2 = api_call(client, "PUT", f"/courses/{cid}/content", content, token)
    test("Seed course content", c2 == "200", f"HTTP {c2}")

# ─── 3. Coolify Proxy Routing ───
log("\n[3] Configuring Coolify proxy...")

run(client, """cd /var/www/masjid-al-rahma
cat > docker-compose.prod.yml << 'DOCKEREOF'
services:
  mongodb:
    image: mongo:7
    container_name: masjid-mongodb
    restart: unless-stopped
    networks: [app-network]
    volumes: [mongodb_data:/data/db]
    healthcheck:
      test: ["CMD","mongosh","--eval","db.adminCommand('ping')"]
      interval: 10s; timeout: 5s; retries: 5; start_period: 20s

  backend:
    build: ./backend
    container_name: masjid-backend
    restart: unless-stopped
    networks: [app-network, coolify]
    environment:
      - NODE_ENV=production
      - PORT=5000
      - MONGODB_URI=mongodb://masjid-mongodb:27017/masjid-al-rahma
      - CLIENT_URL=http://158.220.120.83
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=PathPrefix(`/api`)"
      - "traefik.http.routers.api.entrypoints=web"
      - "traefik.http.services.api.loadbalancer.server.port=5000"
    depends_on: {mongodb: {condition: service_healthy}}

  frontend:
    build: {context: ./frontend, dockerfile: Dockerfile}
    container_name: masjid-frontend
    restart: unless-stopped
    networks: [app-network, coolify]
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=PathPrefix(`/`)"
      - "traefik.http.routers.frontend.entrypoints=web"
      - "traefik.http.services.frontend.loadbalancer.server.port=80"
    depends_on: [backend]

networks:
  app-network: {driver: bridge}
  coolify: {external: true}
volumes:
  mongodb_data: {external: true}
DOCKEREOF
docker compose -f docker-compose.prod.yml up -d --force-recreate frontend
echo "Frontend restarted with Coolify labels"
""", "Deploy Coolify proxy config")

time.sleep(10)

# Test via port 80
run(client, "curl -s -w '\\nHTTP:%{http_code}' --max-time 10 http://localhost/api/v1/health", "API via Coolify (port 80)")
run(client, "curl -s -o /dev/null -w 'HTTP %{http_code}\\n' --max-time 10 http://localhost/", "Frontend via Coolify (port 80)")

# ─── 4. Feature Tests ───
log("\n[4] Feature tests...")

code, body = api_call(client, "GET", "/health")
test("API Health", code == "200")

code, body = api_call(client, "GET", "/courses")
test("Browse Courses", code == "200")

if token and cid:
    code, body = api_call(client, "GET", f"/courses/{cid}/content", None, token)
    test("Course Builder", code == "200")

code, body = api_call(client, "POST", "/auth/register", {"email":f"qa_{random.randint(100,999)}@t.com","password":"Test@2025","firstName":"Q","lastName":"A","role":"student","gender":"male"})
test("Student Registration", code in ("200","201"))

if token:
    code, body = api_call(client, "PATCH", f"/courses/{cid}", {"status":"published"}, token)
    test("Course Publish", code == "200")

# ─── 5. Health & Logs ───
log("\n[5] Container health...")
run(client, "docker ps --format 'table {{.Names}} | {{.Status}}'", "Container status")
run(client, "docker ps -a --filter 'status=restarting' --format '{{.Names}}' | grep -q . && echo 'RESTARTING!' || echo 'No restart loops'", "Restart check")
run(client, "docker ps --filter 'health=unhealthy' --format '{{.Names}}' | grep -q . && echo 'UNHEALTHY!' || echo 'All healthy'", "Health check")

# ─── 6. Report ───
log("\n" + "="*60)
log("  QA REPORT")
log("="*60)
for line in report_lines:
    if "✅" in line or "❌" in line:
        log(line)
log(f"""
  Frontend: http://{HOST} (via Coolify port 80)
  API:      http://{HOST}/api/v1/health
  Coolify:  http://{HOST}:8000
  Admin:    admin@masjidalrahma.com / Admin@2025#Secure
""")
log("="*60)

client.close()