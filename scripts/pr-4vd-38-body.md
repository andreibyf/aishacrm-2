## What

Audits the runtime behavior of `TOOL_REGISTRY[name].policy` (follow-up to PR #565 / 4VD-10), reviews production audit logs for any executions of the 10 misclassified tools, and adds an integration test that pins `.braid` `@policy` to `backend/lib/braid/registry.js` parity end-to-end.

## Background

PR #565 fixed a registry generator bug that silently downgraded 10 tools' `@policy(WRITE_OPERATIONS)` to `READ_ONLY` in the committed registry. This card is the verification + hardening pass that 4VD-38 was filed for.

## Findings - what `policy` actually gates

`TOOL_REGISTRY[name].policy` is consulted in `backend/lib/braid/execution.js` for **five things**:

1. **Role check** via `CRM_POLICIES[policy].required_roles`. `WRITE_OPERATIONS` requires `user|manager|admin|superadmin|agent`. `READ_ONLY` allows ALL roles (`required_roles: []`).
2. **Rate limit**. READ_ONLY = 100 req/min; WRITE_OPERATIONS = 50 req/min.
3. **Delete confirmation** - `requires_confirmation` flag (DELETE_OPERATIONS / ADMIN_ONLY only).
4. **Redis result caching** - `isReadOnly = config.policy === 'READ_ONLY'` flips a 90-second `TOOL_CACHE_TTL.DEFAULT` keyed on `(toolName, tenantUuid, normalizedArgs)`. **This is the most concerning consequence of misclassification**: if a write-effecting tool like `initiate_call` or `send_document_for_signing` is mis-flagged READ_ONLY, identical-args repeats within 90s return a **cached "Ok" without invoking the side effect**.
5. **Audit log `policy` field** - written unconditionally to `braid_audit_log` regardless of `audit_required` (verified at `metrics.js:158` `logAuditEntry`, called from `execution.js` at lines 279 / 397 / 441 across cache-hit / success / error paths).

## Audit log review

Queried `braid_audit_log` on **prod** (`ehjlenywplgyiahgxkfj`, 130 rows / 18 distinct tools / Jan-Apr 2026) and **staging** (`bjedfowimuwbcnruwcdj`, 5 rows / 2 tools / May 6 2026) for executions of any of the 10 misclassified tools:

```
process_inbound_communication, analyze_document, send_document_for_signing,
draft_email, full_lifecycle_advance, clear_report_cache, initiate_call,
call_contact, invite_user, instantiate_workflow_template
```

**Result: ZERO rows on both projects.** The bug existed but the affected tools were never invoked in production - recently-added DocuSeal `send_document_for_signing` and other AI-driven tools hadn't been wired into the AiSHA chat surface yet at the time of fix. Bullet dodged.

## Hardening - three-layer enforcement model

| Layer | Source of truth                  | Pinned by                                                              |
| ----- | -------------------------------- | ---------------------------------------------------------------------- |
| 1     | `.braid` file `@policy(...)`     | Humans (review)                                                        |
| 2     | `generate-registry.js inferPolicy()` | Existing unit test `registry-policy-inference.test.js`                |
| 3     | Committed `registry.js` matches  | **NEW: `backend/__tests__/braid/registry-policy-integration.test.js`** |

The new integration test (5 assertions, all passing locally):

1. Every `TOOL_REGISTRY` entry whose source `.braid` file declares `@policy(...)` has a matching `policy:` field - drift between any of the three layers breaks CI.
2. Regression pin: the 10 tools from PR #565 must remain `WRITE_OPERATIONS`.
3. Every `.braid` function with `@policy` has a `TOOL_REGISTRY` entry (catches "added function but forgot to register").
4. Every registry policy is `READ_ONLY` or `WRITE_OPERATIONS` (the runtime two-bucket schema; `DELETE_OPERATIONS` / `ADMIN_ONLY` / `EXTERNAL_API` from `policies.js` are valid in `.braid` but coerce to `WRITE_OPERATIONS` for the registry).
5. Parser smoke test asserts >=50 `@policy`-annotated functions loaded - guards against the test silently passing if `TOOLS_DIR` resolution breaks.

The test reuses `parseBraidFile` from `braid-llm-kit/tools/generate-registry.js` so the same parser is exercised end-to-end.

## Acceptance criteria from the card

- [x] Runtime capability gate's behavior on `policy` field is documented (this PR description + CHANGELOG entry)
- [x] Audit log review for the 10 affected tools - zero anomalous executions
- [x] Integration test: parses all `.braid` files, parses `TOOL_REGISTRY`, fails if any tool's policy in the registry doesn't match the `@policy(...)` declaration in its source

## Bonus: `.gitignore` fold-in

Per the previous session's "fold it into the next PR" direction, this PR also adds `.gitignore` patterns for the per-PR scratch / probe / wrapper script bundles that have been accumulating in `scripts/` since 4VD-23 onwards (PR-body markdown, gh API request/response dumps, plink probe output, one-shot Desktop Commander launchers).

## Tests

```
node --test backend/__tests__/braid/registry-policy-integration.test.js
# tests 5
# pass 5
# fail 0
```

## Linear

Closes 4VD-38.
