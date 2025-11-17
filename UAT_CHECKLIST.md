# MCP Monitor - User Acceptance Testing Checklist

## Pre-Testing Setup
- [ ] All Docker containers running (frontend, backend, braid-mcp-server)
- [ ] Frontend accessible at http://localhost:4000
- [ ] Braid MCP accessible at http://localhost:8000
- [ ] Logged into application with valid credentials

---

## Test 1: Component Access
**Objective**: Verify enhanced component loads correctly

### Steps
1. [ ] Navigate to Settings in sidebar
2. [ ] Click "MCP Monitor" option
3. [ ] Wait for component to load (1-2 seconds)

### Expected Results
- [ ] 4 dashboard cards display (Availability, Performance, Security, Test Results)
- [ ] Blue alert banner shows at top
- [ ] "Test Controls" card visible
- [ ] "Activity Logs" card at bottom
- [ ] Initial health check runs automatically

### Troubleshooting
If component doesn't load:
```powershell
# Rebuild frontend
docker-compose up -d --build frontend

# Hard refresh browser (Ctrl+Shift+R)
```

---

## Test 2: Quick Health Check
**Objective**: Verify basic connectivity test works

### Steps
1. [ ] Locate "Quick Health Check" button in Test Controls card
2. [ ] Click the button
3. [ ] Observe button text changes to "Checking..." with spinner
4. [ ] Wait for completion (~50-200ms)

### Expected Results
- [ ] Button returns to "Quick Health Check" after test
- [ ] Availability card updates to "Healthy" (green checkmark)
- [ ] "Last checked" timestamp updates
- [ ] "Success streak" counter increments
- [ ] Activity log shows: "✓ Braid MCP server is healthy"
- [ ] No error messages appear

### Pass Criteria
- ✅ Availability status = "Healthy"
- ✅ Activity log shows success message
- ✅ No errors in browser console (F12)

---

## Test 3: Full Test Suite Execution
**Objective**: Run all 9 comprehensive adapter tests

### Steps
1. [ ] Locate "Run Full Test Suite (9 Tests)" button
2. [ ] Click the button
3. [ ] Observe button text changes to "Running Tests..." with spinner
4. [ ] Watch activity logs populate in real-time
5. [ ] Wait for all tests to complete (~2-5 seconds)

### Expected Results - Activity Logs (Real-time)
- [ ] Log: "🚀 Starting comprehensive MCP test suite..."
- [ ] Log: "Test 1/9: Braid server health check"
- [ ] Log: "✓ Health check passed (XXms)"
- [ ] Log: "Test 2/9: Web adapter - Wikipedia search"
- [ ] Log: "✓ Wikipedia search (XXms, X results)"
- [ ] Log: "Test 3/9: Web adapter - Get Wikipedia page"
- [ ] Log: "✓ Wikipedia page retrieval (XXms)"
- [ ] Log: "Test 4/9: CRM adapter - Search accounts"
- [ ] Log: "✓ CRM accounts search (XXms, X accounts)"
- [ ] Log: "Test 5/9: CRM adapter - Search leads"
- [ ] Log: "✓ CRM leads search (XXms, X leads)"
- [ ] Log: "Test 6/9: CRM adapter - Search contacts"
- [ ] Log: "✓ CRM contacts search (XXms, X contacts)"
- [ ] Log: "Test 7/9: Mock adapter"
- [ ] Log: "✓ Mock adapter (XXms)"
- [ ] Log: "Test 8/9: Batch actions (CRM + Web)"
- [ ] Log: "✓ Batch actions (XXms)"
- [ ] Log: "Test 9/9: Error handling validation"
- [ ] Log: "✓ Error handling (XXms)"
- [ ] Log: "✅ Test suite complete: 9/9 passed in XXXXms"

### Expected Results - Dashboard Cards
**Availability Card**:
- [ ] Status shows "Healthy" with green checkmark
- [ ] "Last checked" shows current timestamp
- [ ] "Success streak" shows count (≥9)

**Performance Card**:
- [ ] "XXX ms avg" displays (expect 150-300ms)
- [ ] "Error rate: 0.0%" displays
- [ ] Progress bar at 100% (green)

**Security Card**:
- [ ] "✓ Direct DB Access" shows with green checkmark
- [ ] "🔒 Service Role Key" displays
- [ ] "✓ Tenant isolated ✓" shows

**Test Results Card**:
- [ ] "9 / 9" displays
- [ ] "Avg: XXXms" shows average test time
- [ ] Progress bar at 100% (green)

### Expected Results - Test Results Section
- [ ] "Test Suite Results" header shows "9/9 Passed" badge (green)
- [ ] 9 rows display, each with:
  - [ ] Green checkmark (✓) icon
  - [ ] Test name (e.g., "Braid Health")
  - [ ] Response time in milliseconds
  - [ ] Details if applicable (e.g., "10 results", "0 records")
- [ ] "Total execution time" shows at bottom (expect 1500-3000ms)

### Pass Criteria
- ✅ All 9 tests show green checkmarks
- ✅ No red X marks appear
- ✅ Error rate = 0.0%
- ✅ Average response time < 500ms (excluding Wikipedia)
- ✅ Security card shows "Direct DB Access" with checkmark
- ✅ Activity logs show all success messages (green)

---

## Test 4: Performance Validation
**Objective**: Verify metrics are within acceptable ranges

### Performance Benchmarks
- [ ] Braid Health: < 200ms
- [ ] CRM Searches (each): < 300ms
- [ ] Wikipedia Search: < 2000ms (external API)
- [ ] Wikipedia Page: < 1000ms (external API)
- [ ] Mock Adapter: < 100ms
- [ ] Batch Actions: < 800ms
- [ ] Error Handling: < 200ms

### Average Response Time
- [ ] Overall average: < 500ms (acceptable)
- [ ] Overall average: < 300ms (excellent)

### Error Rate
- [ ] 0.0% = Perfect (all tests passed)
- [ ] < 10% = Acceptable (1 test failed)
- [ ] > 10% = Investigate (2+ tests failed)

---

## Test 5: Security Validation
**Objective**: Confirm security indicators are correct

### Checks
- [ ] "Direct DB Access" shows green checkmark (indicates USE_DIRECT_SUPABASE_ACCESS=true)
- [ ] "Service Role Key" displays with lock icon
- [ ] "Tenant isolated ✓" confirms multi-tenancy working
- [ ] CRM test logs mention "Direct Supabase" (check activity logs)

### Validation
If "Direct DB Access" is not checked:
1. Verify `docker-compose.yml` has `USE_DIRECT_SUPABASE_ACCESS=true`
2. Check logs: `docker logs braid-mcp-server`
3. Look for "Direct Supabase search successful" messages

---

## Test 6: Activity Logs Functionality
**Objective**: Verify logging works correctly

### Steps
1. [ ] Scroll to "Activity Logs" card at bottom
2. [ ] Verify logs are color-coded:
   - [ ] Green background = Success
   - [ ] Blue/Gray background = Info
   - [ ] Yellow background = Warning
   - [ ] Red background = Error
3. [ ] Check timestamps are in chronological order (newest first)
4. [ ] Click "Clear Logs" button
5. [ ] Verify logs are cleared
6. [ ] Run health check again to generate new logs

### Expected Results
- [ ] Logs cleared on button click
- [ ] New log entry added: "Logs cleared"
- [ ] Subsequent tests generate new logs

---

## Test 7: Backend MCP Servers Card
**Objective**: Check legacy server discovery

### Steps
1. [ ] Locate "Backend MCP Servers (Legacy)" card
2. [ ] Review displayed information

### Expected Results
- [ ] Either shows "No backend MCP servers configured" (expected)
- [ ] Or lists servers from `/api/mcp/servers` endpoint
- [ ] Card labeled as "Legacy" (since we now use Braid MCP Server)

---

## Test 8: Repeat Testing
**Objective**: Verify consecutive test runs work correctly

### Steps
1. [ ] Click "Run Full Test Suite (9 Tests)" button again
2. [ ] Wait for completion
3. [ ] Compare results to first run

### Expected Results
- [ ] Success rate remains 9/9
- [ ] Average response time similar (±50ms variance acceptable)
- [ ] "Success streak" counter increases
- [ ] No cumulative errors or memory leaks

---

## Test 9: Failure Scenario (Optional)
**Objective**: Test error handling when server is unavailable

### Steps
1. [ ] Stop Braid MCP container: `docker stop braid-mcp-server`
2. [ ] In UI, click "Quick Health Check"
3. [ ] Observe failure handling
4. [ ] Restart container: `docker start braid-mcp-server`
5. [ ] Run health check again

### Expected Results When Offline
- [ ] Availability card shows "Offline" (red)
- [ ] Activity log shows error message (red background)
- [ ] "Success streak" resets to 0
- [ ] "Last downtime" timestamp updates

### Expected Results After Restart
- [ ] Availability returns to "Healthy" (green)
- [ ] Tests pass normally
- [ ] "Success streak" starts incrementing again

---

## Test 10: Browser Compatibility
**Objective**: Verify component works across browsers

### Browsers to Test
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)

### Expected Results
- [ ] Component renders correctly in all browsers
- [ ] All buttons functional
- [ ] Colors display properly
- [ ] No console errors (F12)

---

## Test 11: Responsive Design
**Objective**: Check mobile/tablet layouts

### Steps
1. [ ] Open browser DevTools (F12)
2. [ ] Toggle device toolbar (Ctrl+Shift+M)
3. [ ] Test different screen sizes:
   - [ ] Desktop (1920x1080)
   - [ ] Tablet (768x1024)
   - [ ] Mobile (375x667)

### Expected Results
- [ ] Desktop: 4 cards in single row
- [ ] Tablet: 2x2 card grid
- [ ] Mobile: Single column stack
- [ ] All elements remain accessible
- [ ] No horizontal scrolling
- [ ] Text remains readable

---

## Final Verification

### Completion Checklist
- [ ] All 9 tests pass consistently (100% success rate)
- [ ] Average response time < 500ms
- [ ] Error rate = 0.0%
- [ ] Direct DB access confirmed (green checkmark)
- [ ] Activity logs show all operations
- [ ] No browser console errors
- [ ] Component responsive on all screen sizes
- [ ] Documentation reviewed (MCP_MONITOR_ENHANCEMENT.md)

### Sign-off
- **Tested By**: _________________
- **Date**: _________________
- **Result**: ✅ PASS / ❌ FAIL
- **Notes**: _________________

---

## Troubleshooting Guide

### Issue: No tests passing (0/9)
**Check**:
```powershell
docker ps  # Verify braid-mcp-server is running
docker logs braid-mcp-server  # Check for errors
```

### Issue: CRM tests failing (tests 4-6)
**Check**:
- Supabase credentials in docker-compose.yml
- USE_DIRECT_SUPABASE_ACCESS=true is set
- Database connection: `docker logs aishacrm-backend`

### Issue: Wikipedia tests failing (tests 2-3)
**Check**:
- Internet connectivity
- Firewall/proxy settings
- Wait and retry (external API may be rate-limited)

### Issue: Component not loading
**Solution**:
```powershell
# Rebuild frontend
docker-compose up -d --build frontend

# Check logs
docker logs aishacrm-frontend

# Hard refresh browser (Ctrl+Shift+R)
```

### Issue: High response times (>1000ms avg)
**Check**:
- Docker container resources
- Database performance
- Network latency
- System load (CPU/memory)

---

## Success Criteria Summary

**PASS Conditions**:
- ✅ 9/9 tests pass (100%)
- ✅ Average response time < 500ms
- ✅ Error rate = 0.0%
- ✅ Direct DB access working
- ✅ No console errors
- ✅ All dashboard cards update correctly

**If any criterion fails**: Review troubleshooting section or check `MCP_MONITOR_ENHANCEMENT.md` documentation.

---

**Testing Complete**: Once all checkboxes are marked, the enhanced MCP Monitor is validated and ready for production use!
