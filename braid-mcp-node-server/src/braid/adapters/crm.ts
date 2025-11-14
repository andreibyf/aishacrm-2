import { BraidAdapter, BraidAdapterContext } from "../index";
import {
  BraidAction,
  BraidActionResult,
  BraidFilter,
  BraidSort,
} from "../types";
import { getSupabaseClient } from "../../lib/supabase";

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
      return {
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
      };
    }

    const data =
      json && typeof json === "object" && (json as any).data !== undefined
        ? (json as any).data
        : json;

    return {
      actionId: action.id,
      status: "success",
      resource: action.resource,
      data,
    };
  } catch (err: any) {
    ctx.error("CRM backend call threw error", {
      error: err?.message ?? String(err),
    });
    return {
      actionId: action.id,
      status: "error",
      resource: action.resource,
      errorCode: "NETWORK_ERROR",
      errorMessage: err?.message ?? String(err),
    };
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