# Archived E2E Tests

This folder contains legacy E2E tests that have been superseded by newer implementations.

## Why Archive Instead of Delete?

- **Reference**: Legacy tests may contain useful patterns or edge cases
- **Rollback**: If new tests need adjustment, legacy tests provide a fallback
- **Documentation**: Shows evolution of the testing approach

## Archived Tests

### `complete-user-workflow.legacy.spec.ts`
- **Archived**: December 2024
- **Reason**: Superseded by v3.0.0 workflow tests
- **Legacy Flow**: Lead → Account + Contact + Opportunity (direct lead creation)
- **Replaced By**:
  - `../bizdev-workflow-e2e.spec.ts` - BizDev → Lead → Contact + Account + Opportunity
  - `../sales-cycle-e2e.spec.ts` - Full sales cycle with stages

## Current v3.0.0 Tests (use these)

```bash
# Primary workflow tests (B2B and B2C)
npx playwright test tests/e2e/bizdev-workflow-e2e.spec.ts

# Full sales cycle with stages
npx playwright test tests/e2e/sales-cycle-e2e.spec.ts

# Both together
npx playwright test tests/e2e/bizdev-workflow-e2e.spec.ts tests/e2e/sales-cycle-e2e.spec.ts
```

## v3.0.0 Workflow Architecture

```
BizDev Source → Lead → Contact → Account + Opportunity + Activities
     ↓           ↓         ↓           ↓
  (promote)  (convert)  (created)  (linked)
```

Key changes from legacy:
- Leads originate from BizDev Sources (not direct creation)
- B2B/B2C lead type determined by tenant business_model
- Provenance metadata tracks full chain
- Contacts are created during conversion (not leads becoming contacts)
