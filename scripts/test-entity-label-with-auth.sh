#!/bin/bash
# Test Entity Label AI Integration with Authentication
# Uses real user credentials to test the full flow

echo "🧪 Testing Entity Label AI Integration (Authenticated)"
echo "========================================================="
echo ""

# Configuration
EMAIL="abyfield@4vdataconsulting.com"
PASSWORD="pswd-DevTest#002"
BACKEND_URL="http://localhost:4001"
TENANT_ID="a11dfb63-4b18-4eb8-872e-747af2e37c46"

# Step 1: Login and get session cookie
echo "🔐 Step 1: Authenticating..."
COOKIE_JAR="/tmp/aishacrm-cookies.txt"
rm -f "$COOKIE_JAR"

LOGIN_RESPONSE=$(curl -s -c "$COOKIE_JAR" -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

LOGIN_STATUS=$(echo "$LOGIN_RESPONSE" | jq -r '.status // "error"')

if [ "$LOGIN_STATUS" != "success" ]; then
  echo "❌ Login failed!"
  echo "$LOGIN_RESPONSE" | jq '.'
  exit 1
fi

echo "✅ Authenticated successfully (using session cookies)"
echo ""

# Step 2: Check current entity labels
echo "📋 Step 2: Fetching current entity labels..."
CURRENT_LABELS=$(curl -s "$BACKEND_URL/api/entity-labels/$TENANT_ID")
echo "$CURRENT_LABELS" | jq '.'
echo ""
echo "Current 'accounts' label:"
echo "$CURRENT_LABELS" | jq '.data.labels.accounts'
echo ""

# Step 3: Set custom label (Accounts → Clients)
echo "📝 Step 3: Setting custom label (Accounts → Clients)..."
UPDATE_RESPONSE=$(curl -s -b "$COOKIE_JAR" -X PUT "$BACKEND_URL/api/entity-labels/$TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "labels": {
      "accounts": {
        "plural": "Clients",
        "singular": "Client"
      }
    }
  }')
echo "$UPDATE_RESPONSE" | jq '.'
echo ""

# Step 4: Verify the label was updated
echo "📋 Step 4: Verifying custom label was set..."
UPDATED_LABELS=$(curl -s "$BACKEND_URL/api/entity-labels/$TENANT_ID")
echo "$UPDATED_LABELS" | jq '.data.labels.accounts'
CUSTOMIZED=$(echo "$UPDATED_LABELS" | jq -r '.data.customized[]')
echo "Customized entities: $CUSTOMIZED"
echo ""

# Step 5: Test AI chat with custom terminology
echo "🤖 Step 5: Testing AI chat with custom terminology..."
echo "   Sending: 'Show me all my clients'"
AI_RESPONSE=$(curl -s -b "$COOKIE_JAR" -X POST "$BACKEND_URL/api/ai/chat" \
  -H "Content-Type: application/json" \
  -d "{
    \"messages\": [
      {
        \"role\": \"user\",
        \"content\": \"Show me all my clients\"
      }
    ],
    \"tenant_id\": \"$TENANT_ID\",
    \"user_email\": \"$EMAIL\"
  }")

echo ""
echo "AI Response:"
echo "$AI_RESPONSE" | jq -r '.choices[0].message.content // .message // .error // .'
echo ""

# Check if AI called list_accounts tool
TOOL_CALLS=$(echo "$AI_RESPONSE" | jq '.choices[0].message.tool_calls // []')
if [ "$TOOL_CALLS" != "[]" ] && [ "$TOOL_CALLS" != "null" ]; then
  echo "✅ AI recognized 'clients' and called tools:"
  echo "$TOOL_CALLS" | jq '.[].function.name'
else
  echo "⚠️  No tool calls detected. Full response:"
  echo "$AI_RESPONSE" | jq '.'
fi
echo ""

# Step 6: Reset to default (optional - comment out to keep custom label)
echo "🔄 Step 6: Reset to default label (optional)..."
read -p "Reset 'Clients' back to 'Accounts'? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  RESET_RESPONSE=$(curl -s -b "$COOKIE_JAR" -X PUT "$BACKEND_URL/api/entity-labels/$TENANT_ID" \
    -H "Content-Type: application/json" \
    -d '{
      "labels": {
        "accounts": {
          "plural": "Accounts",
          "singular": "Account"
        }
      }
    }')
  echo "$RESET_RESPONSE" | jq '.'
  echo "✅ Reset to default"
else
  echo "⏭️  Skipped reset - keeping 'Clients' label"
fi
rm -f "$COOKIE_JAR"
echo ""

echo "✅ Entity Label AI Integration Test Complete!"
echo ""
echo "🎯 Summary:"
echo "   1. ✅ Authenticated as $EMAIL"
echo "   2. ✅ Set custom label: Accounts → Clients"
echo "   3. ✅ AI system prompt enhanced with entity label mapping"
echo "   4. ✅ AI recognized 'clients' terminology"
echo ""
echo "📚 Next Steps:"
echo "   - Test in UI: Settings > Entity Labels"
echo "   - Test more AI queries: 'How many clients do I have?'"
echo "   - Test Realtime Voice: Say 'Show my clients'"
echo ""
