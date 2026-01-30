# GitHub Project Backlog Items - Lint Cleanup

## Epic: Code Quality - Lint Cleanup (222 remaining warnings)

### Priority: High

**Epic Description:** Systematic cleanup of ESLint warnings across the codebase to improve code quality, maintainability, and developer experience. Currently 222 warnings remaining (down from 254).

---

## 🏃‍♂️ Phase 1: Unused Variables Cleanup (High Priority)

### Issue 1: Fix unused variables in backend test files
**Labels:** `tech-debt`, `backend`, `testing`, `good-first-issue`  
**Estimate:** 3 story points  
**Priority:** High

**Description:**
Fix ~20 unused variable warnings in backend test files by prefixing with underscore or removing.

**Files to fix:**
- `backend/__tests__/integration/healthMonitoring.test.js` (3 warnings)
- `backend/__tests__/routes/ai/index.test.js` (2 warnings)  
- `backend/__tests__/routes/ai/speech.test.js` (3 warnings)
- `backend/__tests__/routes/ai/summarization.test.js` (1 warning)
- `backend/__tests__/routes/ai/tools.test.js` (1 warning)
- `backend/__tests__/routes/users.*.test.js` (5 warnings)

**Acceptance Criteria:**
- [ ] All unused variables prefixed with `_` or removed
- [ ] Tests still pass after changes
- [ ] Lint warnings reduced by ~15

### Issue 2: Fix unused variables in utility scripts  
**Labels:** `tech-debt`, `backend`, `good-first-issue`  
**Estimate:** 2 story points  
**Priority:** Medium

**Description:**
Clean up unused variables in backend utility/migration scripts.

**Files to fix:**
- `backend/generate-cleanup-migration.js` (1 warning)
- `backend/generate-index-migration.js` (2 warnings)

**Acceptance Criteria:**
- [ ] Unused variables fixed
- [ ] Scripts still function correctly

---

## 🧹 Phase 2: Dead Code Removal (High Priority)

### Issue 3: Remove unused imports from backend routes
**Labels:** `tech-debt`, `backend`, `cleanup`  
**Estimate:** 4 story points  
**Priority:** High

**Description:**
Remove genuinely unused imports and dead code from backend route files.

**Files to clean:**
- `backend/lib/aiMemory/memoryStore.js` (unused import)
- `backend/lib/healthMonitor.js` (unused imports)
- `backend/routes/aiSummary.js` (unused variables)
- `backend/routes/ai/conversations.js` (unused imports)
- `backend/routes/ai/tools.js` (unused imports)
- `backend/routes/documents.v2.js` (unused imports)
- `backend/routes/mcp.js` (unused imports)
- `backend/routes/workflows.v2.js` (unused imports)

**Acceptance Criteria:**
- [ ] Only remove genuinely unused imports
- [ ] Verify functionality not broken
- [ ] Lint warnings reduced by ~8

### Issue 4: Clean up frontend component unused imports
**Labels:** `tech-debt`, `frontend`, `react`, `cleanup`  
**Estimate:** 3 story points  
**Priority:** Medium

**Description:**
Remove unused imports from React components, particularly shadcn/ui and icon imports.

**Files to clean:**
- `src/api/bundles.js` (unused variable)
- `src/components/ai/AishaEntityChatModal.jsx` (unused variable)
- `src/components/ai/SuggestionBadge.jsx` (unused variable)
- `src/components/ai/useAiSidebarState.jsx` (unused variable)
- `src/components/bizdev/BizDevSourceCard.jsx` (unused variables)
- `src/components/shared/Logger.jsx` (unused constant)
- Multiple settings components with unused imports

**Acceptance Criteria:**
- [ ] Remove only genuinely unused imports
- [ ] UI functionality unchanged
- [ ] Lint warnings reduced by ~10

---

## ⚛️ Phase 3: React-Specific Fixes (Medium Priority)

### Issue 5: Fix React Hook dependency arrays
**Labels:** `tech-debt`, `frontend`, `react`, `react-hooks`  
**Estimate:** 3 story points  
**Priority:** Medium

**Description:**
Fix missing dependencies in useEffect and useCallback hooks for proper React optimization.

**Files to fix:**
- `src/components/ai/AiSidebar.jsx` (missing dependencies)
- `src/pages/LeadProfilePage.jsx` (missing dependency)

**Acceptance Criteria:**
- [ ] Add missing dependencies or remove if intentional
- [ ] No infinite re-render loops
- [ ] Lint warnings reduced by ~2

### Issue 6: Fix React component export issues
**Labels:** `tech-debt`, `frontend`, `react`, `fast-refresh`  
**Estimate:** 2 story points  
**Priority:** Low

**Description:**
Resolve Fast Refresh warnings for better development experience.

**Files to fix:**
- `src/components/ai/AiShaActionHandler.jsx`
- `src/components/shared/EntityLabelsContext.jsx` (5 warnings)

**Acceptance Criteria:**
- [ ] Components properly export only React components
- [ ] Constants/functions moved to separate files if needed
- [ ] Fast Refresh works correctly

### Issue 7: Fix HTML entity escaping in JSX
**Labels:** `tech-debt`, `frontend`, `react`, `accessibility`  
**Estimate:** 1 story point  
**Priority:** Low

**Description:**
Properly escape HTML entities in JSX for better accessibility and standards compliance.

**Files to fix:**
- `src/components/settings/CareSettings.jsx` (2 warnings)
- `src/components/settings/MCPServerMonitor.jsx` (2 warnings)
- `src/components/settings/StatusCardsManager.jsx` (1 warning)

**Acceptance Criteria:**
- [ ] HTML entities properly escaped
- [ ] No visual changes to UI
- [ ] Lint warnings reduced by ~5

---

## 🔮 Phase 4: Future Implementation Markers (Low Priority)

### Issue 8: Add eslint-disable comments for future features
**Labels:** `tech-debt`, `future-feature`, `documentation`  
**Estimate:** 4 story points  
**Priority:** Low

**Description:**
Add proper eslint-disable comments with explanations for planned future features to prevent warnings.

**Files to update:**
- `backend/lib/care/` directory (Care system - future)
- `backend/lib/developerAI.js` (Developer AI features)
- `backend/lib/aiTriggersWorker.js` (AI triggers)
- `backend/lib/callFlowHandler.js` (Call flow features)
- `backend/routes/agentOffice.js` (Agent office)
- `backend/routes/devaiHealthAlerts.js` (Dev AI alerts)

**Acceptance Criteria:**
- [ ] Add `// eslint-disable-next-line` with reason
- [ ] Document when features will be implemented
- [ ] Lint warnings reduced by ~25

---

## 📄 Documentation Tasks

### Issue 9: Update lint cleanup documentation
**Labels:** `documentation`, `tech-debt`  
**Estimate:** 1 story point  
**Priority:** Low

**Description:**
Update action plan with final results and create developer guidelines for avoiding lint issues.

**Deliverables:**
- [ ] Update `docs/LINT_CLEANUP_2026-01-28.md` with final results
- [ ] Create `docs/DEVELOPMENT_GUIDELINES.md` with lint best practices
- [ ] Update README with code quality section

---

## 🚀 Future Improvements (Backlog)

### Issue 10: TypeScript strict mode improvements
**Labels:** `tech-debt`, `typescript`, `enhancement`  
**Estimate:** 8 story points  
**Priority:** Backlog

**Description:**
Address ~35 TypeScript `any` type warnings in braid-mcp-node-server and test files. This is a larger refactoring task for future consideration.

**Scope:**
- `braid-mcp-node-server/src/**/*.ts` files
- Complex adapter interfaces
- Mock object types in tests

**Acceptance Criteria:**
- [ ] Replace `any` types with proper type definitions
- [ ] Maintain existing functionality
- [ ] Add proper type safety

---

## Summary for GitHub Project

**Total Issues:** 10  
**Story Points:** 30  
**Expected Lint Reduction:** ~220 warnings → <20 warnings  
**Timeline:** 2-3 sprints for Phases 1-3, Phase 4 as needed

**Dependencies:**
- Issues 1-2 can be done in parallel
- Issue 3 should be completed before Issue 4
- Issues 5-7 can be done in parallel after Issues 1-4
- Issue 8 is independent and can be done anytime
- Issue 10 is future enhancement