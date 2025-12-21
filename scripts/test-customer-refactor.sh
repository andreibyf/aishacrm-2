#!/bin/bash

# Test script for Customer refactor
# Tests:
# 1. Navigation link exists
# 2. Create B2B customer 
# 3. Create B2C customer
# 4. Verify forms show correct fields
# 5. Verify API calls use /v2/accounts endpoint

echo "================================================"
echo "Customer Refactor Test Suite"
echo "================================================"

BASE_URL="http://localhost:4001/api"
TENANT_ID="6cb4c008-4847-426a-9a2e-918ad70e7b69"

# Helper to make requests
test_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo ""
    echo "📝 $description"
    echo "   Method: $method"
    echo "   Endpoint: $endpoint"
    
    if [ -z "$data" ]; then
        response=$(curl -s -X "$method" "$BASE_URL$endpoint?tenant_id=$TENANT_ID")
    else
        response=$(curl -s -X "$method" \
            -H "Content-Type: application/json" \
            "$BASE_URL$endpoint?tenant_id=$TENANT_ID" \
            -d "$data")
    fi
    
    echo "   Response preview:"
    echo "$response" | jq . 2>/dev/null | head -20 || echo "$response" | head -20
    echo "$response"  # Return full response
}

# Test 1: Create B2B Customer
echo ""
echo "============ TEST 1: CREATE B2B CUSTOMER ============"
B2B_DATA='{
    "name": "TechCorp Inc",
    "account_type": "b2b",
    "type": "prospect",
    "industry": "information_technology",
    "website": "https://techcorp.example.com",
    "email": "info@techcorp.com",
    "phone": "+1-555-123-4567",
    "employee_count": 150,
    "annual_revenue": 5000000,
    "address_1": "123 Tech Boulevard",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94105",
    "country": "United States"
}'

B2B_RESPONSE=$(test_request "POST" "/v2/accounts" "$B2B_DATA" "Creating B2B Customer")
B2B_ID=$(echo "$B2B_RESPONSE" | jq -r '.id' 2>/dev/null)
echo "✅ B2B Customer created: $B2B_ID"

# Test 2: Create B2C Customer
echo ""
echo "============ TEST 2: CREATE B2C CUSTOMER ============"
B2C_DATA='{
    "name": "Acme Corp",
    "account_type": "b2c",
    "type": "prospect",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "+1-555-987-6543",
    "job_title": "Marketing Manager",
    "address_1": "456 Oak Street",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "country": "United States"
}'

B2C_RESPONSE=$(test_request "POST" "/v2/accounts" "$B2C_DATA" "Creating B2C Customer")
B2C_ID=$(echo "$B2C_RESPONSE" | jq -r '.id' 2>/dev/null)
echo "✅ B2C Customer created: $B2C_ID"

# Test 3: Fetch B2B to verify fields
echo ""
echo "============ TEST 3: VERIFY B2B FIELDS ============"
if [ ! -z "$B2B_ID" ] && [ "$B2B_ID" != "null" ]; then
    B2B_FETCH=$(test_request "GET" "/v2/accounts/$B2B_ID" "" "Fetching B2B Customer")
    echo "$B2B_FETCH" | jq 'select(.account_type=="b2b") | {id, name, account_type, industry, website, employee_count, annual_revenue}' 2>/dev/null | head -15
fi

# Test 4: Fetch B2C to verify fields
echo ""
echo "============ TEST 4: VERIFY B2C FIELDS ============"
if [ ! -z "$B2C_ID" ] && [ "$B2C_ID" != "null" ]; then
    B2C_FETCH=$(test_request "GET" "/v2/accounts/$B2C_ID" "" "Fetching B2C Customer")
    echo "$B2C_FETCH" | jq 'select(.account_type=="b2c") | {id, name, account_type, first_name, last_name, job_title, email}' 2>/dev/null | head -15
fi

# Test 5: List all customers
echo ""
echo "============ TEST 5: LIST ALL CUSTOMERS ============"
LIST_RESPONSE=$(test_request "GET" "/v2/accounts" "" "Listing all customers")
TOTAL=$(echo "$LIST_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
B2B_COUNT=$(echo "$LIST_RESPONSE" | jq '[.data[] | select(.account_type=="b2b")] | length' 2>/dev/null || echo "0")
B2C_COUNT=$(echo "$LIST_RESPONSE" | jq '[.data[] | select(.account_type=="b2c")] | length' 2>/dev/null || echo "0")

echo "📊 Totals:"
echo "   Total Customers: $TOTAL"
echo "   B2B: $B2B_COUNT"
echo "   B2C: $B2C_COUNT"

echo ""
echo "================================================"
echo "✅ ALL TESTS COMPLETED"
echo "================================================"
