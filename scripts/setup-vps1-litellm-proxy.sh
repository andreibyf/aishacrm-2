#!/usr/bin/env bash
# setup-vps1-litellm-proxy.sh
#
# Installs a systemd service on VPS-1 that proxies TCP port 4002 on the host
# (Tailscale interface 100.78.61.119) to the staging LiteLLM container at
# its internal docker network IP (aishacrm_aishanet-staging).
#
# HP Omen worker-staging uses http://100.78.61.119:4002 as LITELLM_BASE_URL.
#
# Run from VPS-1 as andreibyf (has NOPASSWD sudo via coolify_key setup).
# Or pipe via: ssh andreibyf@147.189.173.237 < scripts/setup-vps1-litellm-proxy.sh

set -euo pipefail

CONTAINER_NAME="litellm-zsy5fsbw9hccxvoznkbpy1il-233653629634"
DOCKER_NETWORK="aishacrm_aishanet-staging"
PROXY_PORT=4002
TARGET_PORT=4000

echo "→ Installing socat..."
sudo apt-get install -y socat -qq

echo "→ Writing /opt/litellm-proxy.sh..."
sudo tee /opt/litellm-proxy.sh > /dev/null << SCRIPT
#!/usr/bin/env bash
# Dynamically resolve LiteLLM container IP at start time.
# If container is recreated with a new IP, restart this service.
set -euo pipefail

CONTAINER="${CONTAINER_NAME}"
NETWORK="${DOCKER_NETWORK}"

CONTAINER_IP=\$(docker inspect "\$CONTAINER" \\
  --format "{{(index .NetworkSettings.Networks \"${DOCKER_NETWORK}\").IPAddress}}" 2>/dev/null)

if [ -z "\$CONTAINER_IP" ]; then
  echo "ERROR: could not resolve IP for \$CONTAINER on network \$NETWORK" >&2
  exit 1
fi

echo "Proxying 0.0.0.0:${PROXY_PORT} → \$CONTAINER_IP:${TARGET_PORT}"
exec socat TCP-LISTEN:${PROXY_PORT},bind=0.0.0.0,reuseaddr,fork "TCP:\$CONTAINER_IP:${TARGET_PORT}"
SCRIPT

sudo chmod +x /opt/litellm-proxy.sh

echo "→ Writing systemd service..."
sudo tee /etc/systemd/system/litellm-proxy.service > /dev/null << UNIT
[Unit]
Description=LiteLLM Tailscale Port Proxy (4002 -> staging container 4000)
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/opt/litellm-proxy.sh
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

echo "→ Enabling and starting litellm-proxy..."
sudo systemctl daemon-reload
sudo systemctl enable litellm-proxy
sudo systemctl restart litellm-proxy
sleep 2

echo "→ Status:"
sudo systemctl status litellm-proxy --no-pager -l

echo "→ Verify port 4002 is listening:"
ss -lntp | grep 4002 || echo "NOT LISTENING — check journalctl -u litellm-proxy"

echo "Done."
