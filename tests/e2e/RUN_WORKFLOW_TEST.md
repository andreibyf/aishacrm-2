# How to Run the Complete Workflow Test

## 🎬 Watch the Test in Action (Headed Mode)

This will open a browser window so you can observe each action:

```powershell
# Run in headed mode with slowed down actions
npx playwright test tests/e2e/complete-user-workflow.spec.ts --headed

# Run with Playwright Inspector for step-by-step debugging
npx playwright test tests/e2e/complete-user-workflow.spec.ts --debug

# Run with extra slow motion (2000ms per action)
npx playwright test tests/e2e/complete-user-workflow.spec.ts --headed --slow-mo=2000
```

## 🚀 Different Run Modes

### 1. **Headed Mode (Watch It Run)**
```powershell
npx playwright test tests/e2e/complete-user-workflow.spec.ts --headed
```
- Opens real browser window
- See each action as it happens
- Built-in 800ms pauses between major actions
- Console logs show progress

### 2. **Slow Motion Mode (Super Observable)**
```powershell
npx playwright test tests/e2e/complete-user-workflow.spec.ts --headed --slow-mo=2000
```
- Slows EVERY action by 2000ms (2 seconds)
- Perfect for presentations or learning
- Very detailed observation

### 3. **Debug Mode (Step Through)**
```powershell
npx playwright test tests/e2e/complete-user-workflow.spec.ts --debug
```
- Opens Playwright Inspector
- Step through each action manually
- Inspect elements, view console, examine network
- Full control over execution speed

### 4. **Headless Mode (Fast, No UI)**
```powershell
npx playwright test tests/e2e/complete-user-workflow.spec.ts
```
- Runs in background (no browser window)
- Fastest execution
- Good for CI/CD pipelines
- Console output only

### 5. **With HTML Report**
```powershell
npx playwright test tests/e2e/complete-user-workflow.spec.ts --reporter=html
npx playwright show-report
```
- Generates detailed HTML report
- Screenshots on failure
- Execution timeline
- Opens in browser after test

## 📋 Before Running

### Prerequisites:
1. **Backend running:** `http://localhost:4001`
2. **Frontend running:** `http://localhost:4000`
3. **SuperAdmin auth configured:** `.env` has credentials
4. **Database accessible:** Supabase connection working

### Quick Start Services:
```powershell
# From project root
docker-compose up -d

# Or use start script
.\start-all.ps1
```

## 🎯 What You'll See

The test will:
1. Navigate to Leads page → Search for lead
2. Navigate to Activities page → View scheduled call
3. Navigate to Accounts page → Search for converted account
4. Navigate to Opportunities page → Search for opportunity
5. Return to Activities page → View complete timeline

**Visual Indicators:**
- 🌐 Navigation events
- 🔍 Search operations
- ✅ Successful verifications
- Console logs at each step

## 📊 Understanding the Output

### Console Output:
```
🚀 Starting complete user workflow test...
👁️  Running in observable mode - actions will be slowed for visibility

📝 STEP 1: Creating new lead...
✅ Lead created: sarah.johnson.1731852000000@acmecorp.test (ID: abc-123)
   🌐 Navigating to: http://localhost:4000/Leads
   🔍 Searching for lead...
✅ Lead visible in UI

📋 STEP 2: Adding qualification note...
✅ Qualification note added

... (continues for all 14 steps)

✨ ===================================
✨  COMPLETE WORKFLOW TEST PASSED!
✨ ===================================
```

## 🐛 Troubleshooting

### Browser doesn't open:
```powershell
# Install browsers
npx playwright install chromium
```

### Test times out:
```powershell
# Increase timeout
npx playwright test tests/e2e/complete-user-workflow.spec.ts --headed --timeout=600000
```

### Want to see network calls:
```powershell
# Run with debug mode and open Network tab in Inspector
npx playwright test tests/e2e/complete-user-workflow.spec.ts --debug
```

### Services not running:
```powershell
# Check Docker containers
docker ps

# Check if ports are accessible
curl http://localhost:4000
curl http://localhost:4001/api/system/health
```

## 🎥 Recording the Test

To record video of the test execution:

```powershell
# Add to playwright.config.js or run with env var
$env:PLAYWRIGHT_VIDEO="on"
npx playwright test tests/e2e/complete-user-workflow.spec.ts --headed
```

Videos save to `test-results/` directory.

## 📝 Review Checklist

After running the test, review:
- [ ] `WORKFLOW_TEST_CHECKLIST.md` - Mark completed items
- [ ] Identify any gaps in coverage
- [ ] Note any UI issues observed
- [ ] Check console for errors/warnings
- [ ] Review test data in database

## 🔧 Adjusting Speed

The test has built-in pauses for observation:

| Action | Default Pause | Location |
|--------|---------------|----------|
| After navigation | 800ms | `navigateAndWaitForLoad()` |
| After search | 1500ms | Search operations |
| After verification | 1000ms | UI checks |
| Final timeline | 2000ms | End of test |

To adjust, edit the `page.waitForTimeout()` values in `complete-user-workflow.spec.ts`.

## 📖 Next Steps

1. **Run the test once in headed mode** to see baseline
2. **Review the checklist** to identify gaps
3. **Request additional test coverage** for missing features
4. **Run in debug mode** to understand specific steps
5. **Generate HTML report** for documentation

---

**For checklist and gaps analysis, see:** `WORKFLOW_TEST_CHECKLIST.md`
