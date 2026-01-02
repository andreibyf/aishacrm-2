import { BraidAdapter, BraidAdapterContext } from "../index";
import { BraidAction, BraidActionResult, BraidFilter } from "../types";
import { saveSession, appendEvent, getEvents, cachePreferences, getPreferences, deletePreferences, saveNavigation, getNavigation } from "../../lib/memory";

function getStr(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!obj) return undefined;
  const v = obj[key];
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}

function extractIds(action: BraidAction) {
  const p = (action.payload || {}) as Record<string, unknown>;
  const m = (action.metadata || {}) as Record<string, unknown>;
  const f = (action.filters || []) as BraidFilter[];

  const tenantId = getStr(p, 'tenant_id') || getStr(p, 'tenantId') || getStr(m, 'tenant_id') || getStr(m, 'tenantId');
  const userId = getStr(p, 'user_id') || getStr(p, 'userId') || getStr(m, 'user_id') || getStr(m, 'userId');
  const sessionId = getStr(p, 'session_id') || getStr(p, 'sessionId') || getStr(m, 'session_id') || getStr(m, 'sessionId') || action.targetId;

  // Allow filters to carry ids for search
  if (!tenantId && Array.isArray(f)) {
    const t = f.find(x => x.field === 'tenant_id' || x.field === 'tenantId');
    if (t && typeof t.value === 'string') m.tenant_id = t.value;
  }
  if (!userId && Array.isArray(f)) {
    const u = f.find(x => x.field === 'user_id' || x.field === 'userId');
    if (u && typeof u.value === 'string') m.user_id = u.value;
  }
  if (!sessionId && Array.isArray(f)) {
    const s = f.find(x => x.field === 'session_id' || x.field === 'sessionId');
    if (s && typeof s.value === 'string') m.session_id = s.value;
  }

  return {
    tenantId: tenantId || m.tenant_id || m.tenantId,
    userId: userId || m.user_id || m.userId,
    sessionId: sessionId || m.session_id || m.sessionId,
  } as { tenantId?: string; userId?: string; sessionId?: string };
}

function kindIs(k: string, variants: string[]): boolean {
  const low = (k || '').toLowerCase();
  return variants.some(v => v === low);
}

export const MemoryAdapter: BraidAdapter = {
  system: 'memory',

  async handleAction(action: BraidAction, ctx: BraidAdapterContext): Promise<BraidActionResult> {
    const { kind } = action.resource;

    // Create session
    if (action.verb === 'create' && kindIs(kind, ['session', 'sessions'])) {
      const { tenantId, userId, sessionId } = extractIds(action);
      const p = (action.payload || {}) as Record<string, unknown>;
      const ttl = typeof p['ttl_seconds'] === 'number' ? (p['ttl_seconds'] as number) : undefined;
      const data = (p['data'] ?? {}) as Record<string, unknown>;

      if (!tenantId || !userId || !sessionId) {
        return {
          actionId: action.id,
          status: 'error',
          resource: action.resource,
          errorCode: 'MISSING_IDS',
          errorMessage: 'tenant_id, user_id, session_id are required',
        };
      }
      if (action.options?.dryRun) {
        return { actionId: action.id, status: 'success', resource: action.resource, data: { dryRun: true } };
      }
      const ok = await saveSession(tenantId, userId, sessionId, data, ttl);
      return { actionId: action.id, status: ok ? 'success' : 'error', resource: action.resource, data: { ok } };
    }

    // Append event
    if (action.verb === 'create' && kindIs(kind, ['event', 'events'])) {
      const { tenantId, userId, sessionId } = extractIds(action);
      const p = (action.payload || {}) as Record<string, unknown>;
      const event = p['event'];
      if (!tenantId || !userId || !sessionId || !event) {
        return {
          actionId: action.id,
          status: 'error',
          resource: action.resource,
          errorCode: 'MISSING_FIELDS',
          errorMessage: 'tenant_id, user_id, session_id, event are required',
        };
      }
      if (action.options?.dryRun) {
        return { actionId: action.id, status: 'success', resource: action.resource, data: { dryRun: true } };
      }
      const ok = await appendEvent(tenantId, userId, sessionId, event);
      return { actionId: action.id, status: ok ? 'success' : 'error', resource: action.resource, data: { ok } };
    }

    // Get events
    if (action.verb === 'search' && kindIs(kind, ['event', 'events'])) {
      const { tenantId, userId, sessionId } = extractIds(action);
      const limit = Math.min(Number(action.options?.maxItems) || 50, 200);
      if (!tenantId || !userId || !sessionId) {
        return {
          actionId: action.id,
          status: 'error',
          resource: action.resource,
          errorCode: 'MISSING_IDS',
          errorMessage: 'tenant_id, user_id, session_id are required for event search',
        };
      }
      const data = await getEvents(tenantId, userId, sessionId, limit);
      return { actionId: action.id, status: 'success', resource: action.resource, data };
    }

    // Preferences: set
    if (action.verb === 'create' && kindIs(kind, ['preference','preferences','prefs'])) {
      const { tenantId, userId } = extractIds(action);
      const p = (action.payload || {}) as Record<string, unknown>;
      const ttl = typeof p['ttl_seconds'] === 'number' ? (p['ttl_seconds'] as number) : undefined;
      const preferences = (p['preferences'] ?? p['prefs'] ?? p) as Record<string, unknown>;
      if (!tenantId || !userId) {
        return { actionId: action.id, status: 'error', resource: action.resource, errorCode: 'MISSING_IDS', errorMessage: 'tenant_id and user_id are required for preferences' };
      }
      if (action.options?.dryRun) return { actionId: action.id, status: 'success', resource: action.resource, data: { dryRun: true } };
      const ok = await cachePreferences(tenantId, userId, preferences, ttl);
      return { actionId: action.id, status: ok ? 'success' : 'error', resource: action.resource, data: { ok } };
    }

    // Preferences: get
    if ((action.verb === 'read' || action.verb === 'search') && kindIs(kind, ['preference','preferences','prefs'])) {
      const { tenantId, userId } = extractIds(action);
      if (!tenantId || !userId) {
        return { actionId: action.id, status: 'error', resource: action.resource, errorCode: 'MISSING_IDS', errorMessage: 'tenant_id and user_id are required for preferences read' };
      }
      const data = await getPreferences(tenantId, userId);
      return { actionId: action.id, status: 'success', resource: action.resource, data };
    }

    // Preferences: delete
    if (action.verb === 'delete' && kindIs(kind, ['preference','preferences','prefs'])) {
      const { tenantId, userId } = extractIds(action);
      if (!tenantId || !userId) {
        return { actionId: action.id, status: 'error', resource: action.resource, errorCode: 'MISSING_IDS', errorMessage: 'tenant_id and user_id are required for preferences delete' };
      }
      if (action.options?.dryRun) return { actionId: action.id, status: 'success', resource: action.resource, data: { dryRun: true } };
      const ok = await deletePreferences(tenantId, userId);
      return { actionId: action.id, status: ok ? 'success' : 'error', resource: action.resource, data: { ok } };
    }

    // Navigation: set
    if (action.verb === 'create' && kindIs(kind, ['navigation','nav'])) {
      const { tenantId, userId } = extractIds(action);
      const p = (action.payload || {}) as Record<string, unknown>;
      const ttl = typeof p['ttl_seconds'] === 'number' ? (p['ttl_seconds'] as number) : undefined;
      const nav = (p['navigation'] ?? p['nav'] ?? p) as Record<string, unknown>;
      if (!tenantId || !userId) {
        return { actionId: action.id, status: 'error', resource: action.resource, errorCode: 'MISSING_IDS', errorMessage: 'tenant_id and user_id are required for navigation' };
      }
      if (action.options?.dryRun) return { actionId: action.id, status: 'success', resource: action.resource, data: { dryRun: true } };
      const ok = await saveNavigation(tenantId, userId, nav, ttl);
      return { actionId: action.id, status: ok ? 'success' : 'error', resource: action.resource, data: { ok } };
    }

    // Navigation: get
    if ((action.verb === 'read' || action.verb === 'search') && kindIs(kind, ['navigation','nav'])) {
      const { tenantId, userId } = extractIds(action);
      if (!tenantId || !userId) {
        return { actionId: action.id, status: 'error', resource: action.resource, errorCode: 'MISSING_IDS', errorMessage: 'tenant_id and user_id are required for navigation read' };
      }
      const data = await getNavigation(tenantId, userId);
      return { actionId: action.id, status: 'success', resource: action.resource, data };
    }

    return {
      actionId: action.id,
      status: 'error',
      resource: action.resource,
      errorCode: 'UNSUPPORTED_MEMORY_ACTION',
      errorMessage: `Unsupported memory action verb=${action.verb} kind=${kind}`,
    };
  }
};
