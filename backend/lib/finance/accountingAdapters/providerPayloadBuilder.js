/**
 * Provider Payload Builder — Slice 2A (per slice-2-adapter-runtime-design.md §4.5).
 *
 * Strips internal AiSHA runtime metadata from a canonical object before it is
 * dispatched to an external accounting provider. This is the single boundary
 * where AiSHA-internal concerns (governance, telemetry, multitenancy,
 * actor-IDs) are removed from outbound payloads.
 *
 * The stripping is performed via a **denylist with explicit allowlist
 * override**. Rationale (per §4.5): the canonical shape evolves; a denylist of
 * "internal fields that are never provider-bound" is more maintainable than an
 * allowlist that needs updating with every new canonical field.
 *
 * Adapters that legitimately need to send a normally-denylisted key (e.g. a
 * provider that genuinely expects `tenant_id`) may pass an `allowlist` Set in
 * `runtimePolicy.allowlist` — those keys are exempted from stripping.
 */

/**
 * Mandatory denylist per §4.5. Any key matching one of these names is stripped
 * recursively from the payload at any depth. The leading-underscore convention
 * is enforced separately (see `stripInternalKeys`).
 */
export const INTERNAL_METADATA_DENYLIST = Object.freeze([
  // Internal AiSHA runtime flag set by mapJournalEntryToQuickBooksCanonical:52
  'draft_only',
  // Governance / policy metadata
  'governance_decision',
  'policy_decision',
  'governance_policy_snapshot',
  // AiSHA telemetry / event-lineage context
  'braid_trace_id',
  'correlation_id',
  'causation_id',
  'request_id',
  // Multitenancy — provider is tenant-scoped via auth credentials, never via payload field
  'tenant_id',
  // Internal AI-actor flag
  'ai_generated',
  // Internal AiSHA user IDs that don't map to provider users without a separate user-mapping table
  'created_by',
  'updated_by',
  'approved_by',
]);

/**
 * Test helper — throws if any denylisted key (or any key starting with `_`)
 * appears at any depth inside `payload`. Used by every adapter's `pushDraft`
 * test per §4.5 test obligation.
 *
 * @param {unknown} payload — the object that would be sent to the provider
 * @throws {Error} if any denylisted key is present
 */
export function assertNoInternalMetadata(payload) {
  const visited = new WeakSet();

  function walk(node, path) {
    if (node === null || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, `${path}[${idx}]`));
      return;
    }

    for (const key of Object.keys(node)) {
      if (INTERNAL_METADATA_DENYLIST.includes(key)) {
        throw new Error(
          `Internal metadata leak: denylisted key "${key}" found at path "${path}.${key}"`,
        );
      }
      if (key.startsWith('_')) {
        throw new Error(
          `Internal metadata leak: leading-underscore key "${key}" found at path "${path}.${key}"`,
        );
      }
      walk(node[key], `${path}.${key}`);
    }
  }

  walk(payload, '$');
}

/**
 * Deeply clone + strip internal metadata. The returned payload is safe to send
 * to the provider — `assertNoInternalMetadata` is guaranteed to pass against
 * it (modulo allowlist overrides).
 *
 * @param {Object} canonicalObject — the canonical-shape object from the adapter's `fromCanonical()`
 * @param {Object} [runtimePolicy] — the job's mode + decision context (NOT included in output)
 * @param {Set<string>|string[]} [runtimePolicy.allowlist] — keys exempted from stripping
 * @returns {Object} payload safe to send to the provider
 */
export function buildProviderPayload(canonicalObject, runtimePolicy = {}) {
  if (canonicalObject === null || typeof canonicalObject !== 'object') {
    throw new TypeError('buildProviderPayload: canonicalObject must be a non-null object');
  }

  const allowlistRaw = runtimePolicy?.allowlist;
  const allowlist =
    allowlistRaw instanceof Set
      ? allowlistRaw
      : new Set(Array.isArray(allowlistRaw) ? allowlistRaw : []);

  return stripInternalKeys(canonicalObject, allowlist);
}

function stripInternalKeys(value, allowlist) {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => stripInternalKeys(item, allowlist));
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (typeof value !== 'object') {
    return value;
  }

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const isDenylisted = INTERNAL_METADATA_DENYLIST.includes(key);
    const isLeadingUnderscore = key.startsWith('_');
    const isAllowed = allowlist.has(key);

    if ((isDenylisted || isLeadingUnderscore) && !isAllowed) {
      continue;
    }

    out[key] = stripInternalKeys(child, allowlist);
  }
  return out;
}

export default {
  buildProviderPayload,
  assertNoInternalMetadata,
  INTERNAL_METADATA_DENYLIST,
};
