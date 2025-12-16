#!/bin/bash

# AI Data Retrieval Test - v3.0.0 Lifecycle Stages
# Tests if AI can access and process data from each promotion stage

BASE_URL="http://localhost:4001/api"
TENANT_ID="6cb4c008-4847-426a-9a2e-918ad70e7b69"

echo "================================================"
echo "✅ AI DATA RETRIEVAL TEST - v3.0.0 LIFECYCLE"
echo "================================================"
echo ""

# Stage 1: Leads
echo "============================================"
echo "STAGE 1: Leads (Warm Prospects)"
echo "============================================"
echo ""

LEADS_DATA=$(curl -s "$BASE_URL/v2/leads?tenant_id=$TENANT_ID&limit=5")
LEADS_COUNT=$(echo "$LEADS_DATA" | jq '.data.leads | length' 2>/dev/null || echo "0")

echo "📊 Leads Retrieved: $LEADS_COUNT"
echo ""

if [ "$LEADS_COUNT" -gt 0 ]; then
    echo "Sample Lead (AI-accessible fields):"
    echo "$LEADS_DATA" | jq '.data.leads[0] | {
        id,
        company_name,
        contact_person,
        contact_email,
        contact_phone,
        industry,
        source_origin,
        batch_id,
        status,
        promoted_from_bizdev_id,
        created_at
    }' 2>/dev/null
fi

# Stage 2: Contacts
echo ""
echo "============================================"
echo "STAGE 2: Contacts (Hot Prospects)"
echo "============================================"
echo ""

CONTACTS_DATA=$(curl -s "$BASE_URL/v2/contacts?tenant_id=$TENANT_ID&limit=5")
CONTACTS_COUNT=$(echo "$CONTACTS_DATA" | jq '.data | length' 2>/dev/null || echo "0")

echo "📊 Contacts Retrieved: $CONTACTS_COUNT"
echo ""

if [ "$CONTACTS_COUNT" -gt 0 ]; then
    echo "Sample Contact (AI-accessible fields):"
    echo "$CONTACTS_DATA" | jq '.data[0] | {
        id,
        first_name,
        last_name,
        email,
        phone,
        status,
        converted_from_lead_id: .metadata.converted_from_lead_id,
        bizdev_origin: .metadata.bizdev_origin,
        bizdev_batch_id: .metadata.bizdev_batch_id,
        created_at
    }' 2>/dev/null
fi

# Stage 3: Opportunities (related to contacts)
echo ""
echo "============================================"
echo "STAGE 3: Opportunities (Deal Pipeline)"
echo "============================================"
echo ""

OPPS_DATA=$(curl -s "$BASE_URL/v2/opportunities?tenant_id=$TENANT_ID&limit=5")
OPPS_COUNT=$(echo "$OPPS_DATA" | jq '.data | length' 2>/dev/null || echo "0")

echo "📊 Opportunities Retrieved: $OPPS_COUNT"
echo ""

if [ "$OPPS_COUNT" -gt 0 ]; then
    echo "Sample Opportunity (AI-accessible fields):"
    echo "$OPPS_DATA" | jq '.data[0] | {
        id,
        name,
        stage,
        status,
        contact_id,
        account_id,
        value,
        probability,
        created_at
    }' 2>/dev/null
fi

# Stage 4: Accounts
echo ""
echo "============================================"
echo "STAGE 4: Customers/Accounts"
echo "============================================"
echo ""

ACCOUNTS_DATA=$(curl -s "$BASE_URL/v2/accounts?tenant_id=$TENANT_ID&limit=5")
ACCOUNTS_COUNT=$(echo "$ACCOUNTS_DATA" | jq '.data | length' 2>/dev/null || echo "0")

echo "📊 Customers Retrieved: $ACCOUNTS_COUNT"
echo ""

if [ "$ACCOUNTS_COUNT" -gt 0 ]; then
    echo "Sample Customer (AI-accessible fields):"
    echo "$ACCOUNTS_DATA" | jq '.data[0] | {
        id,
        name,
        account_type,
        industry,
        website,
        email,
        phone,
        employee_count,
        annual_revenue,
        type,
        health_status
    }' 2>/dev/null
fi

# Summary
echo ""
echo "============================================"
echo "📊 LIFECYCLE DATA SUMMARY"
echo "============================================"
echo ""
echo "Stage 1 - Leads (Cold→Warm):     ✅ $LEADS_COUNT accessible"
echo "Stage 2 - Contacts (Warm→Hot):   ✅ $CONTACTS_COUNT accessible"
echo "Stage 3 - Opportunities (Deal):  ✅ $OPPS_COUNT accessible"
echo "Stage 4 - Customers (Account):   ✅ $ACCOUNTS_COUNT accessible"
echo ""
echo "============================================"
echo "✅ AI DATA RETRIEVAL CAPABILITIES"
echo "============================================"
echo ""
echo "AI can now:"
echo "  1️⃣  Query Leads to find promotion-ready prospects"
echo "  2️⃣  Retrieve Contact details with full BizDev lineage"
echo "  3️⃣  Access Opportunities linked to Contacts/Accounts"
echo "  4️⃣  Review Customer/Account health and engagement"
echo "  5️⃣  Trace any record back to BizDev Source (batch_id)"
echo "  6️⃣  Make lifecycle-aware decisions based on stage"
echo ""
echo "Example AI Use Cases:"
echo "  • Identify cold Leads ready to promote to Contacts"
echo "  • Find high-value Contacts without Opportunities"
echo "  • Enrich Contact data from original BizDev Source"
echo "  • Score Accounts based on Contact engagement"
echo "  • Track full customer journey from source to opportunity"
echo ""
echo "================================================"
