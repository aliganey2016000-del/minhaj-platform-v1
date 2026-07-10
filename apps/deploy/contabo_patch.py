#!/usr/bin/env python3
"""Final patch: fix compose YAML, seed schools/teachers, and healthcheck."""

import paramiko, time, json, random, os, sys

HOST = "158.220.120.83"
USER = "root"
PASS = "635110Liiali"
API = f"http://{HOST}:5000/api/v1"
APPS_DIR = r"c:\Users\Exam Office\Desktop\masjid-al-rahma-platform\apps"

def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)
    return c

def run(c, cmd, desc=""):
    if desc: print(f"\n[{desc}]")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=180, get_pty=True)
    for line in iter(stdout.readline, ''): print(f"  {line.rstrip()}")
    err = stderr.read().decode()
    if err.strip(): print(f"  [stderr] {err.strip()}")
    return stdout.channel.recv_exit_status()

def api(c, method, path, data=None, token=None):
    cmd = f"curl -s -w '\\nHTTP:%{{http_code}}' --max-time 20"
    if token: cmd += f' -H "Authorization: Bearer {token}"'
    if data: cmd += f' -H "Content-Type: application/json" -d \'{json.dumps(data)}\''
    cmd += f' {"-X POST" if method=="POST" else "-X PATCH" if method=="PATCH" else "-X PUT" if method=="PUT" else ""} {API}{path}'
    stdin, stdout, stderr = c.exec_command(cmd, timeout=25, get_pty=True)
    out = ''.join(iter(stdout.readline, ''))
    if 'HTTP:' in out:
        code = out.rsplit('HTTP:', 1)[1].strip()
        body = out.rsplit('HTTP:', 1)[0].strip()
        return code, body
    return '???', out.strip()

client = ssh()

# ─── 1. Fix docker-compose YAML (remove comment that breaks heredoc) ───
run(client, """cd /var/www/masjid-al-rahma
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
docker compose -f docker-compose.prod.yml up -d --force-recreate
echo "Stack restarted with clean compose"
""", "Fix compose YAML and restart stack")

time.sleep(15)

# ─── 2. Check school model required fields ───
run(client, "docker exec masjid-backend node -e \"const s=require('./dist/models/school.model');console.log(JSON.stringify(Object.keys(s.default.schema.paths)))\" 2>&1 || echo 'schema check'",
    "Check school schema fields")

run(client, "docker exec masjid-backend node -e \"const t=require('./dist/models/teacher.model');console.log(JSON.stringify(Object.keys(t.default.schema.paths)))\" 2>&1 || echo 'schema check'",
    "Check teacher schema fields")

# ─── 3. Login ───
code, body = api(client, "POST", "/auth/login", {"email":"admin@masjidalrahma.com","password":"Admin@2025#Secure"})
token = None
if code == "200":
    try: token = json.loads(body)['data']['accessToken']
    except: pass
    print(f"  Token obtained: {'yes' if token else 'no'}")

# ─── 4. Seed school with correct required fields ───
print("\n[Seeding]:")
# Try multiple field combinations
for attempt in range(3):
    data = {"name": "Al-Rahma Academy", "status": "active"}
    if attempt >= 1: data["email"] = "school@alrahma.com"
    if attempt >= 2: data["phone"] = "+2529100100"
    code, body = api(client, "POST", "/schools", data, token)
    print(f"  School attempt {attempt+1}: HTTP {code} — {body[:120]}")
    if code in ("200","201"):
        try: school_id = json.loads(body)['data']['_id']
        except: pass
        break

# ─── 5. Seed teacher ───
for attempt in range(3):
    data = {
        "profile": {"firstName": "Abdullahi", "lastName": "Ahmed"},
        "status": "active"
    }
    if attempt >= 1: data["email"] = f"tch{random.randint(100,999)}@test.com"
    if attempt >= 2: data["teacherId"] = f"TCH-QA{random.randint(10,99)}"
    code, body = api(client, "POST", "/teachers", data, token)
    print(f"  Teacher attempt {attempt+1}: HTTP {code} — {body[:120]}")
    if code in ("200","201"):
        try: teacher_id = json.loads(body)['data']['_id']
        except: pass
        break

# ─── 6. Create course with the data we have ───
course_data = {
    "title": {"en": "Intro to Islam", "so": "Hordhaca Islaamka", "ar": "مقدمة الإسلام"},
    "category": "fiqh", "level": "beginner", "duration": 8, "fee": 0,
    "maxStudents": 100, "status": "published"
}
code, body = api(client, "POST", "/courses", course_data, token)
print(f"  Course: HTTP {code} — {body[:120]}")

cid = None
if code in ("200","201"):
    try: cid = json.loads(body)['data']['_id']
    except: pass

# ─── 7. Seed course content if course was created ───
if cid and token:
    r = random
    content = {"chapters": [{
        "_id": "md1" + ''.join(r.choices('abcdef0123456789', k=22)),
        "title": "Module 1: Foundations", "order": 0, "status": "published",
        "items": [
            {"_id": "ls1"+''.join(r.choices('abcdef0123456789',k=22)), "type": "lesson",
             "title": "What is Islam?", "content": "<h2>Islam</h2><p>A complete way of life.</p>",
             "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "duration": 15, "order": 0, "status": "published", "attachments": []},
            {"_id": "qz1"+''.join(r.choices('abcdef0123456789',k=22)), "type": "quiz",
             "title": "Test", "questions": [{"question":"First pillar?","options":["A","B","C","D"],"correctIndex":1}],
             "passingScore": 60, "timeLimit": 10, "duration": 10, "order": 1, "status": "published"},
        ]
    }]}
    code, body = api(client, "PUT", f"/courses/{cid}/content", content, token)
    print(f"  Content seed: HTTP {code} — {body[:150]}")

# ─── 8. Final health check ───
run(client, "docker ps --format 'table {{.Names}} | {{.Status}}'", "Final container status")
run(client, "curl -s --max-time 5 http://localhost:5000/api/v1/health", "API health")
run(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' --max-time 5 http://localhost:3000/", "Frontend (port 3000)")

print("\n✅ Patch complete.")
client.close()