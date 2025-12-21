#!/bin/bash
# Test promote endpoint - v3.0.0 architecture

set -e

TENANT_ID="6cb4c008-4847-426a-9a2e-918ad70e7b69"
BASE_URL="http://localhost:4001/api"

echo "=== Test: BizDev Source Promotion (v3.0.0) ==="
echo ""

# Step 1: Create a test BizDev Source
echo "[1] Creating test BizDev Source..."
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/bizdevsources" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TENANT_ID'",
    "source": "Test LinkedIn",
    "source_type": "social_media",
    "contact_person": "John Smith",
    "contact_email": "john@example.com",
    "contact_phone": "(555) 123-4567",
    "company_name": "Acme Corp",
    "industry": "Technology",
    "website": "https://acme.com",
    "priority": "high",
    "status": "active"
  }')

BIZDEV_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "✅ Created BizDev Source: $BIZDEV_ID"
echo ""

# Step 2: Promote to Lead
echo "[2] Promoting BizDev Source to Lead (B2B)..."
PROMOTE_RESPONSE=$(curl -s -X POST "$BASE_URL/bizdevsources/$BIZDEV_ID/promote" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "'$TENANT_ID'",
    "client_type": "B2B"
  }')

LEAD_ID=$(echo "$PROMOTE_RESPONSE" | grep -o '"lead":{"id":"[^"]*' | cut -d'"' -f4)
ACCOUNT_ID=$(echo "$PROMOTE_RESPONSE" | grep -o '"account_id":"[^"]*' | cut -d'"' -f4)
LEAD_TYPE=$(echo "$PROMOTE_RESPONSE" | grep -o '"lead_type":"[^"]*' | cut -d'"' -f4)

echo "Response:"
echo "$PROMOTE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$PROMOTE_RESPONSE"
echo ""

if [ -n "$LEAD_ID" ]; then
  echo "✅ Promotion successful!"
  echo "   Lead ID: $LEAD_ID"
  echo "   Account ID: $ACCOUNT_ID"
  echo "   Lead Type: $LEAD_TYPE"
  echo ""
  
  # Step 3: Verify Lead was created
  echo "[3] Verifying Lead creation..."
  LEAD=$(curl -s "$BASE_URL/leads/$LEAD_ID?tenant_id=$TENANT_ID")
  echo "$LEAD" | python3 -m json.tool 2>/dev/null || echo "$LEAD"
  echo ""
  
  echo "✅ Test Complete!"
else
  echo "❌ Promotion failed"
  echo "$PROMOTE_RESPONSE"
  exit 1
fi
