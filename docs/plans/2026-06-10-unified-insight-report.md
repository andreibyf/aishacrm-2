# Unified Insight: market-insights report + growth opportunities (one run)

> Fixes the T12 regression (the rich Market Insights report disappeared when the AI Insights tab was reworked into the growth insight) and unifies the two into a single async "Generate Insight" run.

**Confirmed design (Andrei):**

- **One** "Generate Insight" button → one async run that produces **both**:
  - the rich **Market Insights report** (executive_summary, market_overview, SWOT, competitive_landscape, industry_trends, major_news, recommendations) → **Claude** (`aisha-mcp`)
  - the scored **growth opportunities** → **vLLM** (`aisha-summary`)
- Two tabs are **views** of the one persisted insight: **AI Insights** → report; **Opportunities** → opportunities. Button lives on AI Insights.
- The exported **PDF** gets a **growth opportunities section**.

## Current state (what's wrong)

- `AIMarketInsights.jsx` (T12, merged #659) calls only the growth client (`getCurrentInsight`/`requestInsightRun`) — it dropped the `/api/mcp/market-insights` rich report. Regression: report no longer produced.
- The growth `insightRunner` produces only a thin report (`signal_counts`, `top`) + opportunities. No rich report.
- The rich-report synthesis is inline in `backend/routes/mcp.js` (`/market-insights` handler, ~1451–2012): loads tenant + CRM stats + Wikipedia → JSON schema → `callLLMWithFailover` (→ `aisha-mcp` → Claude) → parsed report.
- PDF export of the report: `backend/routes/reports.js` (~1564–2692).

## Tasks

### 1. Extract the market-insights synthesis into a shared module

- Create `backend/lib/marketInsights/synthesize.js` exporting `synthesizeMarketInsights({ supabase, tenantId, profile?, deps })` → returns the report object (same schema as today).
- Move the tenant-context + CRM-stats + Wikipedia-context + JSON-schema + `callLLMWithFailover` synthesis out of `mcp.js` into this function. Keep `callLLMWithFailover` usage (→ `aisha-mcp` → Claude); inject it (`deps.callLLM`) for testability.
- `mcp.js` `/market-insights` route now calls `synthesizeMarketInsights(...)` and returns its result (behavior unchanged; route still works).
- Test: `backend/__tests__/marketInsights.synthesize.test.js` with injected `callLLM` + fake supabase (schema in prompt, returns parsed object, fail-soft).

### 2. insightRunner produces the rich report (Claude) + opportunities (vLLM) in one run

- In `insightRunner.runInsight`: after collecting signals + generating/scoring opportunities (vLLM), ALSO call `synthesizeMarketInsights(...)` (Claude) and store its output as the insight's `report` (replacing the thin report — or nest: `report.market_insights` = rich, keep `report.signal_counts`/`opportunity_count` as meta).
- Decision: store the rich report at `growth_insights.report` (the FE report renderer reads it), and keep signal/opportunity counts in `report.meta` (or `signal_summary`). Report synthesis is fail-soft: if Claude fails, store a `report.error` but still persist opportunities.
- Update `insightRunner` tests for the added synthesis call (inject a fake synthesize fn).

### 3. Restore the report UI on the AI Insights tab

- `AIMarketInsights.jsx`: render the rich report from `insight.report` (executive_summary, market_overview, SWOT, competitive_landscape, industry_trends, major_news, recommendations) — reuse the original report-rendering JSX (from git history pre-#659) but sourced from `getCurrentInsight().report` instead of `/api/mcp/market-insights`.
- Keep the single **Generate Insight** button here (triggers `requestInsightRun` = the unified run) + the async running/cooldown/complete/failed states.
- Keep `data-ai-insights` (or equivalent) populated for the PDF export path.

### 4. Opportunities tab = view only

- `GrowthOpportunities.jsx`: remove any generate trigger; it only lists the opportunities from the latest insight. (Keep dismiss/action.) The "Edit market scope" profile editor stays.

### 5. PDF export: add a growth opportunities section

- `reports.js` AI Market Insights PDF (~1564–2692): after the report sections, render a **Growth Opportunities** section (table/cards: title, type, score, reason, recommended_action) from the insight's opportunities.
- Source the opportunities: either include them in the report payload the export reads, or fetch `growth_opportunities` for the latest complete insight in the export handler.

### 6. Verify

- Backend: `node --test backend/__tests__/growth.*.test.js backend/__tests__/marketInsights.*.test.js` green.
- FE: Vitest for AIMarketInsights (report render states) + GrowthOpportunities (view).
- Manual (dev): one Generate → report (Claude) + opportunities (vLLM) + PDF has both. Confirm vLLM monitor shows the scoring calls.

## Notes

- Report synthesis = Claude (capable model, full schema); opportunity scoring = vLLM (lightweight). Never swap these.
- Requires the dev stack on `dev_personal` (LiteLLM master key + `LITELLM_ENABLED` + `LOCAL_LLM_BASE_URL`) — already recreated.
- Stacked on branch `fix/growth-scorer-litellm-aisha-summary` (PR #660) or its own PR.
