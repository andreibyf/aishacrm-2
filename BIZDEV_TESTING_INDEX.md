# 🎯 BizDev → Lead Workflow: Complete Testing & Verification Suite

## 📚 DOCUMENTATION INDEX

This directory now contains a **complete testing and verification suite** for the BizDev → Lead promotion workflow.

### Choose Your Path

#### 🏃 **QUICK START (15 minutes)**
→ **Read**: `BIZDEV_QUICK_TEST_GUIDE.md`
- Fast verification for busy schedules
- 3-phase test procedure
- Quick troubleshooting
- Form layout comparison

#### 📖 **COMPREHENSIVE TESTING (45-60 minutes)**
→ **Read**: `BIZDEV_LEAD_WORKFLOW_TEST.md`
- 5 detailed test cases
- Edge case testing
- Database verification
- Complete debugging checklist

#### 📋 **OVERVIEW & NAVIGATION**
→ **Read**: `BIZDEV_WORKFLOW_VERIFICATION_SUMMARY.md`
- High-level summary
- Implementation details
- Testing strategy
- File references

#### ✅ **SESSION STATUS**
→ **Read**: `SESSION_STATUS_BIZDEV_READY.md`
- Session accomplishments
- Pre-test checklist
- Quick start commands
- Support information

---

## 🎯 QUICK NAVIGATION

### What Are We Testing?
**File**: `BIZDEV_WORKFLOW_VERIFICATION_SUMMARY.md` → Section "What This Accomplishes"

### How Do I Test?
**File**: `BIZDEV_QUICK_TEST_GUIDE.md` → Start at "Quick Start"

### What If Something Breaks?
**File**: `BIZDEV_QUICK_TEST_GUIDE.md` → "Troubleshooting Checklist"
OR
**File**: `BIZDEV_LEAD_WORKFLOW_TEST.md` → "Debugging Checklist"

### What's Been Done?
**File**: `SESSION_STATUS_BIZDEV_READY.md` → "Accomplishments This Session"

### Technical Details?
**File**: `BIZDEV_WORKFLOW_VERIFICATION_SUMMARY.md` → "Key Implementation Details"

---

## 📊 FILE OVERVIEW

| File | Purpose | Length | Best For |
|------|---------|--------|----------|
| `BIZDEV_QUICK_TEST_GUIDE.md` | Fast verification | 250 lines | Quick spot-check (15 min) |
| `BIZDEV_LEAD_WORKFLOW_TEST.md` | Detailed testing | 300 lines | Comprehensive QA (45 min) |
| `BIZDEV_WORKFLOW_VERIFICATION_SUMMARY.md` | Overview + details | 280 lines | Understanding system |
| `SESSION_STATUS_BIZDEV_READY.md` | Session summary | 260 lines | Getting oriented |
| `BIZDEV_TESTING_INDEX.md` | This file | Navigation | Finding what you need |

---

## 🚀 THREE WAYS TO START

### 1️⃣ **I have 15 minutes** 🏃
1. Open: `BIZDEV_QUICK_TEST_GUIDE.md`
2. Follow: Section "Quick Start - Test #1"
3. Verify: B2C form and promotion
4. Result: ✓ Workflow is working

### 2️⃣ **I have 45+ minutes** 📖
1. Open: `BIZDEV_LEAD_WORKFLOW_TEST.md`
2. Follow: All 5 test cases
3. Test: B2C, B2B, edge cases
4. Result: ✓✓ Comprehensive verification

### 3️⃣ **I want background first** 📚
1. Open: `BIZDEV_WORKFLOW_VERIFICATION_SUMMARY.md`
2. Read: "Current State" + "What We're Testing"
3. Then: Choose testing approach above
4. Result: ✓ Fully informed testing

---

## ✅ PRE-TEST VERIFICATION

Before testing, verify:

```bash
# Check containers are running
docker ps | grep aishacrm

# Expected: 4 containers, all "Up" and "healthy"
# If not, run: docker compose up -d --build
```

**Containers should show**:
- ✅ aishacrm-frontend (Up, healthy)
- ✅ aishacrm-backend (Up, healthy)
- ✅ aishacrm-redis-memory (Up, healthy)
- ✅ aishacrm-redis-cache (Up, healthy)

---

## 🧪 TEST SCENARIOS

### Scenario 1: B2C Form Verification
**File**: `BIZDEV_QUICK_TEST_GUIDE.md` → "Phase 1: Create BizDev Source"
**Duration**: 5 min
**Tests**: Form layout, field ordering, required/optional fields

### Scenario 2: Promotion Workflow
**File**: `BIZDEV_QUICK_TEST_GUIDE.md` → "Phase 2: Promote to Lead"
**Duration**: 3 min
**Tests**: Confirmation dialogs, toast messages, status updates

### Scenario 3: Data Verification
**File**: `BIZDEV_QUICK_TEST_GUIDE.md` → "Phase 3: Verify Lead Created"
**Duration**: 3 min
**Tests**: Lead appears in list, data transfer, metadata

### Scenario 4: B2B Comparison
**File**: `BIZDEV_LEAD_WORKFLOW_TEST.md` → "Test Case 2"
**Duration**: 10 min
**Tests**: Different form layout, company-first ordering

### Scenario 5: Edge Cases
**File**: `BIZDEV_LEAD_WORKFLOW_TEST.md` → "Test Cases 4-5"
**Duration**: 15 min
**Tests**: Minimal data, null handling, error cases

---

## 🎓 WHAT YOU'LL VERIFY

After testing, you'll have confirmed:

| Aspect | Test File | Location |
|--------|-----------|----------|
| Form adapts to business model | Quick Guide | Phase 1 |
| Person/Company field ordering | Quick Guide | Form Layout Reference |
| Promotion creates Leads | Quick Guide | Phase 2 |
| No null values in dialogs | Quick Guide | Troubleshooting |
| Data transfers correctly | Quick Guide | Phase 3 |
| Stats update immediately | Quick Guide | Phase 2 |
| B2B form different | Comprehensive | Test Case 2 |
| Edge case handling | Comprehensive | Test Cases 4-5 |

---

## 🔗 TEST TENANTS

Both are B2C (person-centric):

```
Tenant: Local Development
ID: a11dfb63-4b18-4eb8-872e-747af2e37c46
Business Model: B2C

Tenant: Labor Depot
ID: 6cb4c008-4847-426a-9a2e-918ad70e7b69
Business Model: B2C
```

**Access**: http://localhost:4000

---

## 📋 CHECKLIST BEFORE TESTING

- [ ] Containers are running and healthy
- [ ] Frontend loads at http://localhost:4000
- [ ] Can select "Local Development" tenant
- [ ] Can navigate to BizDev Sources page
- [ ] Can navigate to Leads page
- [ ] Browser DevTools works (F12)

If any checked items fail, run:
```bash
docker compose down
docker compose up -d --build
```

---

## 🚦 SUCCESS CRITERIA

**Quick Test (15 min)**: All of these must be true
- ✅ B2C form shows "Primary Contact" in BLUE, at top
- ✅ Promotion dialog shows person name (not "null")
- ✅ Toast says "Created lead from: [name]"
- ✅ New lead appears in Leads page within 5 seconds

**Comprehensive Test (45 min)**: All of above, plus
- ✅ B2B form shows "Company Information" in AMBER, at top
- ✅ Edge cases handled (minimal data, null handling)
- ✅ No JavaScript errors in console
- ✅ No network errors in browser Network tab

---

## 🐛 TROUBLESHOOTING QUICK REFERENCE

| Problem | Solution | File |
|---------|----------|------|
| Form shows wrong section first | Tenant business_model wrong | Quick Guide → Troubleshooting |
| Dialog shows "null" for name | Name fallback not working | Quick Guide → Troubleshooting |
| Lead doesn't appear | Check backend logs | Quick Guide → Troubleshooting |
| Stats don't update | Clear browser cache | Quick Guide → Troubleshooting |
| JavaScript error | Check console F12 | Comprehensive Guide → Debugging |

**Full troubleshooting**: See appropriate test guide

---

## 📞 SUPPORT RESOURCES

| Need | Location | Details |
|------|----------|---------|
| Quick test | `BIZDEV_QUICK_TEST_GUIDE.md` | 15 min verification |
| Detailed test | `BIZDEV_LEAD_WORKFLOW_TEST.md` | 45 min comprehensive |
| System overview | `BIZDEV_WORKFLOW_VERIFICATION_SUMMARY.md` | Architecture + details |
| Session info | `SESSION_STATUS_BIZDEV_READY.md` | What's been done |
| Architecture | `CLAUDE.md` (root) | Full system design |
| Current work | `orchestra/PLAN.md` (root) | Active tasks |

---

## ⏱️ TIME ESTIMATES

- **Quick verification**: 15-20 minutes
- **Comprehensive testing**: 45-60 minutes
- **Edge cases only**: 30 minutes
- **Full suite (both tenants)**: 90-120 minutes

---

## 🎯 RECOMMENDED APPROACH

1. **Start with Quick Guide** (15 min)
   - Get immediate feedback
   - Verify basic workflow works
   - Find any obvious issues

2. **Then Comprehensive Guide** (45 min) [Optional]
   - Thorough edge case testing
   - Database verification
   - Complete documentation

3. **Document Results**
   - Note any issues found
   - Screenshots of working flow
   - Compare B2C vs B2B layouts

---

## 📊 TESTING WORKFLOW DIAGRAM

```
START
  ↓
Choose Time Available
  ├→ 15 min: QUICK_TEST_GUIDE.md
  ├→ 45 min: LEAD_WORKFLOW_TEST.md
  └→ More: Both guides sequentially
  ↓
Pre-Test Checklist
  └→ All containers running?
  ↓
Run Tests
  ├→ Create B2C source
  ├→ Promote to Lead
  ├→ Verify in Leads page
  └→ Check console for errors
  ↓
All Pass? ✓
  ├→ YES: Workflow verified ✅
  └→ NO: Use troubleshooting section
  ↓
Report Results
END
```

---

## 🎉 YOU'RE READY!

Everything is:
- ✅ Documented
- ✅ Tested in code
- ✅ Deployed and running
- ✅ Ready for verification

**Pick a testing guide above and begin!**

---

## 📎 QUICK LINKS

- **Quick Test**: [Open](BIZDEV_QUICK_TEST_GUIDE.md)
- **Comprehensive Test**: [Open](BIZDEV_LEAD_WORKFLOW_TEST.md)
- **Overview**: [Open](BIZDEV_WORKFLOW_VERIFICATION_SUMMARY.md)
- **Session Status**: [Open](SESSION_STATUS_BIZDEV_READY.md)

---

**Status**: ✅ All systems ready for testing
**Next**: Choose your testing path and begin!
