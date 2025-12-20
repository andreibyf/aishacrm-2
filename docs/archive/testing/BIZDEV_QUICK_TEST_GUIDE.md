# BizDev → Lead Promotion Workflow - Quick Test Reference

## 🎯 GOAL: Verify end-to-end B2C workflow
**Create BizDev Source → Promote to Lead → Verify appearance in Leads page**

---

## 📋 TEST TENANTS (Both B2C)

| Tenant | ID | URL |
|--------|----|----|
| **Local Development** | `a11dfb63-4b18-4eb8-872e-747af2e37c46` | http://localhost:4000 |
| **Labor Depot** | `6cb4c008-4847-426a-9a2e-918ad70e7b69` | http://localhost:4000 |

---

## 🚀 QUICK START - Test #1: B2C Source Creation & Promotion

### Phase 1: Create BizDev Source (5 min)
```
1. Navigate to: http://localhost:4000 → BizDev Sources
2. Tenant: Select "Local Development" or first available B2C tenant
3. Click "Add Source"

✅ FORM VERIFICATION - Should see TWO sections:
   [Highlighted BLUE] ← Primary Contact (Person Name, Email, Phone)
   [Then below] ← Address & Details
   
4. Fill Test Data:
   Source Name: "Test B2C - Jane Smith"
   Person Name: "Jane Smith" (marked REQUIRED with red *)
   Email: "jane.smith@example.com" (marked REQUIRED)
   Phone: "+1-415-555-1234" (optional)
   
5. Submit → Verify:
   ✓ Source appears in list
   ✓ Status badge shows "Active"
   ✓ Stats show: "1 Active"
```

### Phase 2: Promote to Lead (3 min)
```
1. Click on "Test B2C - Jane Smith" in list
2. Detail panel opens on right
3. Click "Promote to Lead" button (green outline)

✅ CONFIRM DIALOG - Browser popup should show:
   ✓ "Are you sure you want to promote "Jane Smith" to a Lead?"
   
4. Click OK

✅ IN-PANEL ALERT - Green alert should show:
   ✓ "Promote to Lead?"
   ✓ "This will create a Lead from Jane Smith"
   ✓ "Confirm Promotion" button (green)
   
5. Click "Confirm Promotion"

✅ SUCCESS - Toast notification:
   ✓ "BizDev source promoted to lead"
   ✓ "Created lead from: Jane Smith"
   ✓ Detail panel closes
   ✓ Source status changes to "Promoted"
   ✓ Stats show: "1 Promoted" (Active drops to 0)
```

### Phase 3: Verify Lead Created (3 min)
```
1. Navigate to: BizDev Sources → LEADS (top menu)
2. Search: Type "Jane Smith"

✅ LEAD APPEARS - Should see new row:
   First Name: "Jane"
   Last Name: "Smith"
   Email: "jane.smith@example.com"
   Phone: "+1-415-555-1234"
   Company: [B2C Placeholder account name]
   Lead Type: "B2C" (check metadata or detail view)
   Status: "New" (default)
   
3. Click to open Lead detail
   
✅ DETAIL PANEL - Verify metadata:
   ✓ Email: jane.smith@example.com
   ✓ Phone: +1-415-555-1234
   ✓ Address populated (if filled)
   ✓ Business Model indicator shows "B2C"
```

---

## 🔄 TEST #2: Compare with B2B Form Layout (Optional)

**Purpose**: Verify different form order for B2B tenants

```
1. If B2B tenant available:
   - Click "Add Source"
   - Verify form shows [Amber] Company section FIRST (Company Name, DBA, Website)
   - Contact Person is OPTIONAL (no red *)
   
2. If no B2B tenant:
   - Skip this test (both test tenants are B2C)
```

---

## 🚨 TROUBLESHOOTING CHECKLIST

### Issue: Form shows Company FIRST (wrong for B2C)
**Solution**: 
- Check tenant business_model in database: `SELECT business_model FROM tenant WHERE id = '...'`
- Should be `'b2c'` (lowercase)
- Refresh page and retry

### Issue: Confirm dialog shows "null" instead of name
**Solution**:
- Name fallback order: `company_name` → `dba_name` → `contact_person` → `source` → "this prospect"
- Check if these fields were filled on the form
- If still null: report bug with BizDev Source ID

### Issue: Lead doesn't appear in Leads page after promotion
**Solution**:
1. Check backend logs:
   ```bash
   docker logs aishacrm-backend -f
   ```
   Look for: `[Promote] Lead created:`

2. Clear browser cache (Ctrl+Shift+Del):
   - Cache: Clear all
   - Reload page

3. Verify directly in database:
   ```sql
   SELECT first_name, last_name, email FROM leads 
   WHERE email = 'jane.smith@example.com' 
   LIMIT 1;
   ```

### Issue: Stats don't update (still shows "1 Active" after promotion)
**Solution**:
- Refresh page (F5)
- Or navigate to different page and back
- Stats are derived from BizDev source status

---

## ✅ SUCCESS CRITERIA

**ALL of these must be true:**

1. ✅ B2C form shows "Primary Contact" section highlighted in BLUE
2. ✅ Person Name field is marked REQUIRED (red asterisk)
3. ✅ BizDev source promotion shows meaningful person name (not "null")
4. ✅ Confirmation dialogs reference "Lead" (not "Account")
5. ✅ After promotion, source status changes to "Promoted"
6. ✅ New lead appears in Leads page within 5 seconds
7. ✅ Lead contains all transferred data (name, email, phone, address)
8. ✅ No JavaScript errors in browser console
9. ✅ No timeout/network errors in Network tab

---

## 📊 FORM LAYOUT REFERENCE

### B2C Form Layout (CURRENT)
```
┌─────────────────────────────────┐
│ CLIENT TYPE: B2C               │  ← Header shows tenant type
├─────────────────────────────────┤
│ 📌 Source Information            │
│   • Source Name [text] *required │
│   • Batch ID [text]              │
├─────────────────────────────────┤
│ 👤 PRIMARY CONTACT (BLUE BOX)   │  ← B2C Focus: Person first
│   • Person Name [text] *required │  ← Red asterisk = REQUIRED
│   • Email [text] *required      │  ← Red asterisk = REQUIRED
│   • Phone [text]                │
├─────────────────────────────────┤
│ 📍 Address Information           │
│   • Address Line 1 [text]        │
│   • City [text]                  │
│   • State/Province [text]        │
│   • Postal Code [text]           │
│   • Country [select]             │
└─────────────────────────────────┘
```

### B2B Form Layout (EXPECTED)
```
┌─────────────────────────────────┐
│ CLIENT TYPE: B2B               │  ← Header shows tenant type
├─────────────────────────────────┤
│ 📌 Source Information            │
│   • Source Name [text] *required │
├─────────────────────────────────┤
│ 🏢 COMPANY INFO (AMBER BOX)      │  ← B2B Focus: Company first
│   • Company Name [text] *required│  ← Red asterisk = REQUIRED
│   • DBA Name [text]              │
│   • Industry [select]            │
│   • Website [url]                │
├─────────────────────────────────┤
│ 👤 Company Contact (OPTIONAL)    │
│   • Contact Person [text]        │  ← No asterisk = OPTIONAL
│   • Email [text]                 │
│   • Phone [text]                 │
├─────────────────────────────────┤
│ 📍 Address Information           │
│   • Address Line 1 [text]        │
│   • City [text]                  │
└─────────────────────────────────┘
```

---

## 🔍 DEBUGGING: Check Browser Console

**After each action, check for errors:**

```javascript
// Open DevTools (F12) → Console tab

✅ Expected: No red errors
❌ If you see: "Cannot read property X of null"
   → Check if required fields were filled

// Check network requests:
// 1. POST /api/bizdevsources (source creation)
// 2. POST /api/bizdevsources/:id/promote (promotion)
// 3. GET /api/leads or /api/v2/leads (lead verification)

✅ Status codes should be 200, 201, or 202
❌ If you see: 400, 401, 404, 500
   → Check error details in Response tab
```

---

## 📝 TESTING NOTES

- **Expected duration**: 15-20 minutes total (3 phases)
- **Test data**: Use realistic but fictional data (emails, names)
- **Tenants**: Both "Local Development" and "Labor Depot" should produce identical workflow
- **Repeat**: Run full test with second tenant to verify consistency

---

## 💾 COMMIT REFERENCE

All changes from this workflow are in commit:
```
refactor: UI/UX improvements and bug fixes...
- BizDev form reordering (B2C primary contact first)
- Promotion dialogs fixed (Lead not Account)
- Async AI context building (non-blocking)
- Entity page UI refresh timing (Activities, Leads, etc.)
```

Check git log for full details.

---

## 🎓 WHAT WE'RE TESTING

This workflow verification tests:

1. **Form Context Awareness**: Form adjusts layout based on tenant business model
2. **Promotion Workflow**: BizDev sources correctly create Leads (not Accounts)
3. **Data Transfer**: All BizDev source data properly transfers to Lead
4. **UI State Management**: Stats update, panels close, data appears immediately
5. **Error Handling**: Fallback names prevent null values in dialogs
6. **Multi-tenant Isolation**: Different tenants maintain separate sources/leads

✅ **If all tests pass**: B2C workflow is working correctly and ready for production
