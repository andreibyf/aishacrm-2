#!/bin/bash

# Cleanup test records created during AI creation tests
BASE_URL="http://localhost:4001/api"
TENANT_ID="6cb4c008-4847-426a-9a2e-918ad70e7b69"

echo "================================================"
echo "🧹 CLEANUP TEST RECORDS"
echo "================================================"
echo ""

# Delete leads created by AI tests (Michael Roberts and TestAI Lead)
echo "Deleting test leads..."
DELETE_LEADS=$(curl -s -X DELETE "$BASE_URL/v2/leads?tenant_id=$TENANT_ID&first_name=Michael&last_name=Roberts" \
  -H "Content-Type: application/json")

echo "Deleted Michael Roberts leads"

DELETE_TESTAI=$(curl -s -X DELETE "$BASE_URL/v2/leads?tenant_id=$TENANT_ID&first_name=TestAI&last_name=Lead" \
  -H "Content-Type: application/json")

echo "Deleted TestAI Lead"

# Delete test contacts
echo ""
echo "Deleting test contacts..."
DELETE_CONTACTS=$(curl -s -X DELETE "$BASE_URL/v2/contacts?tenant_id=$TENANT_ID&first_name=Emma&last_name=Wilson" \
  -H "Content-Type: application/json")

echo "Deleted Emma Wilson contact"

DELETE_TESTAI_CONTACT=$(curl -s -X DELETE "$BASE_URL/v2/contacts?tenant_id=$TENANT_ID&first_name=TestAI&last_name=Contact" \
  -H "Content-Type: application/json")

echo "Deleted TestAI Contact"

# Delete test BizDev sources
echo ""
echo "Deleting test BizDev sources..."
DELETE_BIZDEV=$(curl -s -X DELETE "$BASE_URL/bizdevsources?tenant_id=$TENANT_ID&contact_person=Sarah%20Chen" \
  -H "Content-Type: application/json")

echo "Deleted Sarah Chen BizDev source"

echo ""
echo "================================================"
echo "✅ Cleanup Complete"
echo "================================================"
