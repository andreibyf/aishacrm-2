#!/bin/bash

# Dashboard Performance Diagnostic
BASE_URL="http://localhost:4001/api"
TENANT_ID="6cb4c008-4847-426a-9a2e-918ad70e7b69"

echo "================================================"
echo "📊 DASHBOARD PERFORMANCE DIAGNOSTIC"
echo "================================================"
echo ""

# Test 1: Dashboard bundle endpoint
echo "TEST 1: Dashboard Bundle (combined stats + lists)"
echo "=================================================="
echo "First load (cold):"
time curl -s "$BASE_URL/reports/dashboard-bundle?tenant_id=$TENANT_ID" \
  -H "Accept: application/json" > /tmp/dashboard1.json 2>&1

STATS1=$(cat /tmp/dashboard1.json | jq '.data.stats' 2>/dev/null | head -10)
echo "Stats received: $(echo "$STATS1" | jq 'keys | length') fields"
echo ""

echo "Second load (should be cached):"
time curl -s "$BASE_URL/reports/dashboard-bundle?tenant_id=$TENANT_ID" \
  -H "Accept: application/json" > /tmp/dashboard2.json 2>&1
echo ""

# Test 2: Individual endpoints
echo "TEST 2: Individual List Endpoints (what Dashboard falls back to)"
echo "=============================================================="
echo ""

echo "2a. Leads List:"
time curl -s "$BASE_URL/v2/leads?tenant_id=$TENANT_ID&limit=50" > /dev/null 2>&1
echo ""

echo "2b. Contacts List:"
time curl -s "$BASE_URL/v2/contacts?tenant_id=$TENANT_ID&limit=50" > /dev/null 2>&1
echo ""

echo "2c. Opportunities List:"
time curl -s "$BASE_URL/v2/opportunities?tenant_id=$TENANT_ID&limit=50" > /dev/null 2>&1
echo ""

echo "2d. Activities List:"
time curl -s "$BASE_URL/v2/activities?tenant_id=$TENANT_ID&limit=50" > /dev/null 2>&1
echo ""

# Test 3: Combined parallel load (what frontend does)
echo "TEST 3: Simulating Frontend Dashboard Load (all 4 in parallel)"
echo "=============================================================="
(
  curl -s "$BASE_URL/v2/leads?tenant_id=$TENANT_ID&limit=50" > /dev/null &
  curl -s "$BASE_URL/v2/contacts?tenant_id=$TENANT_ID&limit=50" > /dev/null &
  curl -s "$BASE_URL/v2/opportunities?tenant_id=$TENANT_ID&limit=50" > /dev/null &
  curl -s "$BASE_URL/v2/activities?tenant_id=$TENANT_ID&limit=50" > /dev/null &
  wait
) &
PARALLEL_START=$(date +%s%N)
wait
PARALLEL_END=$(date +%s%N)
PARALLEL_TIME=$(( (PARALLEL_END - PARALLEL_START) / 1000000 ))
echo "Total parallel load time: ${PARALLEL_TIME}ms"
echo ""

# Test 4: Dashboard v2 bundle endpoint (if it exists)
echo "TEST 4: Dashboard Stats Endpoint"
echo "================================"
echo "First load:"
time curl -s "$BASE_URL/v2/reports/dashboard-stats?tenant_id=$TENANT_ID" \
  -H "Accept: application/json" 2>&1 | head -20
echo ""

# Test 5: Cache effectiveness
echo "TEST 5: Cache Header Check"
echo "=========================="
curl -i -s "$BASE_URL/reports/dashboard-bundle?tenant_id=$TENANT_ID" 2>&1 | grep -E "Cache-Control|Date|Content-Length" | head -5
echo ""

# Test 6: Response payload size
echo "TEST 6: Response Payload Analysis"
echo "=================================="
SIZE=$(cat /tmp/dashboard1.json | wc -c)
echo "Dashboard bundle size: $((SIZE / 1024))KB"
echo "Content:"
cat /tmp/dashboard1.json | jq 'keys' 2>/dev/null
echo ""

echo "================================================"
echo "✅ DASHBOARD DIAGNOSTIC COMPLETE"
echo "================================================"
