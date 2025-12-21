#!/bin/bash
# Emergency IP Unblock + v1.0.17 Deployment Script
# Run this on VPS via SSH: ssh andreibyf@147.189.173.237
# Then: cd /opt/aishacrm && bash emergency-recovery.sh

set -e  # Exit on error

echo "=========================================="
echo "🚨 AISHA CRM EMERGENCY RECOVERY v1.0.17"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${RED}ERROR: docker-compose.prod.yml not found!${NC}"
    echo "Please run this script from /opt/aishacrm"
    exit 1
fi

echo -e "${YELLOW}Step 1: Clear all IP blocks${NC}"
echo "This will unblock ALL IPs from Redis and restart backend..."
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Clear Redis IP blocks
echo "Clearing IP blocks from Redis..."
docker exec aishacrm-redis-memory redis-cli --scan --pattern "idr:blocked:*" | \
    xargs -I {} docker exec aishacrm-redis-memory redis-cli DEL {} 2>/dev/null || true

# Restart backend to clear in-memory blocks
echo "Restarting backend container..."
docker restart aishacrm-backend

echo -e "${GREEN}✓ All IP blocks cleared!${NC}"
echo "Waiting 10 seconds for backend to restart..."
sleep 10

# Test backend health
echo "Testing backend health..."
if curl -s http://localhost:4001/health > /dev/null; then
    echo -e "${GREEN}✓ Backend is healthy!${NC}"
else
    echo -e "${RED}WARNING: Backend health check failed${NC}"
    echo "Check logs: docker logs aishacrm-backend"
fi

echo ""
echo -e "${YELLOW}Step 2: Configure IP Whitelist${NC}"
echo "To prevent future lockouts, you need to whitelist your admin IP(s)."
echo ""
echo -e "Your current VPS IP: ${GREEN}147.189.173.237${NC}"
echo "Find your external IP at: https://api.ipify.org"
echo ""
read -p "Enter IP(s) to whitelist (comma-separated, no spaces): " WHITELIST_IPS

if [ -z "$WHITELIST_IPS" ]; then
    echo -e "${YELLOW}WARNING: No IPs whitelisted. You may get blocked again!${NC}"
    read -p "Continue without whitelist? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Restart with whitelist IPs."
        exit 1
    fi
fi

echo ""
echo -e "${YELLOW}Step 3: Generate Emergency Secret${NC}"
echo "This allows unblocking IPs via API without authentication."
echo "Generating secure secret..."

EMERGENCY_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo -e "Generated secret: ${GREEN}$EMERGENCY_SECRET${NC}"
echo -e "${RED}SAVE THIS SECRET SECURELY!${NC}"
echo ""

echo ""
echo -e "${YELLOW}Step 4: Backup docker-compose.prod.yml${NC}"
cp docker-compose.prod.yml docker-compose.prod.yml.backup.$(date +%Y%m%d_%H%M%S)
echo -e "${GREEN}✓ Backup created${NC}"

echo ""
echo -e "${YELLOW}Step 5: Update docker-compose.prod.yml${NC}"
echo "Adding IDR configuration to backend environment..."

# Check if IDR_WHITELIST_IPS already exists
if grep -q "IDR_WHITELIST_IPS" docker-compose.prod.yml; then
    echo -e "${YELLOW}IDR_WHITELIST_IPS already exists, updating...${NC}"
    sed -i "s/- IDR_WHITELIST_IPS=.*/- IDR_WHITELIST_IPS=$WHITELIST_IPS/" docker-compose.prod.yml
else
    # Add IDR_WHITELIST_IPS after NODE_ENV line
    sed -i "/- NODE_ENV=/a\\      - IDR_WHITELIST_IPS=$WHITELIST_IPS" docker-compose.prod.yml
    echo -e "${GREEN}✓ Added IDR_WHITELIST_IPS${NC}"
fi

# Check if IDR_EMERGENCY_SECRET already exists
if grep -q "IDR_EMERGENCY_SECRET" docker-compose.prod.yml; then
    echo -e "${YELLOW}IDR_EMERGENCY_SECRET already exists, updating...${NC}"
    sed -i "s/- IDR_EMERGENCY_SECRET=.*/- IDR_EMERGENCY_SECRET=$EMERGENCY_SECRET/" docker-compose.prod.yml
else
    # Add IDR_EMERGENCY_SECRET after IDR_WHITELIST_IPS
    sed -i "/- IDR_EMERGENCY_SECRET=/a\\      - IDR_EMERGENCY_SECRET=$EMERGENCY_SECRET" docker-compose.prod.yml
    echo -e "${GREEN}✓ Added IDR_EMERGENCY_SECRET${NC}"
fi

echo ""
echo -e "${YELLOW}Step 6: Update to v1.0.17${NC}"
echo "Updating image tags in docker-compose.prod.yml..."
sed -i 's/ghcr.io\/andreibyf\/aishacrm-2-frontend:.*/ghcr.io\/andreibyf\/aishacrm-2-frontend:v1.0.17/' docker-compose.prod.yml
sed -i 's/ghcr.io\/andreibyf\/aishacrm-2-backend:.*/ghcr.io\/andreibyf\/aishacrm-2-backend:v1.0.17/' docker-compose.prod.yml

echo ""
echo -e "${YELLOW}Step 7: Deploy v1.0.17${NC}"
echo "This will pull new Docker images from GHCR and restart containers..."
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "Waiting 15 seconds for services to start..."
sleep 15

# Final health check
echo ""
echo -e "${YELLOW}Step 8: Health Check${NC}"
if curl -s http://localhost:4001/health > /dev/null; then
    echo -e "${GREEN}✓ Backend is healthy!${NC}"
else
    echo -e "${RED}ERROR: Backend health check failed${NC}"
    echo "Check logs: docker logs aishacrm-backend"
    exit 1
fi

if curl -s http://localhost:4000 > /dev/null; then
    echo -e "${GREEN}✓ Frontend is healthy!${NC}"
else
    echo -e "${RED}WARNING: Frontend health check failed${NC}"
    echo "Check logs: docker logs aishacrm-frontend"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}🎉 EMERGENCY RECOVERY COMPLETE!${NC}"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✓ All IP blocks cleared"
echo "  ✓ Backend restarted"
echo "  ✓ IP whitelist configured: $WHITELIST_IPS"
echo "  ✓ Emergency secret generated"
echo "  ✓ Deployed v1.0.17"
echo ""
echo -e "${YELLOW}IMPORTANT:${NC}"
echo "  1. Save your emergency secret: $EMERGENCY_SECRET"
echo "  2. Test login at: https://app.aishacrm.com"
echo "  3. Check Security Monitor at: /settings → Security tab"
echo "  4. Verify your IP is whitelisted in UI"
echo ""
echo "Emergency unblock API usage:"
echo "  curl -X POST https://app.aishacrm.com/api/security/emergency-unblock \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"secret\":\"$EMERGENCY_SECRET\",\"ip\":\"YOUR_IP\"}'"
echo ""
echo "Container logs:"
echo "  docker logs -f aishacrm-backend"
echo "  docker logs -f aishacrm-frontend"
echo ""
echo "If issues persist, see: EMERGENCY_UNBLOCK_GUIDE.md"
echo "=========================================="
