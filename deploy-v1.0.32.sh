#!/bin/bash
# Deploy v1.0.32 to production VPS

echo "Deploying v1.0.32 to production..."

ssh andreibyf@147.189.173.237 << 'ENDSSH'
echo "Fixing ownership of /opt/aishacrm..."
sudo chown -R andreibyf:andreibyf /opt/aishacrm
echo ""
cd /opt/aishacrm
echo "Updating docker-compose.prod.yml to v1.0.32..."
# Update previous version occurrences (1.0.31 or earlier) to 1.0.32
sed -i 's/v1\.0\.31/v1.0.32/g' docker-compose.prod.yml
sed -i 's/v1\.0\.30/v1.0.32/g' docker-compose.prod.yml
sed -i 's/v1\.0\.29/v1.0.32/g' docker-compose.prod.yml
echo ""
echo "Pulling new images..."
sudo docker compose -f docker-compose.prod.yml pull
echo ""
echo "Restarting containers..."
sudo docker compose -f docker-compose.prod.yml down
sudo docker compose -f docker-compose.prod.yml up -d
echo ""
echo "Verifying containers are running..."
docker ps | grep aishacrm
echo ""
echo "Deployment complete! Frontend with HTTPS backend URL is now live."
ENDSSH

echo ""
echo "Deployment complete! Test login at: https://app.aishacrm.com"
