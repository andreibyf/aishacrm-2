#!/bin/bash
# Setup script for Dashboard Cache Warming
# Enables the warmDashboardBundleCache cron job

echo "🔥 Setting up Dashboard Cache Warming..."
echo ""

# Check if we're in the right directory
if [ ! -f "backend/scripts/seed-cron-jobs.js" ]; then
  echo "❌ Error: Please run this script from the project root directory"
  exit 1
fi

echo "📝 Running cron job seeder..."
cd backend
doppler run -- node scripts/seed-cron-jobs.js

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Cache warming cron job enabled!"
  echo ""
  echo "📅 Job Details:"
  echo "   • Name: Warm Dashboard Bundle Cache"
  echo "   • Schedule: Daily at midnight UTC"
  echo "   • Function: warmDashboardBundleCache"
  echo "   • Purpose: Pre-populate redis-cache for all tenants"
  echo ""
  echo "🔍 To verify the job was created:"
  echo "   docker exec aishacrm-db psql -U postgres -d aishacrm -c \\"
  echo "     'SELECT id, name, schedule, is_active, next_run FROM cron_job WHERE function_name = \\'warmDashboardBundleCache\\';'"
  echo ""
  echo "⏰ To manually trigger the cache warming (for testing):"
  echo "   curl -X POST http://localhost:4001/api/cron/execute \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -H 'Authorization: Bearer YOUR_JWT' \\"
  echo "     -d '{\"function_name\": \"warmDashboardBundleCache\"}'"
  echo ""
  echo "📊 To monitor dashboard performance:"
  echo "   • Open Dashboard at http://localhost:4000/dashboard"
  echo "   • Check browser console for '[dashboard-bundle] Cache HIT/MISS' logs"
  echo ""
else
  echo "❌ Failed to enable cache warming job"
  exit 1
fi
