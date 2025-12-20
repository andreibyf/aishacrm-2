#!/bin/bash

# AI Creation Capability Test - v3.0.0 Lifecycle
# Tests if AI can CREATE records at each stage (not just read)

BASE_URL="http://localhost:4001/api"
TENANT_ID="6cb4c008-4847-426a-9a2e-918ad70e7b69"

echo "================================================"
echo "🤖 AI CREATION CAPABILITY TEST"
echo "================================================"
echo ""

# Test 1: Can AI create a BizDev Source?
echo "============================================"
echo "TEST 1: AI Creating a BizDev Source"
echo "============================================"
echo ""

BIZDEV_PAYLOAD='{
  "tenant_id": "'$TENANT_ID'",
  "contact_person": "Sarah Chen",
  "company_name": "CloudScale AI",
  "phone": "(555) 222-3333",
  "email": "sarah@cloudscale.ai",
  "website": "https://cloudscale.ai",
  "industry": "artificial_intelligence",
  "source": "LinkedIn Sales Navigator",
  "batch_id": "ai-generated-batch-001",
  "license_status": "Active",
  "notes": "Created by AI for testing"
}'

echo "📝 Creating BizDev Source with AI payload..."
BIZDEV_RESPONSE=$(curl -s -X POST "$BASE_URL/bizdevsources" \
  -H "Content-Type: application/json" \
  -d "$BIZDEV_PAYLOAD" 2>&1)

BIZDEV_ID=$(echo "$BIZDEV_RESPONSE" | jq -r '.data.id' 2>/dev/null)

if [ ! -z "$BIZDEV_ID" ] && [ "$BIZDEV_ID" != "null" ]; then
    echo "✅ BizDev Source Created: $BIZDEV_ID"
    echo ""
    echo "Created Record:"
    echo "$BIZDEV_RESPONSE" | jq . 2>/dev/null | head -20
else
    echo "❌ Failed to create BizDev Source"
    echo "Response:"
    echo "$BIZDEV_RESPONSE" | jq . 2>/dev/null || echo "$BIZDEV_RESPONSE" | head -20
fi

# Test 2: Can AI create a Lead?
echo ""
echo "============================================"
echo "TEST 2: AI Creating a Lead"
echo "============================================"
echo ""

LEAD_PAYLOAD='{
  "tenant_id": "'$TENANT_ID'",
  "first_name": "Michael",
  "last_name": "Roberts",
  "email": "michael@techstart.com",
  "phone": "(555) 333-4444",
  "company": "TechStart Inc",
  "lead_type": "b2b",
  "status": "new",
  "source": "AI Generated",
  "score": 75,
  "qualification_status": "mql"
}'

echo "📝 Creating Lead with AI payload..."
LEAD_RESPONSE=$(curl -s -X POST "$BASE_URL/v2/leads" \
  -H "Content-Type: application/json" \
  -d "$LEAD_PAYLOAD" 2>&1)

LEAD_ID=$(echo "$LEAD_RESPONSE" | jq -r '.data.lead.id' 2>/dev/null)

if [ ! -z "$LEAD_ID" ] && [ "$LEAD_ID" != "null" ]; then
    echo "✅ Lead Created: $LEAD_ID"
    echo ""
    echo "Created Record:"
    echo "$LEAD_RESPONSE" | jq . 2>/dev/null | head -20
else
    echo "❌ Failed to create Lead"
    echo "Response:"
    echo "$LEAD_RESPONSE" | jq . 2>/dev/null || echo "$LEAD_RESPONSE" | head -20
fi

# Test 3: Can AI create a Contact?
echo ""
echo "============================================"
echo "TEST 3: AI Creating a Contact"
echo "============================================"
echo ""

CONTACT_PAYLOAD='{
  "tenant_id": "'$TENANT_ID'",
  "first_name": "Emma",
  "last_name": "Wilson",
  "email": "emma@enterprise.com",
  "phone": "(555) 444-5555",
  "status": "active",
  "metadata": {
    "job_title": "VP of Sales",
    "company_name": "Enterprise Solutions",
    "industry": "enterprise_software",
    "created_by": "ai_engine"
  }
}'

echo "📝 Creating Contact with AI payload..."
CONTACT_RESPONSE=$(curl -s -X POST "$BASE_URL/v2/contacts" \
  -H "Content-Type: application/json" \
  -d "$CONTACT_PAYLOAD" 2>&1)

CONTACT_ID=$(echo "$CONTACT_RESPONSE" | jq -r '.data.contact.id' 2>/dev/null)

if [ ! -z "$CONTACT_ID" ] && [ "$CONTACT_ID" != "null" ]; then
    echo "✅ Contact Created: $CONTACT_ID"
    echo ""
    echo "Created Record:"
    echo "$CONTACT_RESPONSE" | jq . 2>/dev/null | head -20
else
    echo "❌ Failed to create Contact"
    echo "Response:"
    echo "$CONTACT_RESPONSE" | jq . 2>/dev/null || echo "$CONTACT_RESPONSE" | head -20
fi

# Test 4: Can AI create an Opportunity?
echo ""
echo "============================================"
echo "TEST 4: AI Creating an Opportunity"
echo "============================================"
echo ""

OPP_PAYLOAD='{
  "tenant_id": "'$TENANT_ID'",
  "name": "AI-Generated Deal - Enterprise Package",
  "stage": "proposal",
  "amount": 250000,
  "probability": 65,
  "contact_id": "'$CONTACT_ID'",
  "metadata": {
    "created_by": "ai_engine",
    "ai_confidence": 0.75
  }
}'

echo "📝 Creating Opportunity with AI payload..."
OPP_RESPONSE=$(curl -s -X POST "$BASE_URL/v2/opportunities" \
  -H "Content-Type: application/json" \
  -d "$OPP_PAYLOAD" 2>&1)

OPP_ID=$(echo "$OPP_RESPONSE" | jq -r '.data.opportunity.id' 2>/dev/null)

if [ ! -z "$OPP_ID" ] && [ "$OPP_ID" != "null" ]; then
    echo "✅ Opportunity Created: $OPP_ID"
    echo ""
    echo "Created Record:"
    echo "$OPP_RESPONSE" | jq . 2>/dev/null | head -20
else
    echo "❌ Failed to create Opportunity"
    echo "Response:"
    echo "$OPP_RESPONSE" | jq . 2>/dev/null || echo "$OPP_RESPONSE" | head -20
fi

# Summary
echo ""
echo "================================================"
echo "🤖 AI CREATION CAPABILITIES SUMMARY"
echo "================================================"
echo ""
echo "BizDev Source:  $([ ! -z "$BIZDEV_ID" ] && [ "$BIZDEV_ID" != "null" ] && echo "✅ CAN CREATE" || echo "❌ CANNOT CREATE")"
echo "Lead:           $([ ! -z "$LEAD_ID" ] && [ "$LEAD_ID" != "null" ] && echo "✅ CAN CREATE" || echo "❌ CANNOT CREATE")"
echo "Contact:        $([ ! -z "$CONTACT_ID" ] && [ "$CONTACT_ID" != "null" ] && echo "✅ CAN CREATE" || echo "❌ CANNOT CREATE")"
echo "Opportunity:    $([ ! -z "$OPP_ID" ] && [ "$OPP_ID" != "null" ] && echo "✅ CAN CREATE" || echo "❌ CANNOT CREATE")"
echo ""
echo "================================================"
echo ""

if [ ! -z "$BIZDEV_ID" ] && [ "$BIZDEV_ID" != "null" ]; then
    echo "Created IDs for reference:"
    echo "  BizDev Source: $BIZDEV_ID"
fi

if [ ! -z "$LEAD_ID" ] && [ "$LEAD_ID" != "null" ]; then
    echo "  Lead: $LEAD_ID"
fi

if [ ! -z "$CONTACT_ID" ] && [ "$CONTACT_ID" != "null" ]; then
    echo "  Contact: $CONTACT_ID"
fi

if [ ! -z "$OPP_ID" ] && [ "$OPP_ID" != "null" ]; then
    echo "  Opportunity: $OPP_ID"
fi

echo ""
echo "================================================"
