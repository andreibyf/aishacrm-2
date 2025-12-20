#!/bin/bash

# Performance diagnostic - Check loading times and cache effectiveness
BASE_URL="http://localhost:4001/api"
TENANT_ID="6cb4c008-4847-426a-9a2e-918ad70e7b69"

echo "================================================"
echo "⚡ PERFORMANCE DIAGNOSTIC"
echo "================================================"
echo ""

# Test 1: First load of leads (no cache)
echo "TEST 1: First Load - Leads (no cache)"
echo "======================================="
time curl -s "$BASE_URL/v2/leads?tenant_id=$TENANT_ID&limit=50" \
  -H "Content-Type: application/json" > /dev/null
echo ""

# Test 2: Second load (should hit cache)
echo "TEST 2: Second Load - Leads (should be cached)"
echo "================================================"
time curl -s "$BASE_URL/v2/leads?tenant_id=$TENANT_ID&limit=50" \
  -H "Content-Type: application/json" > /dev/null
echo ""

# Test 3: Contacts first load
echo "TEST 3: First Load - Contacts (no cache)"
echo "========================================="
time curl -s "$BASE_URL/v2/contacts?tenant_id=$TENANT_ID&limit=50" \
  -H "Content-Type: application/json" > /dev/null
echo ""

# Test 4: Contacts second load
echo "TEST 4: Second Load - Contacts (should be cached)"
echo "=================================================="
time curl -s "$BASE_URL/v2/contacts?tenant_id=$TENANT_ID&limit=50" \
  -H "Content-Type: application/json" > /dev/null
echo ""

# Test 5: Opportunities
echo "TEST 5: First Load - Opportunities (no cache)"
echo "=============================================="
time curl -s "$BASE_URL/v2/opportunities?tenant_id=$TENANT_ID&limit=50" \
  -H "Content-Type: application/json" > /dev/null
echo ""

# Test 6: Opportunities second
echo "TEST 6: Second Load - Opportunities (should be cached)"
echo "======================================================="
time curl -s "$BASE_URL/v2/opportunities?tenant_id=$TENANT_ID&limit=50" \
  -H "Content-Type: application/json" > /dev/null
echo ""

# Test 7: Accounts
echo "TEST 7: First Load - Accounts (no cache)"
echo "========================================"
time curl -s "$BASE_URL/v2/accounts?tenant_id=$TENANT_ID&limit=50" \
  -H "Content-Type: application/json" > /dev/null
echo ""

# Test 8: Accounts second
echo "TEST 8: Second Load - Accounts (should be cached)"
echo "================================================="
time curl -s "$BASE_URL/v2/accounts?tenant_id=$TENANT_ID&limit=50" \
  -H "Content-Type: application/json" > /dev/null
echo ""

# Test 9: Check Redis cache status
echo "TEST 9: Redis Cache Status"
echo "=========================="
echo "Checking if Redis is running..."
redis-cli -p 6380 ping 2>/dev/null && echo "✅ Cache Redis (6380) - Connected" || echo "❌ Cache Redis (6380) - Not responding"
redis-cli -p 6379 ping 2>/dev/null && echo "✅ Session Redis (6379) - Connected" || echo "❌ Session Redis (6379) - Not responding"
echo ""

# Get cache stats
echo "Cache Statistics:"
CACHE_KEYS=$(redis-cli -p 6380 dbsize 2>/dev/null | grep -o '[0-9]*' || echo "0")
echo "  Total cached keys: $CACHE_KEYS"
echo ""

# Test 10: Detail endpoint (has more fields to expand)
echo "TEST 10: Detail Endpoint Performance"
echo "===================================="
LEAD_ID=$(curl -s "$BASE_URL/v2/leads?tenant_id=$TENANT_ID&limit=1" \
  -H "Content-Type: application/json" | jq -r '.data.leads[0].id' 2>/dev/null)

if [ ! -z "$LEAD_ID" ] && [ "$LEAD_ID" != "null" ]; then
  echo "Testing detail endpoint for Lead: $LEAD_ID"
  echo "First load (no cache):"
  time curl -s "$BASE_URL/v2/leads/$LEAD_ID?tenant_id=$TENANT_ID" \
    -H "Content-Type: application/json" > /dev/null
  echo ""
  
  echo "Second load (cached):"
  time curl -s "$BASE_URL/v2/leads/$LEAD_ID?tenant_id=$TENANT_ID" \
    -H "Content-Type: application/json" > /dev/null
else
  echo "No leads found for detail test"
fi

echo ""
echo "================================================"
echo "✅ PERFORMANCE DIAGNOSTIC COMPLETE"
echo "================================================"
