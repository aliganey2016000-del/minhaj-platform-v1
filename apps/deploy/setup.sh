#!/bin/bash
# ───────────────────────────────────────────────────
#  Masjid Al-Rahma VPS Deployment Script
#  Ubuntu 24.04 LTS — Run as root: sudo bash setup.sh
# ───────────────────────────────────────────────────
set -e

echo "============================================"
echo " Masjid Al-Rahma — VPS Setup (Ubuntu 24.04)"
echo "============================================"

# ─────────────────────────────────────────────
#  1. System Updates
# ─────────────────────────────────────────────
echo "[1/8] Updating system packages..."
apt update -y && apt upgrade -y

# ─────────────────────────────────────────────
#  2. Install Node.js 22.x (LTS for Ubuntu 24.04)
# ─────────────────────────────────────────────
echo "[2/8] Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
echo "Node.js $(node -v) installed"
echo "npm $(npm -v) installed"

# ─────────────────────────────────────────────
#  3. Install & Configure MongoDB 8.0 (Ubuntu 24.04)
# ─────────────────────────────────────────────
echo "[3/8] Installing MongoDB 8.0..."
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-8.0.list
apt update -y
apt install -y mongodb-org

# Start MongoDB
systemctl enable mongod
systemctl start mongod

# Wait for MongoDB to be ready
sleep 5

# Create admin user
echo "Creating MongoDB admin user..."
mongosh --quiet --eval '
  use masjid-al-rahma;
  db.createUser({
    user: "masjid_admin",
    pwd: "RahmaDB2026Secure!",
    roles: [{ role: "readWrite", db: "masjid-al-rahma" }]
  });
' 2>/dev/null || echo "User may already exist"

# Enable authentication
if ! grep -q "authorization: enabled" /etc/mongod.conf; then
  sed -i 's/#security:/security:\n  authorization: enabled/' /etc/mongod.conf
  systemctl restart mongod
  echo "MongoDB authentication enabled"
fi

# ─────────────────────────────────────────────
#  4. Install PM2
# ─────────────────────────────────────────────
echo "[4/8] Installing PM2..."
npm install -g pm2

# ─────────────────────────────────────────────
#  5. Install Nginx
# ─────────────────────────────────────────────
echo "[5/8] Installing Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# ─────────────────────────────────────────────
#  6. Create Directory Structure
# ─────────────────────────────────────────────
echo "[6/8] Creating directory structure..."
mkdir -p /var/www/masjid-al-rahma/backend
mkdir -p /var/www/masjid-al-rahma/frontend/dist
mkdir -p /var/log/masjid-al-rahma

# ─────────────────────────────────────────────
#  7. Configure Firewall
# ─────────────────────────────────────────────
echo "[7/8] Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

# ─────────────────────────────────────────────
#  8. Set Up Nginx Site
# ─────────────────────────────────────────────
echo "[8/8] Setting up Nginx site..."
cp /var/www/masjid-al-rahma/deploy/nginx.conf /etc/nginx/sites-available/masjid-al-rahma
ln -sf /etc/nginx/sites-available/masjid-al-rahma /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "============================================"
echo " ✅ VPS Setup Complete!"
echo "============================================"
echo ""
echo "Now building & deploying application..."
echo ""