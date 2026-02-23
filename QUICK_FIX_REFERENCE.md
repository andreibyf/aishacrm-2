# Quick Reference - Test Data Fixes

## ✅ Test Factory is Ready!

Location: `backend/__tests__/helpers/test-entity-factory.js`

## 📖 Before & After Examples

### Leads

**BEFORE (Broken):**

```javascript
const a = await createLead({
  first_name: 'Unit',
  last_name: 'TestA',
  email: `a_${Date.now()}@test.com`,
  company: 'UT',
  status: 'new',
});
```

**AFTER (Fixed):**

```javascript
import { TestFactory } from '../helpers/test-entity-factory.js';

const leadData = TestFactory.lead({
  first_name: 'Unit',
  last_name: 'TestA',
  company: 'UT',
  status: 'new',
  tenant_id: TENANT_ID,
});

const a = await createLead(leadData);
```

### Contacts

**BEFORE (Broken):**

```javascript
const a = await createContact({
  first_name: 'Unit',
  last_name: 'TestContactA',
  email: `contact_a_${Date.now()}@test.com`,
  phone: '555-0001',
  status: 'active',
});
```

**AFTER (Fixed):**

```javascript
import { TestFactory } from '../helpers/test-entity-factory.js';

const contactData = TestFactory.contact({
  first_name: 'Unit',
  last_name: 'TestContactA',
  phone: '555-0001',
  status: 'active',
  tenant_id: TENANT_ID,
});

const a = await createContact(contactData);
```

### Accounts

**BEFORE (Broken):**

```javascript
const a = await createAccount({
  name: 'Test Corp',
  industry: 'Technology',
  account_type: 'customer',
});
```

**AFTER (Fixed):**

```javascript
import { TestFactory } from '../helpers/test-entity-factory.js';

const accountData = TestFactory.account({
  name: 'Test Corp',
  industry: 'Technology',
  account_type: 'customer',
  tenant_id: TENANT_ID,
});

const a = await createAccount(accountData);
```

### Opportunities

**BEFORE (Broken):**

```javascript
const a = await createOpportunity({
  name: 'Big Deal',
  stage: 'prospecting',
  amount: 50000,
});
```

**AFTER (Fixed):**

```javascript
import { TestFactory } from '../helpers/test-entity-factory.js';

const oppData = TestFactory.opportunity({
  name: 'Big Deal',
  stage: 'prospecting',
  amount: 50000,
  tenant_id: TENANT_ID,
});

const a = await createOpportunity(oppData);
```

### Activities

**BEFORE (Broken):**

```javascript
const a = await createActivity({
  subject: 'Follow up call',
  type: 'call',
  status: 'pending',
});
```

**AFTER (Fixed):**

```javascript
import { TestFactory } from '../helpers/test-entity-factory.js';

const activityData = TestFactory.activity({
  subject: 'Follow up call',
  type: 'call',
  status: 'pending',
  tenant_id: TENANT_ID,
});

const a = await createActivity(activityData);
```

## 🎯 Key Points

### What TestFactory Adds Automatically:

- ✅ `created_at: "2026-02-22T17:30:00.000Z"`
- ✅ `created_date: "2026-02-22T17:30:00.000Z"`
- ✅ `updated_at: "2026-02-22T17:30:00.000Z"`
- ✅ `updated_date: "2026-02-22T17:30:00.000Z"`
- ✅ `is_test_data: true`
- ✅ `email: "entity-test-abc123@example.com"`
- ✅ `metadata: { is_test_data: true, test_run_id: "...", ... }`

### What You Keep:

- ✅ Business logic fields (first_name, last_name, status, etc.)
- ✅ Test-specific values
- ✅ Tenant ID
- ✅ Any custom fields

### What You Remove:

- ❌ Manual email generation (`email: 'test_${Date.now()}@test.com'`)
- ❌ Any timestamp fields (factory adds them)
- ❌ `is_test_data` if you were setting it manually

## 🔄 Pattern to Follow

For EVERY test file that creates entities:

1. **Add import at top:**

   ```javascript
   import { TestFactory } from '../helpers/test-entity-factory.js';
   ```

2. **Replace entity creation:**

   ```javascript
   // OLD:
   const data = { first_name: 'Test', email: 'test@test.com' };

   // NEW:
   const data = TestFactory.lead({ first_name: 'Test' });
   ```

3. **Keep your API call:**
   ```javascript
   // This stays the same:
   const result = await createLead(data);
   ```

## ✅ Checklist Per File

- [ ] Add `import { TestFactory }` statement
- [ ] Replace manual objects with `TestFactory.entity()`
- [ ] Remove manual email generation
- [ ] Remove timestamp fields
- [ ] Keep business fields
- [ ] Test the file: `npm test -- path/to/file.test.js`
- [ ] Commit if it passes

## 🚀 Start Here

1. Open: `backend/__tests__/routes/leads.route.test.FIXED.js`
2. Study the pattern
3. Apply to `backend/__tests__/routes/leads.route.test.js`
4. Test it works
5. Repeat for other files

---

**Files to fix:** All test files in `backend/__tests__/routes/`  
**Time per file:** ~2-5 minutes  
**Total estimated time:** ~2-4 hours for all files

**Or ask me to create more .FIXED examples!**
