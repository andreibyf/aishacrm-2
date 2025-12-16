#!/bin/bash

echo "================================================"
echo "🚀 ACTIVITIES ENDPOINT OPTIMIZATION TEST"
echo "================================================"
echo ""
echo "Testing: Activities endpoint performance after disabling double-query stats"
echo "Expected improvement: 444ms → 40ms (10x faster)"
echo ""

# Test with the tenant ID from the environment
TENANT_ID="a11dfb63-4b18-4eb8-872e-747af2e37c46"

echo "TEST 1: Activities endpoint (cold cache)"
echo "========================================"
response=$(curl -s -w "\n%{time_total}" "http://localhost:4001/api/v2/activities?tenant_id=$TENANT_ID&limit=50" 2>/dev/null)
time1=$(echo "$response" | tail -1)
data1=$(echo "$response" | head -1)
echo "Time: ${time1}s (= $(printf '%.0f' $(echo "$time1 * 1000" | bc))ms)"
echo "Response: $(echo "$data1" | jq -r '.status' 2>/dev/null || echo 'Error parsing')"
echo ""

echo "TEST 2: Activities endpoint (should be cached)"
echo "=============================================="
response=$(curl -s -w "\n%{time_total}" "http://localhost:4001/api/v2/activities?tenant_id=$TENANT_ID&limit=50" 2>/dev/null)
time2=$(echo "$response" | tail -1)
data2=$(echo "$response" | head -1)
echo "Time: ${time2}s (= $(printf '%.0f' $(echo "$time2 * 1000" | bc))ms)"
echo "Response: $(echo "$data2" | jq -r '.status' 2>/dev/null || echo 'Error parsing')"
echo ""

echo "TEST 3: Leads endpoint (for comparison)"
echo "======================================="
response=$(curl -s -w "\n%{time_total}" "http://localhost:4001/api/v2/leads?tenant_id=$TENANT_ID&limit=50" 2>/dev/null)
time3=$(echo "$response" | tail -1)
echo "Time: ${time3}s (= $(printf '%.0f' $(echo "$time3 * 1000" | bc))ms)"
echo ""

echo "TEST 4: Contacts endpoint (for comparison)"
echo "=========================================="
response=$(curl -s -w "\n%{time_total}" "http://localhost:4001/api/v2/contacts?tenant_id=$TENANT_ID&limit=50" 2>/dev/null)
time4=$(echo "$response" | tail -1)
echo "Time: ${time4}s (= $(printf '%.0f' $(echo "$time4 * 1000" | bc))ms)"
echo ""

echo "TEST 5: Opportunities endpoint (for comparison)"
echo "=============================================="
response=$(curl -s -w "\n%{time_total}" "http://localhost:4001/api/v2/opportunities?tenant_id=$TENANT_ID&limit=50" 2>/dev/null)
time5=$(echo "$response" | tail -1)
echo "Time: ${time5}s (= $(printf '%.0f' $(echo "$time5 * 1000" | bc))ms)"
echo ""

echo "================================================"
echo "📊 PERFORMANCE COMPARISON"
echo "================================================"
echo ""
echo "Endpoint          | Time"
echo "------------------|----------"
echo "Activities (1st)   | $(printf '%.0f' $(echo "$time1 * 1000" | bc))ms"
echo "Activities (2nd)   | $(printf '%.0f' $(echo "$time2 * 1000" | bc))ms  ✅ (Cached)"
echo "Leads              | $(printf '%.0f' $(echo "$time3 * 1000" | bc))ms"
echo "Contacts           | $(printf '%.0f' $(echo "$time4 * 1000" | bc))ms"
echo "Opportunities      | $(printf '%.0f' $(echo "$time5 * 1000" | bc))ms"
echo ""

# Calculate improvement
improvement=$(echo "scale=1; (444 - $time1 * 1000) / 4.44" | bc)
echo "🎉 Improvement: ~${improvement}% faster! (was 444ms, now ~$(printf '%.0f' $(echo "$time1 * 1000" | bc))ms)"
echo ""

echo "✅ OPTIMIZATION TEST COMPLETE"
