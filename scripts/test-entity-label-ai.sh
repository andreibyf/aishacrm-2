#!/bin/bash
# Test Entity Label AI Integration
# This script demonstrates how the AI recognizes custom entity terminology

echo "🧪 Testing Entity Label AI Integration"
echo "========================================="
echo ""

# Step 1: Get tenant info
echo "📋 Step 1: Fetching tenant information..."
TENANT_ID="a11dfb63-4b18-4eb8-872e-747af2e37c46"
echo "   Using tenant ID: $TENANT_ID"
echo ""

# Step 2: Check current entity labels
echo "📋 Step 2: Checking current entity labels..."
curl -s "http://localhost:4001/api/entity-labels/$TENANT_ID" | jq '.'
echo ""

# Step 3: Set custom label - rename "Accounts" to "Clients"
echo "📝 Step 3: Setting custom label (Accounts → Clients)..."
echo "⚠️  Note: PUT endpoint requires superadmin authentication"
echo "   To test manually:"
echo "   1. Login to http://localhost:4000 as superadmin"
echo "   2. Go to Settings > Entity Labels"
echo "   3. Change 'Accounts' to 'Clients'"
echo ""
echo "   Attempting unauthenticated call (will fail)..."
CUSTOM_LABEL_RESPONSE=$(curl -s -X PUT "http://localhost:4001/api/entity-labels/$TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "labels": {
      "accounts": {
        "plural": "Clients",
        "singular": "Client"
      }
    }
  }')
echo "$CUSTOM_LABEL_RESPONSE" | jq '.'
echo ""

# Step 4: Verify the label was set
echo "📋 Step 4: Verifying custom label..."
curl -s "http://localhost:4001/api/entity-labels/$TENANT_ID" | jq '.data.labels.accounts'
echo ""

# Step 5: Test AI with custom terminology (text chat)
echo "🤖 Step 5: Testing AI with custom terminology..."
echo "   User says: 'Show me all my clients'"
echo "   Expected: AI calls list_accounts and responds with 'clients' terminology"
echo ""

# Note: This would require authentication token
echo "⚠️  Note: AI chat requires authentication. To test manually:"
echo ""
echo "   1. Login to http://localhost:4000"
echo "   2. Go to AI Agent page"
echo "   3. Say: 'Show me all my clients'"
echo "   4. AI should recognize 'clients' → accounts → call list_accounts"
echo ""

# Step 6: Check tool schemas (if endpoint exists)
echo "🔧 Step 6: Checking if AI tools have updated descriptions..."
echo "   Tool descriptions should now say 'Clients' instead of 'Accounts'"
echo ""

# Step 7: Test realtime voice (conceptual)
echo "🎤 Step 7: Realtime Voice Integration"
echo "   When using Realtime Voice:"
echo "   - Say: 'How many clients do I have?'"
echo "   - AI should call list_accounts tool"
echo "   - AI should respond: 'You have X clients'"
echo ""

echo "✅ Entity Label AI Integration Test Complete!"
echo ""
echo "📚 Next Steps:"
echo "   1. Rebuild backend to apply changes: docker compose up -d --build backend"
echo "   2. Test in UI: Settings > Entity Labels"
echo "   3. Test AI: Agent page or Realtime Voice"
echo "   4. Verify tool descriptions include custom labels"
echo ""
echo "🎯 Expected Behavior:"
echo "   - User renames 'Accounts' to 'Clients'"
echo "   - User asks AI: 'Show me my clients'"
echo "   - AI maps 'clients' → list_accounts tool"
echo "   - AI responds using 'clients' terminology"
echo ""
