# Release 1.0.1 - 2025-11-18

## Summary
Patch release to improve E2E test stability and rate limiting behavior.

## Changes
- Added test-aware rate limiter overrides (`RATE_LIMIT_TEST_MAX`, `RATE_LIMIT_FORCE_DEFAULT`, `E2E_TEST_MODE`) in `backend/server.js`.
- Implemented GET `/api/users/heartbeat` endpoint (non-mutating) to eliminate 404 noise during tests.
- Updated backend `.env` with test override variables.
- Bumped version to 1.0.1 in `package.json`.

## Rationale
- Previous extremely high `RATE_LIMIT_MAX` prevented 429 verification. Test override enables deterministic threshold without impacting production defaults.
- Heartbeat GET endpoint aligns with tests expecting read-only heartbeat probe, reducing log noise.

## Deployment Notes
- Rebuild backend container after pulling: `docker compose up -d --build backend`.
- Ensure environment has `E2E_TEST_MODE=true` when running Playwright for consistent behavior.

## Next Targets (Not in this patch)
- User Management UI selectors and mock auth improvements.
- PDF export endpoint header/content corrections.

## Verification
- `tests/e2e/rate-limit.spec.ts` now passes and triggers 429 as expected.
