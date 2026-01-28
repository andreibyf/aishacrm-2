# Lint Cleanup Action Plan - 2026-01-28

## Summary
Starting lint warnings: 254  
Current lint warnings: 222 (**32 warnings fixed!**)  
Categories identified for systematic resolution.

## Progress Report

### ✅ Completed Fixes (32 warnings fixed)
1. **Fixed parsing error in memory.test.js**: Removed invalid syntax in ES module imports
2. **Test files cleanup**: Fixed unused variables in multiple test files
   - backend/__tests__/ai/memory.test.js (removed unused before/after imports)
   - backend/__tests__/bundles.test.js (removed unused after import)
   - backend/__tests__/routes/ai/speech.test.js (removed unused afterEach import)
   - backend/__tests__/routes/ai/chat.test.js (prefixed unused response with _)
   - backend/__tests__/routes/ai/conversations.test.js (prefixed unused id with _)
3. **E2E test fixes**: Fixed unused variables in bizdev-workflow-e2e.spec.ts
   - Prefixed unused page parameter with _
   - Prefixed 3 unused err catch variables with _
4. **Component fixes**: Fixed DenormalizationHelper.jsx unused tenantId parameters (4 fixes)
5. **API test fixes**: Fixed entities.test.js unused err variables (4 fixes - removed entirely)

### Categories and Actions

### 1. Unused Variables/Parameters (Should be Fixed) - ~150 issues
**Action**: Prefix with underscore `_` to indicate intentionally unused
- Test files: `tenantId`, `conversationId`, `response`, `err` variables
- Route handlers: unused destructured parameters
- Backend utilities: unused function parameters

### 2. Future Implementation/Placeholders (Ignore) - ~30 issues  
**Action**: Add `// eslint-disable-next-line` comments for future features
- Care system functions (careEscalationDetector.js, careStateEngine.test.js)
- Developer AI features (developerAI.js)
- Workflow execution placeholders (workflowExecutionService.js)
- Agent office features (agentOffice.js)

### 3. Dead Code/Imports (Remove) - ~25 issues
**Action**: Remove completely unused imports and dead code
- Unused shadcn/ui imports (Card, CardContent, etc. in EntityAiSummaryCard.jsx)
- Unused icon imports (AlertTriangle in GmailSMTPSettings.jsx)  
- Unused utility imports (crypto in testing.js, path in healthMonitor.js)
- Unused helper functions in routes

### 4. TypeScript Any Types (Leave for now) - ~35 issues
**Action**: Document as future improvement, skip for this cleanup
- braid-mcp-node-server TypeScript files
- Test files with mock objects
- Complex adapter interfaces

### 5. React Specific Issues (Fix) - ~10 issues
**Action**: Apply specific React fixes
- Missing dependency arrays in useEffect/useCallback
- Fast refresh component export issues  
- HTML entity escaping in JSX

### 6. Missing Imports (Fix if needed) - ~4 issues
**Action**: Verify and add any legitimately missing imports
- Check for actual import errors vs unused imports

## Implementation Plan

### Phase 1: Quick Wins (Unused Variables)
1. Prefix unused test variables with `_`
2. Fix unused parameters in function signatures
3. Remove unused destructured variables

### Phase 2: Dead Code Removal  
1. Remove unused imports
2. Clean up unused utility functions
3. Remove obsolete constants

### Phase 3: React Fixes
1. Fix dependency arrays
2. Resolve component export issues
3. Fix HTML entity warnings

### Phase 4: Future Implementation Markers
1. Add eslint-disable comments for planned features
2. Document reasoning in comments

## Files to Process (High Priority)

### Backend Test Files
- `backend/__tests__/ai/entityContextIntegration.test.js` (3 warnings)
- `backend/__tests__/ai/memory.test.js` (3 warnings)  
- `backend/__tests__/routes/ai/*.test.js` (multiple files)

### Backend Routes  
- `backend/routes/accounts.js` (unused imports)
- `backend/routes/ai/chat.js` (unused imports)
- `backend/routes/mcp.js` (unused imports)

### Frontend Components
- `src/components/crm/EntityAiSummaryCard.jsx` (unused imports)
- `src/components/settings/GmailSMTPSettings.jsx` (unused imports)
- `src/components/ai/AiSidebar.jsx` (dependency array)

### Future Feature Files (Add Ignore Comments)
- `backend/lib/care/` (care system - future)
- `backend/lib/developerAI.js` (dev features - future)  
- `backend/lib/aiTriggersWorker.js` (triggers - future)

## Excluded from Cleanup

### TypeScript Files (Complex Types)
- `braid-mcp-node-server/src/**/*.ts` (35+ any type warnings)
- Test files with complex mocks
- Will address in separate TypeScript improvement task

### Archive/Legacy Files
- `tests/e2e/archive/complete-user-workflow.legacy.spec.ts` 
- Legacy component files

## Success Criteria
- Reduce lint warnings from 254 to <50
- No functional regressions
- Clear documentation of remaining warnings
- Maintain code readability

## Notes
- All changes to maintain backward compatibility
- Focus on quick wins and code clarity
- Document any complex decisions
- Test after each phase