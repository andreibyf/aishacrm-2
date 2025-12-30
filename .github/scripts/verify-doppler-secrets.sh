#!/bin/bash
# Doppler Secrets Verification Script
# This script verifies that all required secrets for docker-release.yml are available in Doppler
# 
# Usage:
#   DOPPLER_TOKEN=<token> DOPPLER_PROJECT=<project> DOPPLER_CONFIG=<config> ./verify-doppler-secrets.sh
#
# Or if you have doppler CLI configured:
#   ./verify-doppler-secrets.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Required secrets for docker-release.yml workflow
REQUIRED_SECRETS=(
  "ADMIN_EMAILS"
  "PROD_VPS_HOST"
  "PROD_VPS_USER"
  "PROD_VPS_SSH_KEY"
  "PROD_VPS_PORT"
  "PROD_MCP_GITHUB_TOKEN"
)

echo "=============================================="
echo "Doppler Secrets Verification"
echo "=============================================="
echo ""

# Check if doppler CLI is installed
if ! command -v doppler &> /dev/null; then
  echo -e "${RED}✗ Doppler CLI not found${NC}"
  echo "  Install it from: https://docs.doppler.com/docs/install-cli"
  exit 1
fi

echo -e "${GREEN}✓ Doppler CLI found${NC}"
echo ""

# Check environment configuration
if [ -n "$DOPPLER_PROJECT" ] && [ -n "$DOPPLER_CONFIG" ]; then
  echo "Using environment configuration:"
  echo "  Project: $DOPPLER_PROJECT"
  echo "  Config: $DOPPLER_CONFIG"
else
  echo "Using local doppler.yaml configuration"
fi
echo ""

# Verify each secret
MISSING_SECRETS=()
FOUND_SECRETS=()

echo "Checking required secrets..."
echo ""

for secret in "${REQUIRED_SECRETS[@]}"; do
  if doppler secrets get "$secret" --plain > /dev/null 2>&1; then
    # Get value to check if it's non-empty (without revealing the actual value)
    value=$(doppler secrets get "$secret" --plain)
    if [ -n "$value" ]; then
      echo -e "${GREEN}✓${NC} $secret (present, non-empty)"
      FOUND_SECRETS+=("$secret")
    else
      echo -e "${YELLOW}⚠${NC} $secret (present but empty)"
      MISSING_SECRETS+=("$secret")
    fi
  else
    echo -e "${RED}✗${NC} $secret (NOT FOUND)"
    MISSING_SECRETS+=("$secret")
  fi
done

echo ""
echo "=============================================="
echo "Summary"
echo "=============================================="
echo -e "Found: ${GREEN}${#FOUND_SECRETS[@]}${NC} / ${#REQUIRED_SECRETS[@]}"
echo -e "Missing/Empty: ${RED}${#MISSING_SECRETS[@]}${NC} / ${#REQUIRED_SECRETS[@]}"
echo ""

if [ ${#MISSING_SECRETS[@]} -eq 0 ]; then
  echo -e "${GREEN}✓ All required secrets are present in Doppler!${NC}"
  echo ""
  echo "The docker-release.yml workflow should work correctly."
  exit 0
else
  echo -e "${RED}✗ Missing or empty secrets:${NC}"
  for secret in "${MISSING_SECRETS[@]}"; do
    echo "  - $secret"
  done
  echo ""
  echo "Please add these secrets to Doppler before running the workflow."
  echo "Reference: .github/SECRETS.md for secret descriptions"
  exit 1
fi
