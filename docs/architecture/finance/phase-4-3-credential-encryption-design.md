# Finance Ops — Phase 4-3: Credential Encryption Migration Design Freeze

**Phase 4-3 — Design freeze for at-rest encryption of `tenant_integrations.api_credentials` (§7 slice #4 of the Phase 4-0 design freeze).**
**Branch:** `feat/finance-ops-phase4-planning`.
**Status:** Design freeze. **No code, no migration application, no env-var changes, no provider writes, no Coolify mutation, no production action by this task.** Defines the migration shape and key-management contract; does not apply the migration anywhere. The plain-JSONB `tenant_integrations.api_credentials` posture from decision E4 remains in committed code until the implementation packet lands.
**Date:** 2026-05-26
**Related:**
[`phase-4-production-pilot-design-freeze.md`](./phase-4-production-pilot-design-freeze.md) §7 slice #4 (credential encryption migration) — this packet operationalises it ·
[`phase-4-2-erpnext-credential-router-design.md`](./phase-4-2-erpnext-credential-router-design.md) (paired packet — the router that consumes the decrypted credentials this design produces) ·
[`phase-4-production-pilot-design-freeze.md`](./phase-4-production-pilot-design-freeze.md) §11.2 row 4 — the activation-gate verification this packet enables ·
[`event-store-persistence.md`](./event-store-persistence.md) (decision E4 — plain-JSONB credential storage as the POC posture this packet replaces) ·
[`phase-3-activation-evidence-pack.md`](./phase-3-activation-evidence-pack.md) §7 + §8.4 (the deferred credential-encryption item that Phase 3 left open) ·
[`security-rls-hardening.md`](./security-rls-hardening.md) (2C-1 — the defence-in-depth tenant isolation layer encryption augments) ·
`backend/migrations/004_tenant_integrations.sql` (the existing table; this packet plans the migration that adds encryption) ·
`backend/migrations/011_enable_rls.sql:43` (RLS on `tenant_integrations` — defence-in-depth boundary preserved)

---

## 1. Purpose and scope

Decision E4 (in [`event-store-persistence.md`](./event-store-persistence.md)) chose plain-JSONB storage for `tenant_integrations.api_credentials` as the POC posture for Slice 2 / Phase 3. The decision was honest: a POC posture, acceptable for staging-only credentials (Doppler `stg_stg` provides the credentials; the database row is sandbox-scoped and bounded). It is explicitly **not** acceptable for production credentials. Phase 3-13 §8.4 records this; Phase 4-0 §7 slice #4 marks it as a hard precondition for Phase 4 activation; this packet designs the replacement.

The pilot tenant in production will have ERPNext credentials (sandbox-first, per Phase 4-0 §6) inserted into `tenant_integrations`. Those credentials must be encrypted at rest in production. Phase 4-3 freezes:

- The migration shape that introduces encrypted-at-rest storage.
- The key-management posture (where the key lives, who can read it, how it rotates).
- The decrypt-at-read code path (which lives inside the Phase 4-2 router boundary).
- The rotation / rollback posture (what happens when keys rotate; what happens when the migration is reverted).
- The audit logging that records credential access without leaking the credentials themselves.

**Inputs:**

- Phase 4-0 §7 slice #4 contract.
- The existing `tenant_integrations` table from migration 004 (`backend/migrations/004_tenant_integrations.sql`).
- Phase 4-2's router contract (decrypted credentials produced inside the router boundary; never logged; never returned in HTTP responses).
- Decision E4 — the plain-JSONB POC posture being replaced.

**Outputs of this packet:**

- §3: Migration shape — what the migration adds, removes, and preserves.
- §4: Encryption-at-rest contract — algorithm choice, format, what is encrypted vs not.
- §5: Key management — where the key lives, how it is loaded, who has read access.
- §6: Decrypt-at-read code path — the boundary inside Phase 4-2 router.
- §7: Rotation — key version, re-encryption flow.
- §8: Rollback — what happens if the migration is reverted; what happens if a single-row revert is required.
- §9: Audit logging — what we record on credential read / write / rotation without leaking secrets.
- §10: Required test surface.
- §11: Hard constraints.
- §12: Acceptance.

**Phase 4-3 does NOT:**

- Apply any migration. The migration is defined in this freeze but lives in the implementation packet (separately dispatched).
- Insert any credential row.
- Choose a specific cloud KMS provider as a hard requirement (the §5 design accommodates multiple key sources; the implementation packet picks one).
- Migrate plaintext credentials that exist today (the existing plain-JSONB rows are staging-only and acceptable to be left in place until the staging cycle naturally clears them; production never gets plaintext credentials).
- Apply the migration to production. Production apply is gated behind Phase 4-19 / Phase 4-6 (production migration runbook).

---

## 2. Live-execution posture

| What                                                  | Status this task |
| ----------------------------------------------------- | ---------------- |
| New runtime code                                      | None.            |
| Doppler `stg_stg` or `prd_prd` env var changed        | None.            |
| Migration applied anywhere                            | None.            |
| Production migration applied                          | None.            |
| Production / staging tenant_integrations row inserted | None.            |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` flipped anywhere   | None.            |
| `FINANCE_PROVIDER_WRITES_ENABLED` flipped anywhere    | None.            |
| Production action of any kind                         | None.            |
| Re-read decision E4 + migration 004 + RLS migration   | **Executed.**    |

---

## 3. Migration shape

**Frozen migration outline (the implementation packet authors the SQL file; this freeze defines the structural contract):**

The migration is a single forward-only migration file that adds:

1. **New column** `api_credentials_encrypted BYTEA` on `tenant_integrations`. Holds the encrypted ciphertext + a wrapped envelope (per §4).
2. **New column** `api_credentials_key_version SMALLINT` on `tenant_integrations`. Records which key version encrypted the row, supporting §7 rotation.
3. **New column** `api_credentials_encrypted_at TIMESTAMPTZ` on `tenant_integrations`. Records when the row was last encrypted (used by §9 audit reporting + §7 rotation policy).
4. **Optional index** on `(tenant_id, integration_type, is_active)` — already exists per migration 004; no new index introduced by Phase 4-3.

**What the migration does NOT do:**

- **Does NOT remove `api_credentials JSONB`.** The plaintext column stays in the schema after the migration applies. The Phase 4-3 implementation packet writes only to `api_credentials_encrypted`; the plaintext column is left null on new rows. Existing staging rows with plaintext credentials are not migrated by this Phase — they remain in place until the staging cycle clears them naturally OR a separate cleanup operation removes them. **Removing the plaintext column is a separate forward-only migration, gated on every active row being fully encrypted, which is downstream of Phase 4 pilot activation.**
- **Does NOT encrypt existing plaintext rows.** Existing staging rows stay plaintext. Implementation packet documents how to flip individual rows from plaintext → encrypted manually (operator action; not part of the migration).
- **Does NOT add a CHECK constraint requiring `api_credentials_encrypted IS NOT NULL`.** That would break existing plaintext rows. A constraint of that shape is a later forward-only step after every active row has been re-encrypted.

**Why a forward-only migration shape**: production migrations must be PITR-snapshot-protected (Phase 3-2 / Phase 4-6 pattern); a forward-only migration with explicit rollback documentation (§8) is the safest posture. The implementation packet provides a documented manual rollback that operators may execute under PITR-snapshot protection.

---

## 4. Encryption-at-rest contract

| Aspect                          | Design                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------ | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Algorithm**                   | Authenticated symmetric encryption (AES-256-GCM or equivalent AEAD). The implementation packet may use a vetted library (`node:crypto` AES-256-GCM, or a wrapper like `iron-webcrypto`). Authenticated encryption is required so that tampering with ciphertext is detectable; non-AEAD modes are forbidden.                                                                                                                                   |
| **Envelope format**             | The encrypted column stores a self-describing envelope: `version (1 byte)                                                                                                                                                                                                                                                                                                                                                                      |     | nonce (12 bytes for GCM) |     | ciphertext+tag`. Storing the nonce + tag inline keeps the decryption path self-contained. The leading version byte allows §7 rotation to introduce algorithm changes without an extra column lookup. |
| **What is encrypted**           | The plaintext JSON shape `{ apiKey: "...", apiSecret: "..." }` (or whatever the credentials shape was before encryption) is serialised to JSON, then encrypted. The whole JSON blob is the plaintext input to AES-GCM.                                                                                                                                                                                                                         |
| **What is NOT encrypted**       | `tenant_id`, `integration_type`, `integration_name`, `is_active`, `created_at`, `updated_at`, and `config` (which holds `base_url`) all remain plaintext columns. They are not secrets and are needed for the router's SQL filter (§5 of Phase 4-2). `base_url` specifically must stay plaintext so the sandbox-only URL guard at `erpnextSandboxAdapter.js:89-128` can be applied against the row's URL without decrypting credentials first. |
| **Nonce uniqueness**            | Nonce MUST be unique per (key version, plaintext) pair. AES-GCM nonce reuse is a key-compromise event. The implementation packet uses `crypto.randomBytes(12)` for each encryption operation; tests verify that two encryptions of the same plaintext produce different ciphertexts (because of nonce randomness).                                                                                                                             |
| **No deterministic encryption** | Equality-search over encrypted credentials is NOT a requirement. The router does not search by credential value; it looks up by `tenant_id + integration_type + is_active`. So deterministic encryption (which would allow equality-search at the cost of weaker security properties) is forbidden — the random-nonce AEAD shape above is the only acceptable mode.                                                                            |
| **No client-side encryption**   | Encryption / decryption happens server-side, inside the backend boundary. The frontend never sees encrypted blobs and never sees plaintext credentials (UI Slice 1 §13 already excludes any credential-management surface from the frontend; that posture is preserved).                                                                                                                                                                       |

---

## 5. Key management

The encryption key must live **somewhere the backend can load it at boot but no operator can read it from a database row**. Phase 4-3 design accommodates multiple key sources; the implementation packet picks the production-ready one.

| Aspect                   | Design                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Key source options**   | The implementation packet picks one of: (a) **Doppler-supplied key** — `FINANCE_CREDENTIAL_KEY_V1` env var in Doppler `stg_stg` / `prd_prd`; backend reads at boot. Simple, mirrors existing Doppler integration. (b) **External KMS** — AWS KMS, GCP KMS, or HashiCorp Vault transit, accessed via a service-role at boot. Stronger key-rotation story; more infrastructure. Phase 4-3 design does not mandate (a) or (b); the implementation packet decides. **What is mandated**: the key MUST NOT live in the database. It MUST NOT be in any committed file. It MUST be auditable (who read it, when, from where). |
| **Loading**              | Key is loaded once at backend boot. The decrypted key material lives in process memory for the lifetime of the process. The key is NEVER written to disk after boot, NEVER logged, NEVER returned in any HTTP response.                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Access scope**         | Only the credential router (Phase 4-2) has access to the key. The route layer, the projection workers, the API client, the frontend — none of them load it. The implementation packet enforces this via module isolation: the key-loading module exports `encrypt(plaintext)` / `decrypt(ciphertext)` functions, not the key itself.                                                                                                                                                                                                                                                                                    |
| **Versioning**           | Keys have a version number (`v1`, `v2`, …). The `api_credentials_key_version` column records which version encrypted each row. On rotation (§7), new rows are encrypted with the new key version; old rows continue to decrypt under their original key version until they are re-encrypted by an operator action.                                                                                                                                                                                                                                                                                                      |
| **Boot-time validation** | At backend boot, the loaded key MUST decrypt a known-good test vector (constant ciphertext encrypting a constant plaintext under the current key version). If the test vector does not decrypt, the backend refuses to start. This is the same fail-loud posture as Phase 4-1's loud-on-misconfig rule — operator pages on key misconfiguration immediately rather than discovering it on first credential lookup.                                                                                                                                                                                                      |
| **No key-by-tenant**     | Phase 4-3 uses one key per environment (one for `stg_stg`, one for `prd_prd`), not one key per tenant. Per-tenant keys would multiply the key-rotation operational cost without a clear security benefit — tenant isolation is enforced at the row level by `tenant_id` filter (Phase 4-2 §5), not at the key level. Phase 5 may revisit if tenant-specific compliance requirements emerge.                                                                                                                                                                                                                             |

---

## 6. Decrypt-at-read code path

The decryption boundary lives inside the Phase 4-2 credential router. Specifically:

```
Phase 4-2 router.lookup(tenant_id):
  - Execute SQL: SELECT api_credentials, api_credentials_encrypted, api_credentials_key_version
                 FROM tenant_integrations
                 WHERE tenant_id = $1 AND integration_type = $2 AND is_active = true;
  - For each row returned:
    - If api_credentials_encrypted IS NOT NULL:
      - keyVersion := row.api_credentials_key_version
      - plaintext := decrypt(row.api_credentials_encrypted, keyVersion)  // §4 envelope format
      - credentials := JSON.parse(plaintext)
    - Else if api_credentials (plaintext JSONB) IS NOT NULL and NOT empty:
      - credentials := row.api_credentials
      - Log a warning: "tenant_integrations row {row.id} uses plaintext credentials —
        consider re-encrypting per Phase 4-3 rotation runbook"
      - (This branch only executes for legacy staging rows during the transition. Production
        rows MUST have api_credentials_encrypted populated; the implementation packet's
        production migration runbook (Phase 4-6) verifies no plaintext row exists before
        production apply.)
    - Else:
      - Throw "malformed credentials" per Phase 4-2 §8.
  - Return credentials.
```

**Hard rule:** decryption is the ONLY operation that turns ciphertext into plaintext. There is no other code path in the codebase that reads `api_credentials_encrypted`. Tests verify this by static-grep (§10 row 11).

---

## 7. Rotation

Key rotation is a planned operational event, not an emergency response. Phase 4-3 freezes the rotation contract; the operational runbook for actually rotating a key lives in Phase 4-16 (rollback/operations) or a dedicated rotation runbook downstream.

**Rotation contract:**

1. **New key version provisioned.** Operator provisions the `FINANCE_CREDENTIAL_KEY_V2` env var (or new KMS key version).
2. **Backend supports both versions.** The decrypt path picks the key by `api_credentials_key_version`. The encrypt path always uses the latest version. Both v1-encrypted and v2-encrypted rows decrypt correctly during the rotation window.
3. **Re-encryption is operator-driven**, not automatic. Operator runs a one-off script (designed in the rotation runbook) that decrypts each row under v1 and re-encrypts under v2, updating `api_credentials_key_version` to 2 and `api_credentials_encrypted_at` to now. The script is idempotent (skips rows already on v2).
4. **Old key version retired.** Once all active rows are on the new version, the operator removes the old key env var from Doppler. Subsequent boots refuse to start if any active row still references the retired version.

**No automatic rotation on every credential write.** The encrypt-with-latest-version rule covers the new-credential-row case naturally; for existing rows, rotation is a deliberate operational event.

**Failure case — credential cannot be decrypted under any current key version**: log the error (without the ciphertext value), increment a "credential decrypt failure" metric (Phase 4-4 observability signal), and treat the row as "malformed" per Phase 4-2 §8. The job for that tenant skips. Operator action required.

---

## 8. Rollback

**Migration rollback** (forward-only migration; rollback is operator-side):

If the migration must be reverted (e.g., a critical bug surfaces post-apply), the operator:

1. Stops the backend (no in-flight reads against the new columns).
2. Issues `ALTER TABLE tenant_integrations DROP COLUMN api_credentials_encrypted, DROP COLUMN api_credentials_key_version, DROP COLUMN api_credentials_encrypted_at;` under a transaction.
3. Starts the backend with the prior-version image (which doesn't reference the new columns).

PITR-snapshot protection (per Phase 3-2 / Phase 4-6 pattern) makes this safe: a snapshot taken pre-migration provides the alternative rollback path.

**Per-row rollback** (a single row's encryption needs to be reverted):

Operator decrypts the row's `api_credentials_encrypted` value (server-side, never logging the plaintext), writes the plaintext back to `api_credentials JSONB`, and sets `api_credentials_encrypted = NULL`. This is a degraded state per the warning in §6; the operator records the action in the audit log per §9 and plans re-encryption.

**Hard constraint** (per the Slack directive):

- **No rollback procedure may depend on destructive data deletion.** Rolling back the encryption migration does not require dropping rows; it requires only column structure changes. Per-row rollback to plaintext is a fully recoverable operation. Phase 4-5 (production rollback design) enforces this hard constraint cross-cutting; Phase 4-3 honors it for the credential domain specifically.

---

## 9. Audit logging

Credential operations are sensitive. Phase 4-3 freezes which operations produce an audit-trail entry and what each entry contains (without leaking secrets). Phase 4-4 (production observability) consumes these signals.

| Operation                                   | Audit-trail entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Credential read (router lookup success)** | Audit log entry: `{ event_type: 'finance.credential.lookup.ok', tenant_id, integration_type, key_version, ts }`. **No credential values.** Sampled (e.g., 1-in-N or 1-per-tenant-per-window) if high-volume; the implementation packet decides sampling. Stored in either `audit_events` (finance domain) or a separate audit log table — Phase 4-3 leaves the destination to the implementation packet; the contract is that an audit-trail entry exists for every successful lookup. |
| **Credential read (router lookup failure)** | Audit log entry: `{ event_type: 'finance.credential.lookup.fail', tenant_id, integration_type, failure_reason: 'not_found' \| 'inactive' \| 'malformed' \| 'duplicate_rows' \| 'pg_error' \| 'decrypt_failure', ts }`. Failure reason mirrors Phase 4-2 §8 + §7 decrypt-failure case. **No credential values; no key value; no ciphertext value.** Always logged (no sampling — failures are signal).                                                                                  |
| **Credential write (row insert / update)**  | Out of Phase 4-3 scope — credential write is operator-side via a management surface that does not exist yet in the codebase. The management surface, when built, MUST emit an audit-trail entry of shape `{ event_type: 'finance.credential.write', tenant_id, integration_type, actor, key_version, ts }`. **No credential value.** Recorded here as a forward contract.                                                                                                              |
| **Key rotation (per-row re-encryption)**    | Audit log entry per row: `{ event_type: 'finance.credential.rotate', tenant_id, integration_type, from_key_version, to_key_version, ts }`. **No credential value; no key value.**                                                                                                                                                                                                                                                                                                      |
| **Key load failure at backend boot**        | Backend boot logs the failure with a distinct error class. Audit log entry not emitted (no DB connectivity may exist at boot failure time). Phase 4-4 observability designs the alert that fires on boot-failure-with-key-error.                                                                                                                                                                                                                                                       |

**Hard rule (mirrors Phase 4-2 §9 + §5):** no audit-trail entry, log line, error message, or exception trace anywhere in the codebase contains a credential value or a key value. Tests verify this (§10 row 11).

---

## 10. Required test surface

The implementation packet must include the test rows below before Codex can clear it.

| #   | Test                                                                                                                                                                                                                                                                            | Lives where                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | **Encrypt + decrypt round-trip preserves bytes.** Plaintext `{"apiKey":"k","apiSecret":"s"}` round-trips through encrypt() → decrypt() and parses identically.                                                                                                                  | `backend/__tests__/lib/finance/credentialEncryption.test.js` (new)                        |
| 2   | **Two encryptions of the same plaintext produce different ciphertexts.** Nonce uniqueness verification.                                                                                                                                                                         | Same.                                                                                     |
| 3   | **Tampered ciphertext fails decryption.** Modify one byte of ciphertext; decrypt() throws an AuthenticationError (or equivalent). Verifies AEAD authentication.                                                                                                                 | Same.                                                                                     |
| 4   | **Wrong key version fails decryption.** Encrypt with v1; attempt decrypt with v2; decrypt throws. Demonstrates per-version isolation.                                                                                                                                           | Same.                                                                                     |
| 5   | **Boot-time test vector decrypts.** A known-good fixture (constant ciphertext, constant plaintext) decrypts at boot under the loaded key. Failure mode: backend refuses to start.                                                                                               | `backend/__tests__/lib/finance/credentialEncryption.boot.test.js` (new)                   |
| 6   | **Router lookup picks up encrypted row.** Seed `tenant_integrations` with `api_credentials_encrypted` set (encrypted under v1) + `api_credentials_key_version = 1`; router returns decrypted credentials.                                                                       | `backend/__tests__/lib/finance/erpnextCredentialRouter.test.js` (extends Phase 4-2 tests) |
| 7   | **Router lookup falls back to plaintext for legacy row + warns.** Seed row with `api_credentials_encrypted = NULL` + plaintext `api_credentials`; router returns the plaintext credentials AND emits the warning log entry mandated by §6.                                      | Same.                                                                                     |
| 8   | **Router throws on row with both encrypted and plaintext populated.** Configuration drift; treat as malformed.                                                                                                                                                                  | Same.                                                                                     |
| 9   | **Router throws on decrypt failure (corrupt ciphertext).** Tampered row triggers the §7 decrypt-failure path; router throws; audit log entry `finance.credential.lookup.fail` with reason `decrypt_failure` is emitted.                                                         | Same.                                                                                     |
| 10  | **Mixed-version rotation works.** Seed two active rows for different tenants — one v1-encrypted, one v2-encrypted; router decrypts each correctly.                                                                                                                              | Same.                                                                                     |
| 11  | **No credential / key value appears in any log line, error, or exception trace.** Capture all log output during an error sweep — wrong key, corrupt row, plaintext fallback, success, rotation log — and grep for any test credential value or key prefix; assert zero matches. | `backend/__tests__/lib/finance/credentialEncryption.leakage.test.js` (new)                |
| 12  | **Migration is forward-only safe to re-apply.** Idempotent execution: running the migration twice does not error and does not change the schema after the first apply (uses `IF NOT EXISTS` patterns).                                                                          | Migration-runner test (existing harness or new)                                           |
| 13  | **`base_url` stays plaintext.** The migration does NOT introduce encryption for the `config.base_url` field. Phase 4-2's sandbox-only URL guard relies on plaintext access.                                                                                                     | Static schema assertion                                                                   |
| 14  | **Audit log entry shape matches §9 for success + failure paths.** Each success / failure path emits an audit entry with the documented fields, no credential / key value, and the documented event_type.                                                                        | `backend/__tests__/lib/finance/credentialEncryption.audit.test.js` (new)                  |

---

## 11. Hard constraints (explicit restatement)

| Constraint                                                                                                                                            | Source                                           | Status this task                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Design encrypted credential storage for tenant provider credentials.**                                                                              | Slack directive                                  | §3 + §4 + §6.                                                                                                                                                              |
| **Define migration shape but do not apply it.**                                                                                                       | Slack directive                                  | §3 + §2 + §8.                                                                                                                                                              |
| **Define key management assumptions.**                                                                                                                | Slack directive                                  | §5.                                                                                                                                                                        |
| **Define rotation/rollback posture.**                                                                                                                 | Slack directive                                  | §7 + §8.                                                                                                                                                                   |
| **Define audit logging requirements for credential access without leaking secrets.**                                                                  | Slack directive                                  | §9 + §10 row 11.                                                                                                                                                           |
| **No code yet.**                                                                                                                                      | Slack directive                                  | Confirmed.                                                                                                                                                                 |
| **No migration applied anywhere.**                                                                                                                    | Slack directive                                  | Confirmed.                                                                                                                                                                 |
| **No store-side fallback that would re-introduce plaintext as a long-term posture.**                                                                  | Codex Gate C                                     | §6 plaintext branch is transitional only with mandatory warning; Phase 4-6 production migration runbook verifies no active production row references the plaintext column. |
| **No log / error / response ever contains credential or key value.**                                                                                  | Codex Gate C + §9 + §10 row 11                   | Confirmed.                                                                                                                                                                 |
| **No rollback procedure depends on destructive data deletion.**                                                                                       | Slack directive (Phase 4-5 hard constraint) + §8 | Confirmed — column-drop rollback is non-destructive; per-row rollback preserves plaintext recovery.                                                                        |
| **Pair with Phase 4-2 — implementation cadence enforced (Phase 4-2 implementation gated on Phase 4-3 design at minimum; preferably ships together).** | Phase 4-0 §7 implementation cadence              | §1 + §6.                                                                                                                                                                   |

---

## 12. Acceptance for Phase 4-3 (this task)

- [x] Encrypted credential storage designed (§3 + §4 — migration shape, AEAD algorithm, envelope format).
- [x] Migration shape defined but not applied (§3 + §2).
- [x] Key management assumptions defined (§5 — key source options, loading, scope, versioning, boot-time validation, single-key-per-env).
- [x] Rotation posture defined (§7 — operator-driven per-row re-encryption; old version retirement; mixed-version reads supported during window).
- [x] Rollback posture defined (§8 — migration rollback via column drop; per-row rollback to plaintext; PITR-snapshot protection; no destructive data deletion).
- [x] Audit logging requirements defined (§9 — success/failure/rotation/write event-types with no secret leak).
- [x] Required test surface defined (§10 — 14 tests).
- [x] Hard constraints status-confirmed (§11).
- [x] CHANGELOG entry recording Phase 4-3 (separate change).

---

## 13. Next active item

After this packet lands and Codex reviews it (in parallel with Phase 4-2):

**Next active item:** Phase 4-3 implementation packet (separately dispatched after Codex clears this design). Phase 4-2 implementation packet may ship together with Phase 4-3 implementation packet per Phase 4-0 §7 implementation cadence rule. Phase 4-4, 4-5, 4-15 may be authored in parallel.
