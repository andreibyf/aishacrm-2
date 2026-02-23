# Pre-Commit & Pre-Push Test Analysis

## ✅ YES - Tests ARE Wired Into Git Hooks

### Current Git Hook Configuration

**Pre-Commit Hook** (`.husky/pre-commit`)

- ✅ Runs lint-staged (ESLint + Prettier)
- ✅ Runs Braid core tests
- ❌ Does NOT run full backend test suite

**Pre-Push Hook** (`.husky/pre-push`)

- ✅ Runs ESLint
- ✅ Runs build
- ✅ Runs frontend tests (Vitest)
- ✅ **Runs backend tests in Docker** ← YOUR TEST FILES RUN HERE!

### How Your Tests Run

**Command:** `docker exec aishacrm-backend npm test`

**What it runs:** (from `package.json`)

```bash
NODE_ENV=test node --test --test-force-exit --test-timeout=120000 \
  __tests__/**/*.test.js \
  lib/care/*.test.js \
  lib/care/__tests__/*.test.js
```

**This includes:**

- ✅ ALL 47 test files in `__tests__/routes/`
- ✅ `leads.route.test.js` ← The one we fixed
- ✅ `contacts.route.test.js`
- ✅ `accounts.route.test.js`
- ✅ ALL other route tests

## 🚨 IMPORTANT IMPLICATIONS

### What This Means

1. **Every git push runs these tests**
   - If tests create bad data, it pollutes the database
   - If tests fail, your push is blocked
   - Tests run in Docker container

2. **Test data IS being created on every push**
   - Currently WITHOUT `is_test_data` flag
   - Currently WITHOUT proper timestamps
   - Currently polluting your database

3. **The fixed test files will:**
   - ✅ Create properly flagged test data
   - ✅ Add all required timestamps
   - ✅ Use cleanable email patterns
   - ✅ Still pass all tests

### Why This Matters NOW

**BEFORE FIX:**

```bash
git push
→ Pre-push runs
→ Backend tests run
→ Creates 47+ test records
→ ❌ No is_test_data flag
→ ❌ No timestamps
→ ❌ Records pollute production data
→ ❌ Cleanup scripts can't find them
```

**AFTER FIX:**

```bash
git push
→ Pre-push runs
→ Backend tests run
→ Creates 47+ test records
→ ✅ All have is_test_data: true
→ ✅ All have timestamps
→ ✅ All use @example.com
→ ✅ Cleanup scripts work
```

## 🎯 Action Plan - URGENT

### Priority: Fix Tests BEFORE Next Push

Since tests run on every push, you should fix them SOON to prevent more data pollution.

### Quick Fix Strategy

**Option 1: Fix Just the Critical Ones (30 minutes)**
Fix the tests that create the most records:

1. ✅ leads.route.test.js (we have .FIXED)
2. contacts.route.test.js
3. accounts.route.test.js
4. activities.route.test.js
5. opportunities.route.test.js

**Option 2: Fix All At Once (2-4 hours)**

- Apply the pattern to all 47 test files
- Use the TestFactory everywhere
- One big cleanup

**Option 3: Disable Tests Temporarily**

```bash
# In .husky/pre-push, comment out backend tests section
# ONLY do this temporarily while fixing!
```

### Recommended: Quick Win First

```bash
# 1. Fix the example we created
cp backend/__tests__/routes/leads.route.test.FIXED.js \
   backend/__tests__/routes/leads.route.test.js

# 2. Test it locally
docker exec aishacrm-backend npm test -- __tests__/routes/leads.route.test.js

# 3. If it passes, commit
git add backend/__tests__/routes/leads.route.test.js
git add backend/__tests__/helpers/test-entity-factory.js
git commit -m "fix: Add TestFactory to leads tests - proper timestamps and test flags"

# 4. Push (this will trigger pre-push hook with fixed test)
git push
```

## 📊 Current Test Execution Flow

```
Developer: git push
    ↓
.husky/pre-push hook triggers
    ↓
[1/4] ESLint ✓
[2/4] Build ✓
[3/4] Frontend tests ✓
[4/4] Backend tests
    ↓
docker exec aishacrm-backend npm test
    ↓
Runs: __tests__/**/*.test.js
    ↓
Creates test data:
  - leads.route.test.js creates 2 leads
  - contacts.route.test.js creates 2 contacts
  - accounts.route.test.js creates accounts
  - opportunities.route.test.js creates opps
  - ... x 47 files
    ↓
Currently: ❌ No proper flags
After fix: ✅ All properly flagged
```

## 🔧 Should You Add Test Data Validation to Pre-Commit?

### Option: Add Audit to Pre-Commit

You could add a pre-commit check to prevent bad test data:

```bash
# Add to .husky/pre-commit after lint-staged:

echo "Step 3/3: Validating test data patterns..."
node backend/__tests__/audit-test-data-creation.js
if [ $? -ne 0 ]; then
  echo ""
  echo "FAIL: Test files create entities without proper flags"
  echo "Run: node backend/__tests__/auto-fix-test-data.js --fix"
  exit 1
fi
```

**Pros:**

- Prevents new test files with bad patterns
- Catches issues early
- Forces developers to use TestFactory

**Cons:**

- Adds ~5 seconds to every commit
- Might be annoying during rapid development
- Only helps AFTER you fix existing files

### Recommendation

1. **First:** Fix existing test files (Priority!)
2. **Then:** Consider adding audit to pre-commit
3. **Document:** Add TestFactory to developer guide

## 📝 Summary

**Tests ARE wired into git hooks:**

- ✅ Pre-push runs ALL backend tests
- ✅ This includes all 47 route test files
- ✅ Tests create data on EVERY push

**Current Impact:**

- ❌ Every push creates improperly flagged test data
- ❌ Database gets polluted with unflagged records
- ❌ Lead age reports show incorrect data

**Fix Priority: HIGH**

- Fix tests BEFORE next push
- Start with the .FIXED example we created
- Apply pattern to remaining files

**Next Steps:**

1. Copy leads.route.test.FIXED.js to leads.route.test.js
2. Test it: `docker exec aishacrm-backend npm test`
3. Commit and push
4. Fix remaining files using same pattern

---

**Bottom line:** Fix these ASAP because every git push is creating bad test data! 🚨
