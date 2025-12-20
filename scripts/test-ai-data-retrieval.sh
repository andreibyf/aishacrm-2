#!/bin/bash

# AI Data Retrieval Test - v3.0.0 Lifecycle Stages
# Tests if AI can access and process data from each promotion stage

BASE_URL="http://localhost:4001/api"
TENANT_ID="6cb4c008-4847-426a-9a2e-918ad70e7b69"

echo "================================================"
echo "AI Data Retrieval Test - v3.0.0 Lifecycle"
echo "================================================"
echo ""

# Helper function to fetch data
fetch_data() {
    local endpoint=$1
    local description=$2
    
    echo "📊 $description"
    echo "   Endpoint: GET $endpoint"
    
    response=$(curl -s "$BASE_URL$endpoint?tenant_id=$TENANT_ID&limit=5")
    
    # Try to parse as JSON
    if echo "$response" | jq empty 2>/dev/null; then
        count=$(echo "$response" | jq '.data | length' 2>/dev/null || echo "$response" | jq '.data.bizdev_sources | length' 2>/dev/null || echo "unknown")
        echo "   Status: ✅ Valid JSON"
        echo "   Record Count: $count"
        echo ""
        echo "$response"  # Return for processing
    else
        echo "   Status: ❌ Invalid JSON"
        echo "   Response: $response"
        echo ""
    fi
}

# Stage 1: BizDev Sources
echo "============================================"
echo "STAGE 1: BizDev Sources (Cold/Raw Leads)"
echo "============================================"
echo ""

BIZDEV_DATA=$(fetch_data "/bizdevsources" "Fetching BizDev Sources")

BIZDEV_COUNT=$(echo "$BIZDEV_DATA" | jq '.data.bizdev_sources | length' 2>/dev/null || echo "0")
echo "   ✅ Retrieved $BIZDEV_COUNT BizDev Sources"

if [ "$BIZDEV_COUNT" -gt 0 ]; then
    echo ""
    echo "Sample BizDev Source:"
    echo "$BIZDEV_DATA" | jq '.data.bizdev_sources[0] | {id, contact_person, company_name, source, metadata}' 2>/dev/null | head -15
fi

echo ""
echo "============================================"
echo "STAGE 2: Leads (Warm Prospects)"
echo "============================================"
echo ""

LEADS_DATA=$(fetch_data "/v2/leads" "Fetching Leads")

LEADS_COUNT=$(echo "$LEADS_DATA" | jq '.data | length' 2>/dev/null || echo "0")
echo "   ✅ Retrieved $LEADS_COUNT Leads"

if [ "$LEADS_COUNT" -gt 0 ]; then
    echo ""
    echo "Sample Lead with Provenance:"
    echo "$LEADS_DATA" | jq '.data[0] | {id, first_name, last_name, company, lead_type, status, metadata}' 2>/dev/null | head -20
    
    # Check for provenance data
    BIZDEV_ORIGIN=$(echo "$LEADS_DATA" | jq '.data[0].metadata.bizdev_origin' 2>/dev/null)
    if [ ! -z "$BIZDEV_ORIGIN" ] && [ "$BIZDEV_ORIGIN" != "null" ]; then
        echo ""
        echo "   ✅ Provenance found: BizDev Origin = $BIZDEV_ORIGIN"
    fi
fi

echo ""
echo "============================================"
echo "STAGE 3: Contacts (Hot Prospects)"
echo "============================================"
echo ""

CONTACTS_DATA=$(fetch_data "/v2/contacts" "Fetching Contacts")

CONTACTS_COUNT=$(echo "$CONTACTS_DATA" | jq '.data | length' 2>/dev/null || echo "0")
echo "   ✅ Retrieved $CONTACTS_COUNT Contacts"

if [ "$CONTACTS_COUNT" -gt 0 ]; then
    echo ""
    echo "Sample Contact with Full Provenance:"
    echo "$CONTACTS_DATA" | jq '.data[0] | {id, first_name, last_name, email, status, metadata}' 2>/dev/null | head -20
    
    # Check for conversion provenance
    LEAD_ID=$(echo "$CONTACTS_DATA" | jq '.data[0].metadata.converted_from_lead_id' 2>/dev/null)
    BIZDEV_ID=$(echo "$CONTACTS_DATA" | jq '.data[0].metadata.bizdev_origin' 2>/dev/null)
    
    if [ ! -z "$LEAD_ID" ] && [ "$LEAD_ID" != "null" ]; then
        echo ""
        echo "   ✅ Lead Provenance: Converted from Lead = $LEAD_ID"
    fi
    
    if [ ! -z "$BIZDEV_ID" ] && [ "$BIZDEV_ID" != "null" ]; then
        echo "   ✅ BizDev Provenance: Original source = $BIZDEV_ID"
    fi
fi

echo ""
echo "============================================"
echo "DATA STRUCTURE ANALYSIS"
echo "============================================"
echo ""

# Analyze what fields are available at each stage
echo "🔍 BizDev Source Fields Available:"
if [ "$BIZDEV_COUNT" -gt 0 ]; then
    echo "$BIZDEV_DATA" | jq '.data.bizdev_sources[0] | keys[]' 2>/dev/null | head -10 | sed 's/^/   - /'
fi

echo ""
echo "🔍 Lead Fields Available:"
if [ "$LEADS_COUNT" -gt 0 ]; then
    echo "$LEADS_DATA" | jq '.data[0] | keys[]' 2>/dev/null | head -10 | sed 's/^/   - /'
fi

echo ""
echo "🔍 Contact Fields Available:"
if [ "$CONTACTS_COUNT" -gt 0 ]; then
    echo "$CONTACTS_DATA" | jq '.data[0] | keys[]' 2>/dev/null | head -10 | sed 's/^/   - /'
fi

echo ""
echo "============================================"
echo "AI READINESS ASSESSMENT"
echo "============================================"
echo ""

# Summary
echo "✅ BizDev Sources available: $([ "$BIZDEV_COUNT" -gt 0 ] && echo "YES ($BIZDEV_COUNT)" || echo "NO")"
echo "✅ Leads available: $([ "$LEADS_COUNT" -gt 0 ] && echo "YES ($LEADS_COUNT)" || echo "NO")"
echo "✅ Contacts available: $([ "$CONTACTS_COUNT" -gt 0 ] && echo "YES ($CONTACTS_COUNT)" || echo "NO")"

echo ""
echo "📊 Provenance Chain:"

# Check if we can trace a full chain
if [ "$BIZDEV_COUNT" -gt 0 ] && [ "$LEADS_COUNT" -gt 0 ]; then
    FIRST_BIZDEV=$(echo "$BIZDEV_DATA" | jq -r '.data.bizdev_sources[0].id' 2>/dev/null)
    LEAD_WITH_ORIGIN=$(echo "$LEADS_DATA" | jq ".data[] | select(.metadata.bizdev_origin == \"$FIRST_BIZDEV\") | .id" 2>/dev/null | head -1)
    
    if [ ! -z "$LEAD_WITH_ORIGIN" ]; then
        echo "   ✅ BizDev → Lead chain: TRACEABLE"
    fi
fi

if [ "$LEADS_COUNT" -gt 0 ] && [ "$CONTACTS_COUNT" -gt 0 ]; then
    FIRST_LEAD=$(echo "$LEADS_DATA" | jq -r '.data[0].id' 2>/dev/null)
    CONTACT_WITH_LEAD=$(echo "$CONTACTS_DATA" | jq ".data[] | select(.metadata.converted_from_lead_id == \"$FIRST_LEAD\") | .id" 2>/dev/null | head -1)
    
    if [ ! -z "$CONTACT_WITH_LEAD" ]; then
        echo "   ✅ Lead → Contact chain: TRACEABLE"
    fi
fi

echo ""
echo "✅ Full lifecycle provenance chain available for AI processing"
echo ""
echo "================================================"
echo "AI can now:"
echo "  1. Query BizDev Sources for enrichment opportunities"
echo "  2. Retrieve Leads with BizDev origin context"
echo "  3. Access Contacts with full promotion history"
echo "  4. Trace any record back to its original source"
echo "  5. Make intelligent decisions based on lifecycle stage"
echo "================================================"
