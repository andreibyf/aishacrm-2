#!/usr/bin/env bash

set -Eeuo pipefail

# Non-interactive OpenReplay installer wrapper for CI/CD.
# Runs on the target Linux host over SSH.

if [[ "${EUID}" -eq 0 ]]; then
  echo "Do not run as root. Run as a sudo-capable user."
  exit 1
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1"
    exit 1
  }
}

info() {
  printf '[openreplay-install] %s\n' "$*"
}

# Required inputs
: "${OPENREPLAY_DOMAIN:?OPENREPLAY_DOMAIN is required (for example replay.example.com)}"
: "${OPENREPLAY_INSTALL_DIR:=/opt/openreplay}"
: "${OPENREPLAY_REPO:=https://github.com/openreplay/openreplay}"
: "${OPENREPLAY_BRANCH:=main}"
: "${OPENREPLAY_DNS_PUBLIC:=y}"

require_cmd git
require_cmd bash
require_cmd sudo

# Ensure docker exists; installer handles daemon readiness checks.
if ! command -v docker >/dev/null 2>&1; then
  info "Docker not found. Installing Docker prerequisites..."
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg lsb-release
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER" || true
fi

# Fresh clone to avoid stale generated compose/envs.
if [[ -d "${OPENREPLAY_INSTALL_DIR}" ]]; then
  info "Removing previous install directory: ${OPENREPLAY_INSTALL_DIR}"
  sudo rm -rf "${OPENREPLAY_INSTALL_DIR}"
fi

info "Cloning OpenReplay repository"
sudo mkdir -p "${OPENREPLAY_INSTALL_DIR}"
sudo chown "$USER":"$USER" "${OPENREPLAY_INSTALL_DIR}"
git clone --depth 1 --branch "${OPENREPLAY_BRANCH}" "${OPENREPLAY_REPO}" "${OPENREPLAY_INSTALL_DIR}"

cd "${OPENREPLAY_INSTALL_DIR}/scripts/docker-compose"

# Install script is interactive; feed domain and DNS mode deterministically.
info "Running OpenReplay docker-compose installer"
printf '%s\n%s\n' "${OPENREPLAY_DOMAIN}" "${OPENREPLAY_DNS_PUBLIC}" | bash install.sh

if [[ ! -f "${OPENREPLAY_INSTALL_DIR}/scripts/docker-compose/common.env" ]]; then
  echo "OpenReplay install failed: common.env was not generated"
  exit 1
fi

info "OpenReplay installed successfully"
info "Dashboard URL: https://${OPENREPLAY_DOMAIN}"
