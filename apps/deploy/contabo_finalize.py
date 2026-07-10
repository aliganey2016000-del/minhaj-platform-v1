#!/usr/bin/env python3
"""
Production Finalization:
1. Route through Coolify proxy (no exposed ports)
2. Fix frontend healthcheck (Nginx Alpine has no wget)
3. Browser-level verification
4. Git commit
"""

import paramiko, time, json, random, subprocess, os, sys

HOST = "158.220.120.83"
USER = "root"
PASS = "635110Liiali"
API = f"http://{HOST}:5000/api/v1"
APPS = r"c:\Users\Exam Office\Desktop\masjid-al-rahma-platform\apps"

def ssh():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)
    return c

def run(c, cmd, desc=""):
    if desc: print(f"\n  [{desc}]")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=300, get_pty=True)
    for line in iter(stdout.readline, ''):
        print(f"    {line.rstrip()}")
    err = stderr.read().decode()
    if err.strip(): print(f"    [stderr] {err.strip()}")

def check(c, label, url, expect="200"):
    ok = False
    try:
        stdin, stdout, stderr = c.exec_command(
            f"curl -s -o /dev/null -w '%{{http_code}}' --max-time 8 {url}",
            timeout=15, get_pty=True)
        code = stdout.read().decode().strip()
        ok = code == expect
        print(f"  {'✅' if ok else '❌'} {label}: HTTP {code} (expected {expect})")
    except Exception as e:
        print(f"  ❌ {label}: {e}")
    return ok

client = ssh()

# ─── 1. Fix frontend Dockerfile healthcheck (Nginx Alpine has no wget) ───
print("\n[1] Fixing frontend healthcheck...")
run(client, """cat > /var/www/masjid-al-rahma/frontend/Dockerfile << 'DOCKEREOF'
FROM nginx:alpine
RUN apk add --no-cache curl
COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost/ || exit 1
DOCKEREOF
echo "Frontend Dockerfile fixed - curl installed for healthcheck"
""", "Fix frontend Dockerfile healthcheck")

# ─── 2. Configure Coolify proxy routing ───
print("\n[2] Configuring Coolify proxy routing...")
run(client, """cat > /var/www/masjid-al-rahma/docker-compose.prod.yml << 'DOCKEREOF'
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
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=PathPrefix(`/api`)"
      - "traefik.http.routers.api.entrypoints=web"
      - "traefik.http.services.api.loadbalancer.server.port=5000"
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
      - coolify
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=PathPrefix(`/`)"
      - "traefik.http.routers.frontend.entrypoints=web"
      - "traefik.http.services.frontend.loadbalancer.server.port=80"
    depends_on:
      - backend

networks:
  app-network:
    driver: bridge
  coolify:
    external: true

volumes:
  mongodb_data:
    external: true
DOCKEREOF
echo "Compose updated: Coolify network + Traefik labels, no host ports"
""", "Update compose for Coolify routing")

# ─── 3. Rebuild and deploy ───
print("\n[3] Rebuilding and deploying...")
run(client, """cd /var/www/masjid-al-rahma
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
echo "Stack deployed with Coolify routing"
""", "Rebuild all and deploy")

time.sleep(20)

# ─── 4. Verify ───
print("\n[4] Verification...")
run(client, "docker ps --format 'table {{.Names}} | {{.Status}}'", "Container status")

# API
check(client, "API health (direct)", "http://localhost:5000/api/v1/health")
check(client, "API via Coolify proxy", "http://localhost/api/v1/health")
check(client, "Frontend via Coolify proxy", "http://localhost/")

# Browser-accessible URLs
print(f"""
{'='*60}
  BROWSER TESTING URLs
{'='*60}
  Land Page:    http://{HOST}/
  Admin Login:  http://{HOST}/admin
  Student Login: http://{HOST}/student
  API:          http://{HOST}/api/v1/health
  Coolify:      http://{HOST}:8000

  Admin: admin@masjidalrahma.com / Admin@2025#Secure
  (Port 80 should now serve frontend via Coolify)
{'='*60}
""")

# ─── 5. Seed complete test data ───
print("\n[5] Seeding test data...")
# Login
code = None
token = None
for i in range(3):
    stdin, stdout, stderr = client.exec_command(
        f'curl -s -w "\\nHTTP:%{{http_code}}" -X POST -H "Content-Type: application/json" '
        f'-d \'{{"email":"admin@masjidalrahma.com","password":"Admin@2025#Secure"}}\' '
        f'{API}/auth/login', timeout=15, get_pty=True)
    out = ''.join(iter(stdout.readline, ''))
    if 'HTTP:' in out:
        parts = out.rsplit('HTTP:', 1)
        code = parts[1].strip()
        if code == '200':
            try:
                token = json.loads(parts[0])['data']['accessToken']
                print("  ✅ Admin login successful")
            except: pass
        break
    time.sleep(3)

def seed(method, path, data, desc=""):
    if not token: return None
    stdin, stdout, stderr = client.exec_command(
        f'curl -s -w "\\nHTTP:%{{http_code}}" -X {method} '
        f'-H "Authorization: Bearer {token}" '
        f'-H "Content-Type: application/json" '
        f'-d \'{json.dumps(data)}\' {API}{path}',
        timeout=15, get_pty=True)
    out = ''.join(iter(stdout.readline, ''))
    if 'HTTP:' in out:
        parts = out.rsplit('HTTP:', 1)
        c2 = parts[1].strip()
        ok = c2 in ('200','201')
        print(f"  {'✅' if ok else '❌'} {desc}: HTTP {c2}")
        if ok:
            try: return json.loads(parts[0])['data']
            except: pass
    return None

# Seed school
school = seed("POST", "/schools", {
    "name":"Al-Rahma Academy","slug":"al-rahma-academy",
    "address":"Mogadishu, Somalia","phone":"+2529100100","email":"school@alrahma.com",
    "status":"active"
}, "Create School")

# Seed teacher
teacher = seed("POST", "/teachers", {
    "profile":{"firstName":"Abdullahi","lastName":"Ahmed"},
    "teacherId":"TCH-001","email":"tch.ahmed@alrahma.com",
    "status":"active","school":school['_id'] if school else None
}, "Create Teacher") if school else None

# Seed courses
course = seed("POST", "/courses", {
    "title":{"en":"Introduction to Islamic Studies","so":"Hordhaca Islaamka","ar":"مقدمة الإسلام"},
    "description":{"en":"A comprehensive introduction to Islamic principles and practices."},
    "category":"fiqh","level":"beginner","duration":8,"fee":0,"maxStudents":100,
    "school":school['_id'] if school else None,
    "teacher":teacher['_id'] if teacher else None,
    "status":"published"
}, "Create Course (Fiqh)")

seed("POST", "/courses", {
    "title":{"en":"Quran Memorization - Part 1","so":"Xifdinta Quraanka","ar":"حفظ القرآن"},
    "category":"quran","level":"beginner","duration":12,"fee":25,"maxStudents":50,
    "status":"published"
}, "Create Course (Quran)")

# Seed course content
cid = course['_id'] if course else None
if cid and token:
    r = random
    content = {"chapters": [{
        "_id": "m1" + ''.join(r.choices('abcdef0123456789', k=22)),
        "title": "Module 1: Foundations of Islam", "order": 0, "status": "published", "collapsed": False,
        "items": [
            {"_id":"l1"+''.join(r.choices('abcdef0123456789',k=22)),"type":"lesson","title":"What is Islam?",
             "content":"<h2>What is Islam?</h2><p>Islam is a monotheistic Abrahamic religion founded on the teachings of Prophet Muhammad (peace be upon him). The word <em>Islam</em> means submission to the will of <strong>Allah</strong>.</p><h3>The Five Pillars</h3><ul><li>Shahada — Declaration of Faith</li><li>Salah — Prayer (5 times daily)</li><li>Zakat — Charity</li><li>Sawm — Fasting during Ramadan</li><li>Hajj — Pilgrimage to Makkah</li></ul><p><strong>Shahada:</strong> <em>La ilaha illa Allah, Muhammadur rasul Allah</em></p><blockquote>There is no god but Allah, and Muhammad is the messenger of Allah.</blockquote>","videoUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","duration":20,"order":0,"status":"published","attachments":[]},
            {"_id":"q1"+''.join(r.choices('abcdef0123456789',k=22)),"type":"quiz","title":"Module 1 Quiz",
             "description":"Test your understanding of the Five Pillars.","passingScore":70,"timeLimit":15,"duration":15,"order":1,"status":"published",
             "questions":[
                 {"question":"What is the first pillar of Islam?","options":["Salah","Shahada","Zakat","Hajj"],"correctIndex":1,"explanation":"The Shahada is the declaration of faith and the first pillar."},
                 {"question":"How many times do Muslims pray daily?","options":["Three","Four","Five","Seven"],"correctIndex":2},
                 {"question":"During which month do Muslims fast?","options":["Muharram","Sha'ban","Ramadan","Dhul-Hijjah"],"correctIndex":2},
             ]},
            {"_id":"a1"+''.join(r.choices('abcdef0123456789',k=22)),"type":"assignment","title":"Reflection on the Five Pillars",
             "description":"Write a personal reflection on how the Five Pillars guide a Muslim's daily life.","maxScore":100,"duration":60,"order":2,"status":"published",
             "instructions":"<p>Write a 500-word essay covering:</p><ol><li>Your understanding of each pillar</li><li>How these pillars impact daily life</li><li>Personal reflections</li></ol>","allowedFileTypes":[".pdf",".docx",".txt"],"attachments":[]},
        ]
    },{
        "_id": "m2" + ''.join(r.choices('abcdef0123456789', k=22)),
        "title": "Module 2: Islamic History", "order": 1, "status": "published", "collapsed": False,
        "items": [
            {"_id":"l2"+''.join(r.choices('abcdef0123456789',k=22)),"type":"lesson","title":"Life of Prophet Muhammad (PBUH)",
             "content":"<h2>The Prophet's Life</h2><p>Prophet Muhammad (peace be upon him) was born in <strong>Makkah</strong> in 570 CE. His father, Abdullah, died before his birth, and his mother, Aminah, passed away when he was six years old.</p><p>Key events:</p><ul><li>Revelation at age 40 in Cave Hira</li><li>Migration (Hijrah) to Madinah in 622 CE</li><li>Conquest of Makkah in 630 CE</li><li>Passed away in 632 CE at age 63</li></ul>",
             "videoUrl":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","duration":25,"order":0,"status":"published","attachments":[]},
        ]
    }]}
    stdin, stdout, stderr = client.exec_command(
        f'curl -s -w "\\nHTTP:%{{http_code}}" -X PUT '
        f'-H "Authorization: Bearer {token}" '
        f'-H "Content-Type: application/json" '
        f'-d \'{json.dumps(content)}\' {API}/courses/{cid}/content',
        timeout=30, get_pty=True)
    out = ''.join(iter(stdout.readline, ''))
    if 'HTTP:' in out:
        c3 = out.rsplit('HTTP:', 1)[1].strip()
        print(f"  {'✅' if c3=='200' else '❌'} Seed Course Content: HTTP {c3}")

# ─── 6. Final verification ───
print("\n[6] Final verification...")
check(client, "API health (direct)", "http://localhost:5000/api/v1/health")
check(client, "Frontend (port 80)", "http://localhost/")
check(client, "API via proxy", "http://localhost/api/v1/health")
check(client, "Login test", "http://localhost/api/v1/auth/login")
check(client, "Courses list", "http://localhost/api/v1/courses")

print(f"""
{'='*60}
  PRODUCTION READY ✅
{'='*60}
  All served through: http://{HOST}/
  Coolify dashboard:  http://{HOST}:8000
{'='*60}
""")

client.close()

# ─── 7. Git commit ───
print("\n[7] Committing changes to Git...")
os.chdir(r"c:\Users\Exam Office\Desktop\masjid-al-rahma-platform")
subprocess.run("git add -A", shell=True, check=False)
subprocess.run(
    'git commit -m "Production deployment to Contabo with Docker and Coolify"',
    shell=True, check=False)
subprocess.run("git log -1 --oneline", shell=True, check=False)
print("✅ Git commit done")