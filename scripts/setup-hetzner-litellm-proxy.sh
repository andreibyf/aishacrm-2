#!/usr/bin/env bash
# setup-hetzner-litellm-proxy.sh
#
# Installs a systemd service on Hetzner (prod) that proxies TCP port 4002 on
# the host (Tailscale interface 100.105.182.29) to the prod LiteLLM container
# at its internal IP on the `aishanet` Docker network.
#
# HP Omen worker-prd uses http://100.105.182.29:4002 as LITELLM_BASE_URL.
#
# The prod LiteLLM container is Coolify-managed (name auto-derived from app
# UUID) — this script discovers the container dynamically via docker network
# inspect rather than relying on a hard-coded name.
#
# Run from Hetzner as root:
#   ssh root@100.105.182.29 < scripts/setup-hetzner-litellm-proxy.sh
# Or copy first:
#   scp scripts/setup-hetzner-litellm-proxy.sh root@100.105.182.29:/tmp/
#   ssh root@100.105.182.29 bash /tmp/setup-hetzner-litellm-proxy.sh

set -euo pipefail

DOCKER_NETWORK="aishanet"
PROXY_PORT=4002
TARGET_PORT=4000

echo "→ Installing socat..."
apt-get install -y socat -qq

echo "→ Discovering LiteLLM container on network ${DOCKER_NETWORK}..."
# Find the container running on port 4000 in the aishanet network.
# Coolify generates names like litellm-<uuid>-<suffix> so we match by image/name.
CONTAINER_ID=$(docker ps --format '{{.ID}} {{.Names}} {{.Image}}' \
  | grep -i litellm \
  | awk '{print $1}' \
  | head -1)

if [ -z "$CONTAINER_ID" ]; then
  echo "ERROR: no running litellm container found. Is it deployed?" >&2
  docker ps
  exit 1
fi

CONTAINER_NAME=$(docker inspect "$CONTAINER_ID" --format '{{.Name}}' | sed 's|^/||')
CONTAINER_IP=$(docker inspect "$CONTAINER_ID" \
  --format "{{(index .NetworkSettings.Networks \"${DOCKER_NETWORK}\").IPAddress}}" 2>/dev/null)

echo "  Container : ${CONTAINER_NAME}"
echo "  IP on ${DOCKER_NETWORK}: ${CONTAINER_IP}"

if [ -z "$CONTAINER_IP" ]; then
  echo "ERROR: container ${CONTAINER_NAME} is not attached to network ${DOCKER_NETWORK}" >&2
  docker inspect "$CONTAINER_ID" --format '{{range $k,$v := .NetworkSettings.Networks}}  {{$k}}: {{$v.IPAddress}}{{"\n"}}{{end}}'
  exit 1
fi

echo "→ Writing /opt/litellm-proxy.sh..."
cat > /opt/litellm-proxy.sh << SCRIPT
#!/usr/bin/env bash
# Dynamically resolve prod LiteLLM container IP at start time.
# Re-run setup script or restart this service if container is recreated.
set -euo pipefail

NETWORK="${DOCKER_NETWORK}"

CONTAINER_ID=\$(docker ps --format '{{.ID}} {{.Names}} {{.Image}}' \\
  | grep -i litellm | awk '{print \$1}' | head -1)

if [ -z "\$CONTAINER_ID" ]; then
  echo "ERROR: no running litellm container found" >&2
  exit 1
fi

CONTAINER_IP=\$(docker inspect "\$CONTAINER_ID" \\
  --format "{{(index .NetworkSettings.Networks \"\$NETWORK\").IPAddress}}" 2>/dev/null)

if [ -z "\$CONTAINER_IP" ]; then
  echo "ERROR: could not resolve LiteLLM IP on network \$NETWORK" >&2
  exit 1
fi

echo "Proxying 0.0.0.0:${PROXY_PORT} -> \$CONTAINER_IP:${TARGET_PORT}"
exec socat TCP-LISTEN:${PROXY_PORT},bind=0.0.0.0,reuseaddr,fork "TCP:\$CONTAINER_IP:${TARGET_PORT}"
SCRIPT

chmod +x /opt/litellm-proxy.sh

echo "→ Writing systemd service..."
cat > /etc/systemd/system/litellm-proxy.service << UNIT
[Unit]
Description=LiteLLM Tailscale Port Proxy (4002 -> prod container 4000)
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
systemctl daemon-reload
systemctl enable litellm-proxy
systemctl restart litellm-proxy
sleep 2

echo "→ Status:"
systemctl status litellm-proxy --no-pager -l

echo "→ Verify port 4002 is listening:"
ss -lntp | grep 4002 || echo "NOT LISTENING — check: journalctl -u litellm-proxy -n 30"

echo ""
echo "→ Test from HP Omen (Tailscale 100.81.132.118):"
echo "   curl http://100.105.182.29:4002/health/readiness"
echo ""
echo "Done."
