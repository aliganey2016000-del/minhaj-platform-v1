# Masjid Al-Rahma — VPS Deployment Guide

## Prerequisites  
Both apps are already built locally:
- `backend/dist/` — compiled TypeScript
- `frontend/dist/` — Vite production build

---

## Step 1: Upload Files to VPS

Open PowerShell/CMD and run one line at a time. Enter password `635110Liiali@` when prompted:

```bash
scp -r backend\dist backend\package.json backend\package-lock.json backend\.env.production root@152.239.119.129:/root/
```

```bash
scp -r frontend\dist root@152.239.119.129:/root/frontend-dist/
```

```bash
scp -r deploy\nginx.conf deploy\ecosystem.config.js deploy\setup.sh root@152.239.119.129:/root/
```

---

## Step 2: SSH into VPS

```bash
ssh root@152.239.119.129
```
Password: `635110Liiali@`

---

## Step 3: Run Setup Script (install all dependencies)

```bash
mv /root/setup.sh /tmp/setup.sh
bash /tmp/setup.sh
```

This installs Node.js 22, MongoDB 8.0, Nginx, PM2, creates directories, configures firewall.

---

## Step 4: Move Files to Correct Locations

```bash
# Backend
mkdir -p /var/www/masjid-al-rahma/backend
cp /root/.env.production /var/www/masjid-al-rahma/backend/
cp /root/package.json /root/package-lock.json /var/www/masjid-al-rahma/backend/
cp -r /root/dist /var/www/masjid-al-rahma/backend/

# Frontend
mkdir -p /var/www/masjid-al-rahma/frontend
cp -r /root/frontend-dist/* /var/www/masjid-al-rahma/frontend/dist/

# Deploy configs
mkdir -p /var/www/masjid-al-rahma/deploy
cp /root/nginx.conf /root/ecosystem.config.js /var/www/masjid-al-rahma/deploy/
```

---

## Step 5: Install Backend Dependencies & Build

```bash
cd /var/www/masjid-al-rahma/backend
npm install --omit=dev
```

---

## Step 6: Configure Nginx

```bash
cp /var/www/masjid-al-rahma/deploy/nginx.conf /etc/nginx/sites-available/masjid-al-rahma
ln -sf /etc/nginx/sites-available/masjid-al-rahma /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

---

## Step 7: Start Backend with PM2

```bash
cd /var/www/masjid-al-rahma
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup
```

Run the command PM2 outputs for startup.

---

## Step 8: Verify

```bash
# Check PM2 status
pm2 status

# Check MongoDB
mongosh --eval "db.version()"

# Check Nginx
curl http://localhost/api/v1/health

# Check frontend
curl http://localhost/
```

Visit `http://152.239.119.129` in your browser.

---

## Step 9: Setup HTTPS (if you have a domain)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

---

## Troubleshooting

```bash
# View backend logs
pm2 logs masjid-al-rahma-api

# Restart backend
pm2 restart masjid-al-rahma-api

# Check MongoDB status
systemctl status mongod

# Check Nginx error logs
tail -f /var/log/nginx/error.log

# Test API directly
curl http://localhost:5000/api/v1/health