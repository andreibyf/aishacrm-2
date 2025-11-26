# Manual Test Checklist - Form Validation

Use this checklist to manually verify form validation and schema alignment.

## Prerequisites
- ✅ Frontend container running on http://localhost:4000
- ✅ Backend container running on http://localhost:4001
- ✅ Logged in as admin@aishacrm.com

---

## Employee Form Tests

### Test 1: Minimal Required Fields
**Steps:**
1. Navigate to `/employees`
2. Click "Create Employee"
3. Fill ONLY:
   - First Name: "Test"
   - Last Name: "Employee"
4. Click "Create Employee"

**Expected Result:** ✅ Success - Employee created

---

### Test 2: Missing First Name
**Steps:**
1. Navigate to `/employees`
2. Click "Create Employee"
3. Fill ONLY:
   - Last Name: "Employee"
4. Click "Create Employee"

**Expected Result:** ❌ Error - "First name is required"

---

### Test 3: Missing Last Name
**Steps:**
1. Navigate to `/employees`
2. Click "Create Employee"
3. Fill ONLY:
   - First Name: "Test"
4. Click "Create Employee"

**Expected Result:** ❌ Error - "Last name is required"

---

### Test 4: CRM Access Without Email
**Steps:**
1. Navigate to `/employees`
2. Click "Create Employee"
3. Fill:
   - First Name: "Test"
   - Last Name: "User"
   - Check "Enable CRM access"
4. Click "Create Employee"

**Expected Result:** ❌ Error - "Email is required for CRM access requests"

---

### Test 5: Visual Indicators
**Steps:**
1. Navigate to `/employees`
2. Click "Create Employee"

**Expected Results:**
- ✅ First Name has red asterisk (*)
- ✅ Last Name has red asterisk (*)
- ✅ Email does NOT have asterisk
- ✅ Form footer shows "* Required fields"
- ✅ When "Enable CRM access" checked, Email shows asterisk (*)

---

## Account Form Tests

### Test 6: Minimal Required Fields
**Steps:**
1. Navigate to `/accounts`
2. Click "Create Account"
3. Fill ONLY:
   - Account Name: "Test Company"
4. Click "Create Account"

**Expected Result:** ✅ Success - Account created

---

### Test 7: Missing Account Name
**Steps:**
1. Navigate to `/accounts`
2. Click "Create Account"
3. Leave Account Name empty
4. Click "Create Account"

**Expected Result:** ❌ Browser validation or error - Name required

---

### Test 8: Visual Indicators
**Steps:**
1. Navigate to `/accounts`
2. Click "Create Account"

**Expected Results:**
- ✅ Account Name has red asterisk (*)
- ✅ Email does NOT have asterisk
- ✅ Form footer shows "* Required fields"

---

## Contact Form Tests

### Test 9: Only First Name
**Steps:**
1. Navigate to `/contacts`
2. Click "Create Contact"
3. Fill ONLY:
   - First Name: "FirstOnly"
4. Click "Create Contact"

**Expected Result:** ✅ Success - Contact created

---

### Test 10: Only Last Name
**Steps:**
1. Navigate to `/contacts`
2. Click "Create Contact"
3. Fill ONLY:
   - Last Name: "LastOnly"
4. Click "Create Contact"

**Expected Result:** ✅ Success - Contact created

---

### Test 11: Neither Name
**Steps:**
1. Navigate to `/contacts`
2. Click "Create Contact"
3. Leave both names empty
4. Click "Create Contact"

**Expected Result:** ❌ Error - "At least first name or last name is required"

---

### Test 12: Visual Indicators
**Steps:**
1. Navigate to `/contacts`
2. Click "Create Contact"

**Expected Results:**
- ✅ First Name has red asterisk (*) with text "(or Last Name required)"
- ✅ Last Name has red asterisk (*) with text "(or First Name required)"

---

## Lead Form Tests

### Test 13: Only First Name
**Steps:**
1. Navigate to `/leads`
2. Click "Create Lead"
3. Fill ONLY:
   - First Name: "LeadFirst"
4. Click "Create Lead"

**Expected Result:** ✅ Success - Lead created

---

### Test 14: Only Last Name
**Steps:**
1. Navigate to `/leads`
2. Click "Create Lead"
3. Fill ONLY:
   - Last Name: "LeadLast"
4. Click "Create Lead"

**Expected Result:** ✅ Success - Lead created

---

### Test 15: Neither Name
**Steps:**
1. Navigate to `/leads`
2. Click "Create Lead"
3. Leave both names empty
4. Click "Create Lead"

**Expected Result:** ❌ Error - "At least first name or last name is required"

---

### Test 16: Visual Indicators
**Steps:**
1. Navigate to `/leads`
2. Click "Create Lead"

**Expected Results:**
- ✅ First Name has red asterisk (*) with text "(or Last Name required)"
- ✅ Last Name has red asterisk (*) with text "(or First Name required)"
- ✅ Email shows "(Optional)" label

---

## Opportunity Form Tests

### Test 17: Minimal Required Fields
**Steps:**
1. Navigate to `/opportunities`
2. Click "Create Opportunity"
3. Fill ONLY:
   - Name: "Test Deal"
4. Click "Create Opportunity"

**Expected Result:** ✅ Success - Opportunity created

---

### Test 18: Missing Name
**Steps:**
1. Navigate to `/opportunities`
2. Click "Create Opportunity"
3. Leave Name empty
4. Click "Create Opportunity"

**Expected Result:** ❌ Error - "Please fill in the required field: Name"

---

### Test 19: Without Amount or Date
**Steps:**
1. Navigate to `/opportunities`
2. Click "Create Opportunity"
3. Fill ONLY:
   - Name: "No Amount Deal"
4. Leave Amount and Expected Close Date empty
5. Click "Create Opportunity"

**Expected Result:** ✅ Success - Opportunity created

---

### Test 20: Visual Indicators
**Steps:**
1. Navigate to `/opportunities`
2. Click "Create Opportunity"

**Expected Results:**
- ✅ Name field has red asterisk (*)
- ✅ Amount does NOT have asterisk
- ✅ Expected Close Date does NOT have asterisk

---

## Summary

### Expected Pass Rate: 20/20 tests

**If all tests pass:**
- ✅ Forms correctly enforce only required fields
- ✅ Visual indicators match actual requirements
- ✅ Database accepts minimal valid data
- ✅ Schema alignment is correct

**If tests fail:**
- Check browser console for errors
- Check backend logs: `docker logs aishacrm-backend`
- Verify containers are running: `docker ps`
- Ensure database migration was applied

---

## Quick Test Commands

```powershell
# Run automated tests
.\run-validation-tests.ps1

# Check container status
docker ps

# View backend logs
docker logs aishacrm-backend --tail 50

# Rebuild containers if needed
docker-compose up -d --build

# Check database schema
cd backend
node validate-all-schemas.js
```
