#!/usr/bin/env bash
# Lightweight deploy helper for Ubuntu 22.04
set -euo pipefail

APP_USER=aisha
APP_DIR=/home/$APP_USER/aishacrm
SERVICE_FILE=/etc/systemd/system/ai-sha-crm.service

echo "Ensure you run this script as root or with sudo"

# Create user if not exists
id -u $APP_USER >/dev/null 2>&1 || useradd -m -s /bin/bash $APP_USER
usermod -aG sudo $APP_USER || true

# Install packages
apt update
apt install -y curl git nginx build-essential ca-certificates ufw

# Install Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Clone repo
sudo -u $APP_USER mkdir -p $APP_DIR
sudo -u $APP_USER git clone https://github.com/andreibyf/aishacrm-2.git $APP_DIR || true

# Install backend deps
cd $APP_DIR/backend
sudo -u $APP_USER npm install

# Copy example .env if missing
if [ ! -f "$APP_DIR/backend/.env" ]; then
  cat > $APP_DIR/backend/.env <<'EOF'
PORT=3001
NODE_ENV=production
DATABASE_URL=postgresql://postgres:changeme@localhost:5432/postgres
ALLOWED_ORIGINS=https://your-frontend.example
EOF
  chown $APP_USER:$APP_USER $APP_DIR/backend/.env
  chmod 600 $APP_DIR/backend/.env
fi

# Run migrations and seed
sudo -u $APP_USER node scripts/run_migrations.js || true
sudo -u $APP_USER npm run seed || true

# Install systemd service
[Unit]
Description=ai-sha-crm Backend
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now ai-sha-crm.service || true

# Nginx config
cat > $NGINX_SITE <<EOF
server {
  listen 80;
  server_name _;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
EOF
ln -sf $NGINX_SITE /etc/nginx/sites-enabled/ai-sha-crm
systemctl restart nginx || true

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable || true

echo "Deploy complete. Edit $APP_DIR/backend/.env with production DATABASE_URL and secrets, then check systemctl status ai-sha-crm.service"