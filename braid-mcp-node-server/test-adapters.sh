#!/bin/bash
# Braid MCP Server - Adapter Test Suite (bash version)

echo ""
echo "========================================"
echo "  Braid MCP Server - Adapter Tests"
echo "========================================"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0
BASE_URL="http://localhost:8000"

# Test function
run_test() {
    local test_name="$1"
    local envelope="$2"
    
    echo "Running: $test_name"
    
    response=$(curl -s -X POST "$BASE_URL/mcp/run" \
        -H "Content-Type: application/json" \
        -d "$envelope")
    
    status=$(echo "$response" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ "$status" = "success" ]; then
        echo "  ✓ PASSED"
        ((TESTS_PASSED++))
        echo "$response"
    else
        echo "  ✗ FAILED"
        ((TESTS_FAILED++))
        echo "$response"
    fi
    echo ""
}

# Test 0: Health Check
echo "Test 0: Health Check"
health=$(curl -s "$BASE_URL/health")
if echo "$health" | grep -q '"status":"ok"'; then
    echo "  ✓ Server is healthy"
else
    echo "  ✗ Server is not responding!"
    exit 1
fi
echo ""

# Test 1: Mock Adapter
run_test "Test 1: Mock Adapter - Read Entity" '{
  "requestId": "test-mock",
  "actor": {"id": "agent:test", "type": "agent"},
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
  "actions": [{
    "id": "action-1",
    "verb": "read",
    "actor": {"id": "agent:test", "type": "agent"},
    "resource": {"system": "mock", "kind": "example-entity"},
    "targetId": "123"
  }]
}'

# Test 2: Web Adapter - Wikipedia Search
run_test "Test 2: Web Adapter - Wikipedia Search" '{
  "requestId": "test-web-search",
  "actor": {"id": "agent:test", "type": "agent"},
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
  "actions": [{
    "id": "action-1",
    "verb": "search",
    "actor": {"id": "agent:test", "type": "agent"},
    "resource": {"system": "web", "kind": "wikipedia-search"},
    "payload": {"q": "artificial intelligence"}
  }]
}'

# Test 3: CRM Adapter - Search Accounts
run_test "Test 3: CRM Adapter - Search Accounts" '{
  "requestId": "test-crm-accounts",
  "actor": {"id": "agent:test", "type": "agent"},
  "createdAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'",
  "actions": [{
    "id": "action-1",
    "verb": "search",
    "actor": {"id": "agent:test", "type": "agent"},
    "resource": {"system": "crm", "kind": "accounts"},
    "metadata": {"tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46"},
    "options": {"maxItems": 5}
  }]
}'

# Summary
echo "========================================"
echo "  Test Summary"
echo "========================================"
echo "  Passed: $TESTS_PASSED"
echo "  Failed: $TESTS_FAILED"
echo "  Total:  $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "✓ All tests passed!"
    exit 0
else
    echo "✗ Some tests failed"
    exit 1
fi
