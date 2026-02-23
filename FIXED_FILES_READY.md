# Fixed Test Files - Ready to Apply

## ✅ Fixed Files Created

I've created fixed versions of the 3 most critical test files:

### 1. Leads (DONE) ✅

**File:** `backend/__tests__/routes/leads.route.test.FIXED.js`

- Creates: 2 test leads per run
- Added: TestFactory with all timestamps and flags

### 2. Contacts (DONE) ✅

**File:** `backend/__tests__/routes/contacts.route.test.FIXED.js`

- Creates: 2-3 test contacts per run
- Added: TestFactory with all timestamps and flags

### 3. Accounts (DONE) ✅

**File:** `backend/__tests__/routes/accounts.route.test.FIXED.js`

- Creates: 2-3 test accounts per run
- Added: TestFactory with all timestamps and flags

## 🚀 How to Apply the Fixes

### Quick Method - Apply All 3 at Once

```bash
# Copy all fixed versions to originals
cp backend/__tests__/routes/leads.route.test.FIXED.js \
   backend/__tests__/routes/leads.route.test.js

cp backend/__tests__/routes/contacts.route.test.FIXED.js \
   backend/__tests__/routes/contacts.route.test.js

cp backend/__tests__/routes/accounts.route.test.FIXED.js \
   backend/__tests__/routes/accounts.route.test.js

# Test them all
docker exec aishacrm-backend npm test -- __tests__/routes/leads.route.test.js
docker exec aishacrm-backend npm test -- __tests__/routes/contacts.route.test.js
docker exec aishacrm-backend npm test -- __tests__/routes/accounts.route.test.js

# If all pass, commit
git add backend/__tests__/routes/*.js backend/__tests__/helpers/test-entity-factory.js
git commit -m "fix: Add TestFactory to leads/contacts/accounts tests - proper timestamps and test flags"
git push
```

### Safe Method - One at a Time

```bash
# 1. Fix leads first
cp backend/__tests__/routes/leads.route.test.FIXED.js \
   backend/__tests__/routes/leads.route.test.js

docker exec aishacrm-backend npm test -- __tests__/routes/leads.route.test.js

# If it passes:
git add backend/__tests__/routes/leads.route.test.js
git commit -m "fix: Add TestFactory to leads tests"

# 2. Fix contacts
cp backend/__tests__/routes/contacts.route.test.FIXED.js \
   backend/__tests__/routes/contacts.route.test.js

docker exec aishacrm-backend npm test -- __tests__/routes/contacts.route.test.js

# If it passes:
git add backend/__tests__/routes/contacts.route.test.js
git commit -m "fix: Add TestFactory to contacts tests"

# 3. Fix accounts
cp backend/__tests__/routes/accounts.route.test.FIXED.js \
   backend/__tests__/routes/accounts.route.test.js

docker exec aishacrm-backend npm test -- __tests__/routes/accounts.route.test.js

# If it passes:
git add backend/__tests__/routes/accounts.route.test.js
git commit -m "fix: Add TestFactory to accounts tests"

# 4. Commit test factory helper
git add backend/__tests__/helpers/test-entity-factory.js
git commit -m "feat: Add TestFactory helper for all test entities"

# 5. Push everything
git push
```

## 📊 What's Changed

### Before (Broken):

```javascript
const a = await createLead({
  first_name: 'Unit',
  email: `a_${Date.now()}@test.com`, // ❌ Wrong domain
  company: 'UT',
  // ❌ Missing: created_at, created_date, updated_at, updated_date
  // ❌ Missing: is_test_data: true
});
```

### After (Fixed):

```javascript
import { TestFactory } from '../helpers/test-entity-factory.js';

const leadData = TestFactory.lead({
  first_name: 'Unit',
  company: 'UT',
  tenant_id: TENANT_ID,
  // ✅ Auto-added: created_at, created_date, updated_at, updated_date
  // ✅ Auto-added: is_test_data: true
  // ✅ Auto-added: email with @example.com domain
});

const a = await createLead(leadData);
```

## ✅ Impact of These 3 Fixes

**These 3 files account for ~40% of test data creation:**

- Leads: Most frequently tested entity
- Contacts: Second most tested
- Accounts: Third most tested

**After fixing these:**

- ✅ 6-9 test records per push will be properly flagged
- ✅ Cleanup scripts will work for these entities
- ✅ Lead age reports will exclude these test records
- ✅ Pattern established for fixing remaining 44 files

## 🎯 Next Steps After Applying

1. **Verify it works:**

   ```bash
   # Run cleanup to verify test data is cleanable
   node backend/scripts/cleanup-test-data.js
   ```

2. **Check database:**

   ```sql
   SELECT is_test_data, COUNT(*)
   FROM leads
   WHERE email LIKE '%@example.com'
   GROUP BY is_test_data;

   -- Should show: is_test_data | count
   --              true         | X
   ```

3. **Fix remaining 44 files:**
   - Use the same pattern
   - Or ask me to create more .FIXED versions
   - Or use the auto-fix script (if we create it)

## 📋 Remaining Files to Fix

Still need to fix (in priority order):

### High Priority (Create many records):

- activities.route.test.js
- opportunities.route.test.js
- opportunities.v2.route.test.js

### Medium Priority:

- employees.route.test.js
- users.creation.test.js
- notes.route.test.js

### Lower Priority (Create fewer records):

- All other 38 test files in **tests**/routes/

## 🆘 Want More Help?

I can:

1. ✅ Create .FIXED versions of more files
2. ✅ Create a batch apply script
3. ✅ Help debug if tests fail
4. ✅ Create automated fix-all solution

Just say which you want!

---

**Ready to apply? Copy the commands above and run them!** 🚀

**Remember:** Every git push is creating bad test data, so apply these ASAP!
