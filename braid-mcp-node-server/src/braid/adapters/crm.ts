import { BraidAdapter, BraidAdapterContext } from "../index";
import {
  BraidAction,
  BraidActionResult,
  BraidFilter,
  BraidSort,
} from "../types";
import { getSupabaseClient } from "../../lib/supabase";
import { appendEvent as memAppendEvent } from "../../lib/memory";

// Node 18+ provides a global fetch; declare for TypeScript.
declare const fetch: any;

type SupportedKind =
  | "accounts"
  | "leads"
  | "contacts"
  | "opportunities"
  | "activities";

function getBackendBaseUrl(): string {
  return (
    process.env.CRM_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:3001"
  );
}

function getTenantId(action: BraidAction): string | undefined {
  const metadata = (action.metadata || {}) as Record<string, unknown>;
  const payload = (action.payload || {}) as Record<string, unknown>;
  return (
    (metadata.tenant_id as string | undefined) ||
    (metadata.tenantId as string | undefined) ||
    (payload.tenant_id as string | undefined) ||
    (payload.tenantId as string | undefined)
  );
}

function getUserId(action: BraidAction): string | undefined {
  const metadata = (action.metadata || {}) as Record<string, unknown>;
  const payload = (action.payload || {}) as Record<string, unknown>;
  return (
    (metadata.user_id as string | undefined) ||
    (metadata.userId as string | undefined) ||
    (payload.user_id as string | undefined) ||
    (payload.userId as string | undefined)
  );
}

function getSessionId(action: BraidAction): string | undefined {
  const metadata = (action.metadata || {}) as Record<string, unknown>;
  const payload = (action.payload || {}) as Record<string, unknown>;
  return (
    (metadata.session_id as string | undefined) ||
    (metadata.sessionId as string | undefined) ||
    (payload.session_id as string | undefined) ||
    (payload.sessionId as string | undefined) ||
    action.targetId
  );
}

function logToMemory(action: BraidAction, ctx: BraidAdapterContext, event: Record<string, unknown>) {
  try {
    const tenantId = getTenantId(action);
    const userId = getUserId(action);
    const sessionId = getSessionId(action);
    if (tenantId && userId && sessionId) {
      void memAppendEvent(tenantId, userId, sessionId, {
        system: 'crm',
        verb: action.verb,
        resource: action.resource?.kind,
        targetId: action.targetId,
        ...event,
      });
    }
  } catch (e: any) {
    ctx.debug('Memory trace (CRM) failed', { error: e?.message ?? String(e) });
  }
}

function normalizeKind(kind: string): SupportedKind | undefined {
  const k = kind.toLowerCase();
  if (k === "account" || k === "accounts") return "accounts";
  if (k === "lead" || k === "leads") return "leads";
  if (k === "contact" || k === "contacts") return "contacts";
  if (k === "opportunity" || k === "opportunities" || k === "opp" || k === "opps") {
    return "opportunities";
  }
  if (k === "activity" || k === "activities") return "activities";
  return undefined;
}

// Redact sensitive fields from audit payloads. Returns a deep-cloned object
// with values replaced for keys that match common sensitive patterns.
function redactSensitive(input: unknown): unknown {
  const SENSITIVE_KEY_RE = /(email|ssn|social(_)?security|phone|card|creditcard|password|pwd)/i;

  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;

  if (Array.isArray(input)) {
    return input.map((v) => redactSensitive(v));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = redactSensitive(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function buildSearchParams(
  tenantId: string,
  filters?: BraidFilter[],
  sort?: BraidSort[],
  maxItems?: number
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("tenant_id", tenantId);

  if (typeof maxItems === "number" && maxItems > 0) {
    params.set("limit", String(maxItems));
  }

  if (filters) {
    for (const f of filters) {
      if (f.op === "eq" || f.op === "contains") {
        // Basic mapping: field=value, backend will ignore unknown fields.
        params.set(f.field, String(f.value));
      }
    }
  }

  // Sort is not directly supported by many CRM endpoints today; pass as hint.
  if (sort && sort.length > 0) {
    const encoded = sort
      .map((s) => `${s.field}:${s.direction}`)
      .join(",");
    params.set("sort", encoded);
  }

  return params;
}

async function callBackend(
  action: BraidAction,
  ctx: BraidAdapterContext,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  params?: URLSearchParams,
  body?: unknown
): Promise<BraidActionResult> {
  const baseUrl = getBackendBaseUrl();
  const url = new URL(path, baseUrl);

  if (params) {
    params.forEach((value, key) => {
      url.searchParams.append(key, value);
    });
  }

  ctx.debug("CRM adapter calling backend", {
    method,
    url: url.toString(),
    actionId: action.id,
  });

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }

    if (!response.ok) {
      ctx.error("CRM backend call failed", {
        status: response.status,
        body: json,
      });
      const errResult = {
        actionId: action.id,
        status: "error",
        resource: action.resource,
        errorCode: `HTTP_${response.status}`,
        errorMessage:
          (json as any)?.message ||
          (typeof json === "string" ? json : "Backend error"),
        details: {
          response: json as any,
        },
      } as BraidActionResult;
      // memory trace
      logToMemory(action, ctx, { ok: false, httpStatus: response.status, error: (errResult as any).errorMessage });
      return errResult;
    }

    const data =
      json && typeof json === "object" && (json as any).data !== undefined
        ? (json as any).data
        : json;

    // Audit write operations (non-dry-run). Record minimal info to `audit_log`.
    try {
      const verb = method.toUpperCase();
      if ((verb === "POST" || verb === "PUT" || verb === "DELETE") && !action.options?.dryRun) {
        const supa = getSupabaseClient();

        // Extract table name from path (/api/{table}/...)
        let tableName: string | null = null;
        const m = path.match(/^\/api\/([^\/\?]+)/);
        if (m && m[1]) tableName = m[1];

        const recordId = action.targetId ?? ((data && (data as any).id) || null);

        // Map to existing audit_log schema: tenant_id, user_email, action, entity_type,
        // entity_id, changes (jsonb), ip_address, user_agent, created_at (db default)
        const tenantIdForAudit = getTenantId(action) ?? null;
        const userEmailForAudit = (action.actor as any)?.email ?? (action.actor as any)?.id ?? null;
        const entityType = tableName ?? action.resource?.kind ?? null;
        const rawChanges = body ?? data ?? null;
        // Redact known sensitive fields before storing in audit log
        const changesObj = rawChanges ? redactSensitive(rawChanges) : null;
        const meta = action.metadata as any;
        const ipAddr = meta?.http?.ip ?? meta?.ip ?? null;
        const userAgent = meta?.http?.user_agent ?? meta?.userAgent ?? null;

        const auditRow: any = {
          tenant_id: tenantIdForAudit,
          user_email: userEmailForAudit,
          action: verb,
          entity_type: entityType,
          entity_id: recordId,
          changes: changesObj,
          ip_address: ipAddr,
          user_agent: userAgent,
          request_id: action.metadata?.requestId ?? null,
        };

        // Insert audit row, non-blocking for adapter success
        void (async () => {
          try {
            await supa.from('audit_log').insert([auditRow]);
            ctx.debug('Audit log inserted for CRM action', { actionId: action.id, entity: entityType });
          } catch (e: any) {
            ctx.warn('Failed to insert audit_log entry', { error: e?.message ?? String(e) });
          }
        })();
      }
    } catch (e) {
      ctx.warn('Audit logging encountered an error', { error: (e as any)?.message ?? String(e) });
    }

    const okResult: BraidActionResult = {
      actionId: action.id,
      status: "success",
      resource: action.resource,
      data,
    };
    logToMemory(action, ctx, { ok: true, size: Array.isArray(data) ? data.length : (data ? 1 : 0) });
    return okResult;
  } catch (err: any) {
    ctx.error("CRM backend call threw error", {
      error: err?.message ?? String(err),
    });
    const thrown: BraidActionResult = {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "NETWORK_ERROR",
      errorMessage: err?.message ?? String(err),
    };
    logToMemory(action, ctx, { ok: false, error: thrown.errorMessage, code: 'NETWORK_ERROR' });
    return thrown;
  }
}

async function handleRead(
  action: BraidAction,
  ctx: BraidAdapterContext
): Promise<BraidActionResult> {
  const tenantId = getTenantId(action);
  const kind = normalizeKind(action.resource.kind);

  if (!tenantId) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "MISSING_TENANT",
      errorMessage:
        "tenant_id (or tenantId) is required in metadata or payload for CRM read.",
    };
  }

  if (!kind) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "UNSUPPORTED_KIND",
      errorMessage: `Unsupported CRM resource kind for read: ${action.resource.kind}`,
    };
  }

  if (!action.targetId) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "MISSING_TARGET",
      errorMessage: "targetId is required for CRM read actions.",
    };
  }

  const params = new URLSearchParams();
  params.set("tenant_id", tenantId);

  return await callBackend(
    action,
    ctx,
    "GET",
    `/api/${kind}/${encodeURIComponent(action.targetId)}`,
    params
  );
}

async function handleSearch(
  action: BraidAction,
  ctx: BraidAdapterContext
): Promise<BraidActionResult> {
  const tenantId = getTenantId(action);
  const kind = normalizeKind(action.resource.kind);

  if (!tenantId) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "MISSING_TENANT",
      errorMessage:
        "tenant_id (or tenantId) is required in metadata or payload for CRM search.",
    };
  }

  if (!kind) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "UNSUPPORTED_KIND",
      errorMessage: `Unsupported CRM resource kind for search: ${action.resource.kind}`,
    };
  }

  // Check if direct Supabase access is available
  const useDirectAccess = process.env.USE_DIRECT_SUPABASE_ACCESS === "true";

  if (useDirectAccess) {
    try {
      const supa = getSupabaseClient();
      const limit = Math.min(Number(action.options?.maxItems) || 10, 100);
      const offset = 0; // TODO: add pagination support

      // Build query
      let query = supa
        .from(kind)
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Execute query
      const { data, error } = await query;

      if (error) {
        ctx.error("Supabase query error", { error: error.message });
        throw error;
      }

      // Client-side filtering if search query provided
      let filtered = data || [];
      const qFilter = action.filters?.find((f) => f.field === "q");

      if (qFilter && typeof qFilter.value === "string") {
        const qLower = String(qFilter.value).toLowerCase();

        filtered = filtered.filter((row: any) => {
          if (kind === "accounts") {
            const name = (row.name || '').toLowerCase();
            const industry = (row.industry || '').toLowerCase();
            const website = (row.website || '').toLowerCase();
            return name.includes(qLower) || industry.includes(qLower) || website.includes(qLower);
          } else if (kind === "contacts") {
            const first_name = (row.first_name || '').toLowerCase();
            const last_name = (row.last_name || '').toLowerCase();
            const email = (row.email || '').toLowerCase();
            return first_name.includes(qLower) || last_name.includes(qLower) || email.includes(qLower);
          } else if (kind === "leads") {
            const first_name = (row.first_name || '').toLowerCase();
            const last_name = (row.last_name || '').toLowerCase();
            const email = (row.email || '').toLowerCase();
            const company = (row.company || '').toLowerCase();
            return first_name.includes(qLower) || last_name.includes(qLower) || email.includes(qLower) || company.includes(qLower);
          }
          return true;
        });
      }

      ctx.info("Direct Supabase search successful", {
        kind,
        tenantId,
        count: filtered.length,
      });

      return {
        actionId: action.id,
        status: "success",
        resource: action.resource,
        data: filtered,
      };
    } catch (err: any) {
      ctx.warn("Direct Supabase access failed, falling back to backend API", {
        error: err?.message,
      });
      // Fall through to backend API call
    }
  }

  // Fallback to backend API
  const params = buildSearchParams(
    tenantId,
    action.filters,
    action.sort,
    action.options?.maxItems
  );

  // Special-case contacts: if "q" filter provided, use /search endpoint.
  if (kind === "contacts" && action.filters) {
    const qFilter = action.filters.find((f) => f.field === "q");
    if (qFilter && typeof qFilter.value === "string") {
      params.set("q", qFilter.value);
      return await callBackend(
        action,
        ctx,
        "GET",
        "/api/contacts/search",
        params
      );
    }
  }

  return await callBackend(action, ctx, "GET", `/api/${kind}`, params);
}

async function handleCreate(
  action: BraidAction,
  ctx: BraidAdapterContext
): Promise<BraidActionResult> {
  const tenantId = getTenantId(action);
  const kind = normalizeKind(action.resource.kind);

  if (!tenantId) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "MISSING_TENANT",
      errorMessage:
        "tenant_id (or tenantId) is required in metadata or payload for CRM create.",
    };
  }

  if (!kind) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "UNSUPPORTED_KIND",
      errorMessage: `Unsupported CRM resource kind for create: ${action.resource.kind}`,
    };
  }

  if (action.options?.dryRun) {
    ctx.info("Dry-run create - not mutating backend", {
      actionId: action.id,
      kind,
    });
    return {
      actionId: action.id,
      status: "success",
      resource: action.resource,
      data: {
        dryRun: true,
        payload: action.payload ?? {},
      },
    };
  }

  const body = {
    tenant_id: tenantId,
    ...(action.payload || {}),
  };

  return await callBackend(
    action,
    ctx,
    "POST",
    `/api/${kind}`,
    undefined,
    body
  );
}

async function handleUpdate(
  action: BraidAction,
  ctx: BraidAdapterContext
): Promise<BraidActionResult> {
  const tenantId = getTenantId(action);
  const kind = normalizeKind(action.resource.kind);

  if (!tenantId) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "MISSING_TENANT",
      errorMessage:
        "tenant_id (or tenantId) is required in metadata or payload for CRM update.",
    };
  }

  if (!kind) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "UNSUPPORTED_KIND",
      errorMessage: `Unsupported CRM resource kind for update: ${action.resource.kind}`,
    };
  }

  if (!action.targetId) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "MISSING_TARGET",
      errorMessage: "targetId is required for CRM update actions.",
    };
  }

  if (action.options?.dryRun) {
    ctx.info("Dry-run update - not mutating backend", {
      actionId: action.id,
      kind,
      targetId: action.targetId,
    });
    return {
      actionId: action.id,
      status: "success",
      resource: action.resource,
      data: {
        dryRun: true,
        targetId: action.targetId,
        payload: action.payload ?? {},
      },
    };
  }

  const body = {
    tenant_id: tenantId,
    ...(action.payload || {}),
  };

  return await callBackend(
    action,
    ctx,
    "PUT",
    `/api/${kind}/${encodeURIComponent(action.targetId)}`,
    undefined,
    body
  );
}

async function handleDelete(
  action: BraidAction,
  ctx: BraidAdapterContext
): Promise<BraidActionResult> {
  const tenantId = getTenantId(action);
  const kind = normalizeKind(action.resource.kind);

  if (!tenantId) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "MISSING_TENANT",
      errorMessage:
        "tenant_id (or tenantId) is required in metadata or payload for CRM delete.",
    };
  }

  if (!kind) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "UNSUPPORTED_KIND",
      errorMessage: `Unsupported CRM resource kind for delete: ${action.resource.kind}`,
    };
  }

  if (!action.targetId) {
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "MISSING_TARGET",
      errorMessage: "targetId is required for CRM delete actions.",
    };
  }

  if (action.options?.dryRun) {
    ctx.info("Dry-run delete - not mutating backend", {
      actionId: action.id,
      kind,
      targetId: action.targetId,
    });
    return {
      actionId: action.id,
      status: "success",
      resource: action.resource,
      data: {
        dryRun: true,
        targetId: action.targetId,
      },
    };
  }

  const params = new URLSearchParams();
  params.set("tenant_id", tenantId);

  return await callBackend(
    action,
    ctx,
    "DELETE",
    `/api/${kind}/${encodeURIComponent(action.targetId)}`,
    params
  );
}

export const CrmAdapter: BraidAdapter = {
  system: "crm",

  async handleAction(
    action: BraidAction,
    ctx: BraidAdapterContext
  ): Promise<BraidActionResult> {
    ctx.info("CRM adapter handling action", {
      actionId: action.id,
      verb: action.verb,
      resource: action.resource,
    });

    switch (action.verb) {
      case "read":
        return await handleRead(action, ctx);
      case "search":
        return await handleSearch(action, ctx);
      case "create":
        return await handleCreate(action, ctx);
      case "update":
        return await handleUpdate(action, ctx);
      case "delete":
        return await handleDelete(action, ctx);
      default:
        return {
          actionId: action.id,
          status: "error",
          resource: action.resource,
          errorCode: "UNSUPPORTED_VERB",
          errorMessage: `CRM adapter does not support verb "${action.verb}"`,
        };
    }
  },
};