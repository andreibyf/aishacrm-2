#!/usr/bin/env bash
# setup-hp-omen.sh — one-shot setup for HP Omen AI Server
#
# Run as: aisha@ai-sha:~$ bash /path/to/setup-hp-omen.sh
#
# Installs:
#   - Node.js 22 (via NodeSource)
#   - PM2 (process manager for task workers)
#   - Redis 7 (task queue only — port 6381 externally)
#   - LiteLLM proxy (pip, alongside existing vLLM Python env)
#
# vLLM is already installed and managed by systemd — this script does NOT touch it.
#
# After running this script, see ecosystem.config.cjs for starting the workers.

set -euo pipefail

echo "======================================================"
echo " AiSHA HP Omen AI Server Setup"
echo " $(date)"
echo "======================================================"

# ── Node.js 22 ──────────────────────────────────────────────────────────────
echo ""
echo "→ Installing Node.js 22..."
if command -v node &>/dev/null && [[ "$(node --major-version 2>/dev/null || echo 0)" == "22" ]]; then
  echo "  Node.js $(node --version) already installed — skipping"
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  echo "  Node.js $(node --version) installed"
fi

# ── PM2 ─────────────────────────────────────────────────────────────────────
echo ""
echo "→ Installing PM2..."
if command -v pm2 &>/dev/null; then
  echo "  PM2 $(pm2 --version) already installed — skipping"
else
  sudo npm install -g pm2
  echo "  PM2 installed"
fi

# ── Redis (task queue only, port 6381 on host) ───────────────────────────────
echo ""
echo "→ Installing Redis..."
if command -v redis-server &>/dev/null; then
  echo "  Redis $(redis-server --version) already installed — skipping"
else
  sudo apt-get install -y redis-server
fi

# Configure Redis to listen on all interfaces (Tailscale provides network security)
# and use port 6381 to avoid conflicting with any other Redis on the machine.
REDIS_CONF=/etc/redis/redis.conf
if ! grep -q "^port 6381" "$REDIS_CONF"; then
  sudo sed -i 's/^port 6379/port 6381/' "$REDIS_CONF"
  echo "  Redis port set to 6381"
fi
if grep -q "^bind 127.0.0.1" "$REDIS_CONF"; then
  sudo sed -i 's/^bind 127.0.0.1.*/bind 0.0.0.0/' "$REDIS_CONF"
  echo "  Redis bind set to 0.0.0.0 (all interfaces)"
fi

sudo systemctl enable redis-server
sudo systemctl restart redis-server
sleep 1
redis-cli -p 6381 ping | grep -q PONG && echo "  Redis (port 6381): PONG ✓" || echo "  ⚠ Redis did not respond on port 6381"

# ── LiteLLM proxy ────────────────────────────────────────────────────────────
echo ""
echo "→ Installing LiteLLM proxy..."
if command -v litellm &>/dev/null; then
  echo "  LiteLLM $(litellm --version 2>/dev/null || echo '?') already installed — upgrading"
  pip install --upgrade 'litellm[proxy]' --quiet
else
  pip install 'litellm[proxy]' --quiet
  echo "  LiteLLM installed"
fi

# ── Worker deploy directory ───────────────────────────────────────────────────
echo ""
echo "→ Creating worker deploy directory..."
DEPLOY_DIR="$HOME/aisha-worker"
mkdir -p "$DEPLOY_DIR"
echo "  Worker files will be deployed to: $DEPLOY_DIR"
echo "  (populated by scripts/sync-workers-to-ai-server.ps1 from dev machine)"

# ── Log directory ─────────────────────────────────────────────────────────────
echo ""
echo "→ Creating log directory..."
sudo mkdir -p /var/log/aisha
sudo chown "$USER:$USER" /var/log/aisha
echo "  /var/log/aisha ready"

# ── Env file setup ───────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo " NEXT STEPS (manual)"
echo "======================================================"
echo ""
echo "1. From your Windows dev machine, deploy the worker files:"
echo "   .\\scripts\\sync-workers-to-ai-server.ps1"
echo "   (This rsyncs backend/workers, braid-llm-kit, shared, etc. to $DEPLOY_DIR)"
echo ""
echo "2. Create per-environment env files on HP Omen in $DEPLOY_DIR/backend/:"
echo "   - .env.dev      (dev Supabase URL + service role key)"
echo "   - .env.staging  (staging Supabase URL + service role key)"
echo "   - .env.prd      (prod Supabase URL + service role key)"
echo ""
echo "   Each file needs at minimum:"
echo "     APP_ENV=<dev|staging|prd>"
echo "     SUPABASE_URL=https://<project>.supabase.co"
echo "     SUPABASE_SERVICE_ROLE_KEY=<key>"
echo "     TASK_QUEUE_REDIS_URL=redis://localhost:6381"
echo "     LITELLM_ENABLED=true"
echo "     LITELLM_BASE_URL=http://localhost:4000"
echo "     LITELLM_MASTER_KEY=<same key as in Doppler>"
echo ""
echo "3. Start LiteLLM (points at localhost vLLM on port 8000):"
echo "   litellm --config $DEPLOY_DIR/braid-llm-kit/../litellm_config.yaml --port 4000 &"
echo "   # Or via PM2:"
echo "   pm2 start 'litellm --config /path/to/litellm_config.yaml --port 4000' --name litellm"
echo ""
echo "4. Start all three task workers via PM2:"
echo "   cd $DEPLOY_DIR"
echo "   pm2 start ecosystem.config.cjs"
echo "   pm2 save"
echo "   pm2 startup  # generates systemd unit for auto-start on reboot"
echo ""
echo "5. Update Doppler for each CRM environment:"
echo "   TASK_QUEUE_REDIS_URL=redis://100.81.132.118:6381"
echo "   LITELLM_BASE_URL=http://100.81.132.118:4000"
echo "   TASK_WORKERS_ENABLED=false"
echo "   APP_ENV=<dev|stg|prd>"
echo ""
echo "======================================================"
echo " Setup complete — $(date)"
echo "======================================================"
