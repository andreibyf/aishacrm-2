# MCP Monitor - Visual UI Guide

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🔵 Comprehensive monitoring for the Braid MCP Server - performance,   │
│     security, availability, and diagnostics.                            │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│  🟢 Availability │  📊 Performance  │  🛡️ Security     │  📈 Test Results │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┤
│                  │                  │                  │                  │
│  ✓ Healthy       │  150 ms avg      │  ✓ Direct DB     │    9 / 9         │
│                  │                  │  🔒 Service Key  │                  │
│  Last checked:   │  Error rate:     │  ✓ Tenant ISO    │  Avg: 200ms      │
│  2:30:45 PM      │  0.0%            │                  │                  │
│                  │  ████████████    │                  │  ████████████    │
│  Success: 12     │  100%            │                  │  100%            │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  ⚡ Test Controls                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  [🔄 Quick Health Check]    [📄 Run Full Test Suite (9 Tests)]         │
│                                                                           │
│  Test Suite Results                                     9/9 Passed       │
│  ├─ ✓ Braid Health                        50ms                          │
│  ├─ ✓ Wikipedia Search (10 results)       450ms                         │
│  ├─ ✓ Wikipedia Page                      320ms                         │
│  ├─ ✓ CRM Accounts (0 records)            120ms                         │
│  ├─ ✓ CRM Leads (0 records)               115ms                         │
│  ├─ ✓ CRM Contacts (0 records)            110ms                         │
│  ├─ ✓ Mock Adapter                        25ms                          │
│  ├─ ✓ Batch Actions (2 actions)           280ms                         │
│  └─ ✓ Error Handling                      95ms                          │
│                                                                           │
│  Total execution time                                  1565ms            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  🌍 Backend MCP Servers (Legacy)                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  No backend MCP servers configured.                                      │
│  (Using Braid MCP Server instead)                                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  👁️ Activity Logs                                    [Clear Logs]        │
├─────────────────────────────────────────────────────────────────────────┤
│  🕒 2:30:47 PM  ✅ Test suite complete: 9/9 passed in 1565ms            │
│  🕒 2:30:46 PM  ✓ Error handling (95ms)                                 │
│  🕒 2:30:46 PM  ✓ Batch actions (280ms)                                 │
│  🕒 2:30:46 PM  ✓ Mock adapter (25ms)                                   │
│  🕒 2:30:45 PM  ✓ CRM contacts search (110ms, 0 contacts)               │
│  🕒 2:30:45 PM  ✓ CRM leads search (115ms, 0 leads)                     │
│  🕒 2:30:45 PM  ✓ CRM accounts search (120ms, 0 accounts)               │
│  🕒 2:30:45 PM  ✓ Wikipedia page retrieval (320ms)                      │
│  🕒 2:30:44 PM  ✓ Wikipedia search (450ms, 10 results)                  │
│  🕒 2:30:44 PM  ✓ Health check passed (50ms)                            │
│  🕒 2:30:44 PM  🚀 Starting comprehensive MCP test suite...              │
└─────────────────────────────────────────────────────────────────────────┘
```

## Color Legend

### Status Indicators
- 🟢 **Green (Healthy)**: All systems operational, no errors
- 🟡 **Yellow (Degraded)**: Some tests failing (67-99% success)
- 🔴 **Red (Offline)**: Major failures (<67% success)
- ⚪ **Gray (Unknown)**: Status not yet determined

### Log Levels
- **Info** (🔵 Blue): General information, test starts
- **Success** (✅ Green): Operations completed successfully
- **Warning** (⚠️ Yellow): Non-critical issues, fallbacks used
- **Error** (❌ Red): Failures, exceptions, critical issues

## Interactive Elements

### Quick Health Check Button
```
┌──────────────────────────────┐
│  🔄 Quick Health Check       │  ← Click to test /health endpoint
└──────────────────────────────┘

When clicked:
1. Button text: "Checking..." with spinner
2. Calls: http://localhost:8000/health
3. Updates: Availability card status
4. Duration: ~50-200ms
```

### Run Full Test Suite Button
```
┌────────────────────────────────────────┐
│  📄 Run Full Test Suite (9 Tests)     │  ← Click to run all tests
└────────────────────────────────────────┘

When clicked:
1. Button text: "Running Tests..." with spinner
2. Executes: 9 sequential adapter tests
3. Updates: All 4 dashboard cards + test results section
4. Duration: ~2-5 seconds
5. Logs: Real-time activity for each test
```

### Clear Logs Button
```
┌──────────────┐
│  Clear Logs  │  ← Click to reset activity log
└──────────────┘
```

## Dashboard Card Details

### 1. Availability Card
```
┌──────────────────┐
│ 🟢 Availability  │
├──────────────────┤
│  ✓ Healthy       │  ← Status icon + text
│                  │
│  Last checked:   │
│  2:30:45 PM      │  ← Timestamp
│                  │
│  Success: 12     │  ← Consecutive successes
└──────────────────┘
```

### 2. Performance Card
```
┌──────────────────┐
│ 📊 Performance   │
├──────────────────┤
│  150 ms avg      │  ← Average response time
│                  │
│  Error rate:     │
│  0.0%            │  ← Percentage of failures
│                  │
│  ████████████    │  ← Progress bar (100% - error rate)
└──────────────────┘
```

### 3. Security Card
```
┌──────────────────┐
│ 🛡️ Security      │
├──────────────────┤
│  ✓ Direct DB     │  ← Direct Supabase access
│  🔒 Service Key  │  ← Authentication configured
│  ✓ Tenant ISO    │  ← Tenant isolation
└──────────────────┘
```

### 4. Test Results Card
```
┌──────────────────┐
│ 📈 Test Results  │
├──────────────────┤
│    9 / 9         │  ← Passed / Total
│                  │
│  Avg: 200ms      │  ← Average test time
│                  │
│  ████████████    │  ← Success rate progress bar
└──────────────────┘
```

## Test Results Detailed View

```
Test Suite Results                                      9/9 Passed
┌──────────────────────────────────────────────────────────────┐
│  ✓  Braid Health                              50ms           │
│  ✓  Wikipedia Search (10 results)             450ms          │
│  ✓  Wikipedia Page                            320ms          │
│  ✓  CRM Accounts (0 records)                  120ms          │
│  ✓  CRM Leads (0 records)                     115ms          │
│  ✓  CRM Contacts (0 records)                  110ms          │
│  ✓  Mock Adapter                              25ms           │
│  ✓  Batch Actions (2 actions)                 280ms          │
│  ✓  Error Handling                            95ms           │
├──────────────────────────────────────────────────────────────┤
│  Total execution time                         1565ms         │
└──────────────────────────────────────────────────────────────┘
```

### If Test Fails
```
┌──────────────────────────────────────────────────────────────┐
│  ✗  CRM Accounts                              Failed         │
│                                                               │
│  Error: Connection timeout after 5000ms                      │
└──────────────────────────────────────────────────────────────┘
```

## Activity Log Format

### Success Log
```
🕒 2:30:45 PM  ✓ CRM accounts search (120ms, 0 accounts)
   └─ Green background, white text
```

### Error Log
```
🕒 2:30:50 PM  ✗ CRM accounts failed: Connection timeout
   └─ Red background, white text
   └─ Error details shown below message
```

### Info Log
```
🕒 2:30:44 PM  🚀 Starting comprehensive MCP test suite...
   └─ Gray background, white text
```

### Warning Log
```
🕒 2:30:46 PM  ⚠️ Could not fetch backend MCP servers: 404
   └─ Yellow background, dark text
```

## Responsive Behavior

### Desktop (Wide Screen)
- 4 dashboard cards in single row
- Full test results visible
- Scrollable activity log (max height: 384px)

### Tablet (Medium Screen)
- 2x2 grid for dashboard cards
- Test results below cards
- Activity log at bottom

### Mobile (Small Screen)
- Single column layout
- Cards stack vertically
- Test results collapse
- Activity log compact view

## Real-Time Updates

### During Health Check
1. Button: "Checking..." (spinner icon)
2. Availability card: Status updates after response
3. Activity log: New entry added at top
4. Duration indicator: Updates with actual time

### During Full Test Suite
1. Button: "Running Tests..." (spinner icon)
2. Activity log: Updates after each test (1/9, 2/9, etc.)
3. Dashboard cards: Update in real-time
4. Test results: Populate as tests complete
5. Final summary: Shows total time and pass/fail counts

## Expected User Flow

```
1. User opens Settings → MCP Monitor
   ↓
2. Component loads, runs initial health check
   ↓
3. Availability shows "Healthy" (or "Unknown")
   ↓
4. User clicks "Run Full Test Suite (9 Tests)"
   ↓
5. Activity logs show each test executing
   ↓
6. Dashboard cards update with metrics
   ↓
7. Test results section populates with details
   ↓
8. User reviews: 9/9 passed, avg 200ms, 0% errors
   ↓
9. User checks activity logs for detailed timing
```

## Keyboard Shortcuts (Future Enhancement)

- `Ctrl+T`: Run full test suite
- `Ctrl+H`: Quick health check
- `Ctrl+L`: Clear activity logs
- `Ctrl+E`: Export test results

## Accessibility Features

- **ARIA Labels**: All buttons have descriptive labels
- **Color + Icons**: Status uses both color and icon (colorblind-friendly)
- **Keyboard Navigation**: Tab through all interactive elements
- **Screen Reader**: Announces test results and status changes
- **High Contrast**: Works with Windows high contrast mode

---

This visual guide shows the complete UI layout and expected interactions for the enhanced MCP Monitor component.
