#!/usr/bin/env python3
"""Quick fix: move scattered dist files into correct folder and rebuild."""
import os
import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('158.220.120.83', username='root', password=os.environ["VPS_PASS"], timeout=30)

# Step 1: Find where the files went and fix
cmds = [
    # Move any assets/js/css files from frontend/ into dist/ (they were extracted flat)
    'cd /var/www/masjid-al-rahma/frontend && mkdir -p dist/assets',
    'cd /var/www/masjid-al-rahma/frontend && for f in *.js *.css *.html *.svg *.png *.ico 2>/dev/null; do [ -f "$f" ] && mv "$f" dist/ 2>/dev/null; done; echo "moved root files"',
    'cd /var/www/masjid-al-rahma/frontend && [ -d assets ] && mv assets/* dist/assets/ 2>/dev/null; rm -rf assets; echo "moved assets"',
    'ls -la /var/www/masjid-al-rahma/frontend/dist/ | head -10',
    'ls /var/www/masjid-al-rahma/frontend/dist/index.html && echo "index.html found" || echo "STILL MISSING"',
]
for cmd in cmds:
    stdin, stdout, stderr = c.exec_command(cmd, timeout=15)
    print(stdout.read().decode().strip() or stderr.read().decode().strip()[:100])

# Step 2: Also try the proper approach — re-upload with correct path
# Actually the issue was the tar extraction. Let me just upload directly
import os, io

# Instead of tar, let me use sftp to upload the dist folder recursively
dist_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
if os.path.exists(dist_path):
    sftp = c.open_sftp()
    
    # Create remote directory structure
    stdin, stdout, stderr = c.exec_command('rm -rf /var/www/masjid-al-rahma/frontend/dist && mkdir -p /var/www/masjid-al-rahma/frontend/dist/assets', timeout=10)
    stdout.read()
    
    for root, dirs, files in os.walk(dist_path):
        rel_root = os.path.relpath(root, dist_path)
        remote_root = f'/var/www/masjid-al-rahma/frontend/dist/{rel_root}' if rel_root != '.' else '/var/www/masjid-al-rahma/frontend/dist'
        
        # Create remote dirs
        for d in dirs:
            try:
                sftp.mkdir(f'{remote_root}/{d}')
            except:
                pass
        
        # Upload files
        for f in files:
            local = os.path.join(root, f)
            remote = f'{remote_root}/{f}'
            try:
                sftp.put(local, remote)
            except Exception as e:
                print(f'Failed: {f} -> {e}')
    
    sftp.close()
    print(f'Uploaded {dist_path} via SFTP')

# Step 3: Verify
stdin, stdout, stderr = c.exec_command('ls -la /var/www/masjid-al-rahma/frontend/dist/ | head -10; ls /var/www/masjid-al-rahma/frontend/dist/index.html && echo "INDEX_OK"', timeout=10)
print('\n--- Dist folder ---')
print(stdout.read().decode().strip())

# Step 4: Rebuild Docker
print('\n=== Rebuilding Docker ===')
stdin, stdout, stderr = c.exec_command('cd /var/www/masjid-al-rahma && docker compose -f docker-compose.prod.yml build --no-cache frontend 2>&1', timeout=180, get_pty=True)
output = stdout.read().decode().strip()
# Show last lines
for line in output.split('\n')[-10:]:
    print(line)

# Step 5: Restart
print('\n=== Restarting frontend ===')
stdin, stdout, stderr = c.exec_command('cd /var/www/masjid-al-rahma && docker compose -f docker-compose.prod.yml up -d --force-recreate frontend 2>&1', timeout=60)
print(stdout.read().decode().strip())

time.sleep(15)

# Step 6: Verify
stdin, stdout, stderr = c.exec_command('curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost/', timeout=20)
code = stdout.read().decode().strip()
print(f'\nHTTP code: {code}')

stdin, stdout, stderr = c.exec_command('curl -s --max-time 10 http://localhost/ 2>&1 | head -10', timeout=20)
html = stdout.read().decode().strip()
print(f'HTML preview: {html[:200]}')

c.close()
print('\nDone!')