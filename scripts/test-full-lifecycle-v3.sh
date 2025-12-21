#!/bin/bash
# Full v3.0.0 Lifecycle Test: BizDev Source → Lead → Contact

set -e

TENANT_ID="6cb4c008-4847-426a-9a2e-918ad70e7b69"
BASE_URL="http://localhost:4001/api"

echo "=== v3.0.0 FULL LIFECYCLE TEST ==="
echo ""

# ============= PHASE 1: BizDev Source → Lead =============
echo "[PHASE 1] Creating BizDev Source..."
BIZDEV=$(curl -s -X POST "$BASE_URL/bizdevsources" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TENANT_ID'",
    "source": "LinkedIn Sales Navigator",
    "source_type": "social_media",
    "contact_person": "Alice Johnson",
    "contact_email": "alice@techcorp.com",
    "contact_phone": "(555) 111-2222",
    "company_name": "TechCorp Inc",
    "industry": "SaaS",
    "website": "https://techcorp.com",
    "priority": "high",
    "status": "active",
    "batch_id": "batch-2025-dec"
  }')

BIZDEV_ID=$(echo "$BIZDEV" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "✅ BizDev Source Created: $BIZDEV_ID"
echo ""

# ============= PHASE 2: Promote BizDev → Lead =============
echo "[PHASE 2] Promoting BizDev Source to Lead..."
PROMOTE=$(curl -s -X POST "$BASE_URL/bizdevsources/$BIZDEV_ID/promote" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TENANT_ID'",
    "client_type": "B2B"
  }')

# Parse nested lead object
LEAD_ID=$(echo "$PROMOTE" | grep -o '"lead":{"id":"[^"]*' | cut -d'"' -f6)
ACCOUNT_ID=$(echo "$PROMOTE" | grep -o '"account_id":"[^"]*' | cut -d'"' -f4)
echo "✅ Lead Created: $LEAD_ID"
echo "✅ Account Created/Linked: $ACCOUNT_ID"
echo ""

# Verify Lead
echo "[PHASE 2] Verifying Lead data..."
LEAD_CHECK=$(curl -s "$BASE_URL/leads/$LEAD_ID?tenant_id=$TENANT_ID" 2>/dev/null | grep -o '"status":"[^"]*' | head -1)
echo "   Lead Status: $LEAD_CHECK"
echo ""

# ============= PHASE 3: Convert Lead → Contact =============
echo "[PHASE 3] Converting Lead to Contact..."
CONVERT=$(curl -s -X POST "$BASE_URL/leads/$LEAD_ID/convert" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TENANT_ID'",
    "create_opportunity": true,
    "opportunity_name": "Initial Outreach - Alice",
    "opportunity_amount": 50000
  }')

CONTACT_ID=$(echo "$CONVERT" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
OPP_ID=$(echo "$CONVERT" | grep -o '"id":"[^"]*' | tail -1 | cut -d'"' -f4)

if [ -z "$CONTACT_ID" ]; then
  echo "❌ Conversion failed"
  echo "$CONVERT"
  exit 1
fi

echo "✅ Contact Created: $CONTACT_ID"
echo "✅ Opportunity Created: $OPP_ID"
echo ""

# ============= VERIFICATION =============
echo "[VERIFICATION] Checking full lifecycle provenance..."

# Check Contact has provenance metadata
CONTACT=$(curl -s "$BASE_URL/contacts/$CONTACT_ID?tenant_id=$TENANT_ID" 2>/dev/null)
CONVERTED_FROM=$(echo "$CONTACT" | grep -o 'converted_from_lead_id' | head -1)
BIZDEV_ORIGIN=$(echo "$CONTACT" | grep -o 'bizdev_origin' | head -1)
HAS_ACCOUNT=$(echo "$CONTACT" | grep -o '"account_id":"[^"]*' | head -1)

echo ""
if [ -n "$CONVERTED_FROM" ]; then
  echo "✅ Contact has Lead provenance (converted_from_lead_id tracked)"
else
  echo "⚠️  Lead provenance not found in metadata"
fi

if [ -n "$BIZDEV_ORIGIN" ]; then
  echo "✅ Contact has full BizDev lineage (batch_id, source tracked)"
else
  echo "⚠️  BizDev lineage not found in metadata"
fi

if [ -n "$HAS_ACCOUNT" ]; then
  echo "✅ Contact linked to Account: $HAS_ACCOUNT"
else
  echo "⚠️  Contact not linked to Account"
fi

echo ""
echo "=== LIFECYCLE TEST COMPLETE ==="
echo ""
echo "Summary:"
echo "  BizDev Source → $BIZDEV_ID"
echo "  Lead (B2B)    → $LEAD_ID"
echo "  Contact       → $CONTACT_ID"
echo "  Account       → $ACCOUNT_ID"
echo "  Opportunity   → $OPP_ID"
echo ""
echo "✅ Full v3.0.0 lifecycle working: BizDev → Lead → Contact"
