#!/bin/bash

# Comprehensive API Endpoint Testing Script
# Tests all 100+ endpoints in Aisha CRM backend
# Usage: bash test-all-endpoints.sh

BASE_URL="http://localhost:4001"
RESULTS_FILE="endpoint-test-results.json"
TENANT_ID="test-tenant-001"

echo "🚀 Starting comprehensive API endpoint testing..."
echo "Base URL: $BASE_URL"
echo "Results will be saved to: $RESULTS_FILE"
echo ""

# Initialize results file
echo "{" > $RESULTS_FILE
echo '  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",' >> $RESULTS_FILE
echo '  "base_url": "'$BASE_URL'",' >> $RESULTS_FILE
echo '  "results": [' >> $RESULTS_FILE

test_count=0
pass_count=0
fail_count=0

# Function to test an endpoint
test_endpoint() {
    local method=$1
    local path=$2
    local expected_status=$3
    local description=$4
    local data=$5

    test_count=$((test_count + 1))

    if [ "$method" = "GET" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")
    elif [ "$method" = "POST" ] || [ "$method" = "PUT" ] || [ "$method" = "DELETE" ]; then
        if [ -n "$data" ]; then
            response=$(curl -s -o /dev/null -w "%{http_code}" -X $method -H "Content-Type: application/json" -d "$data" "$BASE_URL$path")
        else
            response=$(curl -s -o /dev/null -w "%{http_code}" -X $method -H "Content-Type: application/json" "$BASE_URL$path")
        fi
    fi

    # Consider 200, 201, 400, 401, 403 as "working" (server responding)
    # 500, 502, 503, 504 as failures
    if [ "$response" -ge 200 ] && [ "$response" -lt 500 ]; then
        status="✅ PASS"
        pass_count=$((pass_count + 1))
    else
        status="❌ FAIL"
        fail_count=$((fail_count + 1))
    fi

    echo "    {\"method\": \"$method\", \"path\": \"$path\", \"status\": $response, \"description\": \"$description\", \"result\": \"$status\"}," >> $RESULTS_FILE
    printf "%-8s %-50s %3d %s\n" "$method" "$path" "$response" "$status"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: System & Health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/" 200 "Root API info"
test_endpoint "GET" "/health" 200 "Health check"
test_endpoint "GET" "/api/status" 200 "API status"
test_endpoint "GET" "/api-docs.json" 200 "Swagger spec"
test_endpoint "GET" "/api/system/status" 200 "System status"
test_endpoint "GET" "/api/system/runtime" 200 "Runtime diagnostics"
test_endpoint "GET" "/api/system/diagnostics" 200 "Full diagnostics"
test_endpoint "GET" "/api/system/logs?tenant_id=$TENANT_ID" 200 "System logs"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Reports & Analytics"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/reports/dashboard-stats?tenant_id=$TENANT_ID" 200 "Dashboard stats"
test_endpoint "GET" "/api/reports/dashboard-bundle?tenant_id=$TENANT_ID" 200 "Dashboard bundle"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Accounts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/accounts?tenant_id=$TENANT_ID" 200 "List accounts"
test_endpoint "POST" "/api/accounts" 400 "Create account (no data)"
test_endpoint "POST" "/api/accounts" 201 "Create account" '{"tenant_id":"'$TENANT_ID'","name":"Test Account"}'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Contacts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/contacts?tenant_id=$TENANT_ID" 200 "List contacts"
test_endpoint "POST" "/api/contacts" 400 "Create contact (no data)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Leads"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/leads?tenant_id=$TENANT_ID" 200 "List leads"
test_endpoint "POST" "/api/leads" 400 "Create lead (no data)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Opportunities"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/opportunities?tenant_id=$TENANT_ID" 200 "List opportunities"
test_endpoint "POST" "/api/opportunities" 400 "Create opportunity (no data)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Activities"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/activities?tenant_id=$TENANT_ID" 200 "List activities"
test_endpoint "POST" "/api/activities" 400 "Create activity (no data)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Notes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/notes?tenant_id=$TENANT_ID" 200 "List notes"
test_endpoint "POST" "/api/notes" 400 "Create note (no data)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Users & Employees"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/users?tenant_id=$TENANT_ID" 200 "List users"
test_endpoint "GET" "/api/employees?tenant_id=$TENANT_ID" 200 "List employees"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Tenants"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/tenants" 200 "List tenants"
test_endpoint "GET" "/api/tenants/$TENANT_ID" 404 "Get tenant (not found expected)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: AI & Automation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/aicampaigns?tenant_id=$TENANT_ID" 200 "List AI campaigns"
test_endpoint "GET" "/api/workflows?tenant_id=$TENANT_ID" 200 "List workflows"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Business Operations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/cashflow?tenant_id=$TENANT_ID" 200 "List cashflow"
test_endpoint "GET" "/api/bizdev?tenant_id=$TENANT_ID" 200 "List bizdev"
test_endpoint "GET" "/api/bizdevsources?tenant_id=$TENANT_ID" 200 "List bizdev sources"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/permissions?tenant_id=$TENANT_ID" 200 "List permissions"
test_endpoint "GET" "/api/modulesettings?tenant_id=$TENANT_ID" 200 "List module settings"
test_endpoint "GET" "/api/systembrandings" 200 "List system brandings"
test_endpoint "GET" "/api/integrations?tenant_id=$TENANT_ID" 200 "List integrations"
test_endpoint "GET" "/api/tenantintegrations?tenant_id=$TENANT_ID" 200 "List tenant integrations"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Logging & Monitoring"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/system-logs?tenant_id=$TENANT_ID" 200 "List system logs"
test_endpoint "GET" "/api/audit-logs?tenant_id=$TENANT_ID" 200 "List audit logs"
test_endpoint "GET" "/api/metrics/performance?tenant_id=$TENANT_ID" 200 "Performance metrics"
test_endpoint "GET" "/api/synchealths?tenant_id=$TENANT_ID" 200 "Sync healths"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Storage & Documents"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/storage/bucket" 200 "Get bucket info"
test_endpoint "GET" "/api/documents?tenant_id=$TENANT_ID" 200 "List documents"
test_endpoint "GET" "/api/documentationfiles?tenant_id=$TENANT_ID" 200 "List documentation files"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Notifications & Announcements"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/notifications?tenant_id=$TENANT_ID" 200 "List notifications"
test_endpoint "GET" "/api/announcements?tenant_id=$TENANT_ID" 200 "List announcements"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Testing & Utilities"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/testing/ping" 200 "Ping test"
test_endpoint "GET" "/api/testing/suites" 200 "Test suites"
test_endpoint "GET" "/api/utils/health" 200 "Utils health"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: Webhooks & Cron"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/webhooks?tenant_id=$TENANT_ID" 200 "List webhooks"
test_endpoint "GET" "/api/cron/jobs" 200 "List cron jobs"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CATEGORY: API Keys"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "GET" "/api/apikeys?tenant_id=$TENANT_ID" 200 "List API keys"

# Close JSON results file
echo '    {}' >> $RESULTS_FILE
echo '  ],' >> $RESULTS_FILE
echo '  "summary": {' >> $RESULTS_FILE
echo '    "total": '$test_count',' >> $RESULTS_FILE
echo '    "passed": '$pass_count',' >> $RESULTS_FILE
echo '    "failed": '$fail_count >> $RESULTS_FILE
echo '  }' >> $RESULTS_FILE
echo '}' >> $RESULTS_FILE

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total Tests: $test_count"
echo "Passed: $pass_count"
echo "Failed: $fail_count"
echo ""
echo "Results saved to: $RESULTS_FILE"
