import { BraidAdapter, BraidAdapterContext } from "../index";
import { BraidAction, BraidActionResult } from "../types";
import { appendEvent as memAppendEvent } from "../../lib/memory";

// Node 18+ provides a global fetch
declare const fetch: any;

async function searchWikipedia(
  query: string,
  ctx: BraidAdapterContext
): Promise<any[]> {
  ctx.debug("Searching Wikipedia", { query });

  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  const json = await response.json();

  return json?.query?.search || [];
}

async function getWikipediaPage(
  pageid: string,
  ctx: BraidAdapterContext
): Promise<any> {
  ctx.debug("Fetching Wikipedia page", { pageid });

  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&pageids=${encodeURIComponent(pageid)}`;
  const response = await fetch(url);
  const json = await response.json();

  return json?.query?.pages?.[pageid] || null;
}

export const WebAdapter: BraidAdapter = {
  system: "web",

  async handleAction(
    action: BraidAction,
    ctx: BraidAdapterContext
  ): Promise<BraidActionResult> {
    ctx.info("Web adapter handling action", {
      actionId: action.id,
      verb: action.verb,
      resource: action.resource,
    });

    const kind = action.resource.kind.toLowerCase();
    const payload = (action.payload || {}) as Record<string, unknown>;

    const metadata = (action.metadata || {}) as Record<string, unknown>;
    const tenantId = (metadata.tenant_id as string) || (payload.tenant_id as string) as any;
    const userId = (metadata.user_id as string) || (payload.user_id as string) as any;
    const sessionId = (metadata.session_id as string) || (payload.session_id as string) || (action.targetId as string);

    try {
      if (kind === "wikipedia-search" || kind === "search_wikipedia") {
        const query = payload.q || payload.query;
        if (!query || typeof query !== "string") {
          return {
            actionId: action.id,
            status: "error",
            resource: action.resource,
            errorCode: "MISSING_QUERY",
            errorMessage: "Query parameter 'q' or 'query' is required",
          };
        }

        const results = await searchWikipedia(query, ctx);
        if (tenantId && userId && sessionId) {
          void memAppendEvent(tenantId, userId, sessionId, { system: 'web', kind: 'wikipedia-search', q: query, ok: true, count: Array.isArray(results) ? results.length : 0 });
        }

        return {
          actionId: action.id,
          status: "success",
          resource: action.resource,
          data: results,
        };
      }

      if (kind === "wikipedia-page" || kind === "get_wikipedia_page") {
        const pageid = payload.pageid || payload.pageId;
        if (!pageid) {
          return {
            actionId: action.id,
            status: "error",
            resource: action.resource,
            errorCode: "MISSING_PAGEID",
            errorMessage: "Parameter 'pageid' is required",
          };
        }

        const page = await getWikipediaPage(String(pageid), ctx);
        if (tenantId && userId && sessionId) {
          void memAppendEvent(tenantId, userId, sessionId, { system: 'web', kind: 'wikipedia-page', pageid: String(pageid), ok: true });
        }

        return {
          actionId: action.id,
          status: "success",
          resource: action.resource,
          data: page,
        };
      }

      return {
        actionId: action.id,
        status: "error",
        resource: action.resource,
        errorCode: "UNSUPPORTED_KIND",
        errorMessage: `Web adapter does not support kind "${action.resource.kind}"`,
      };
    } catch (err: any) {
      ctx.error("Web adapter error", { error: err?.message ?? String(err) });
      if (tenantId && userId && sessionId) {
        void memAppendEvent(tenantId, userId, sessionId, { system: 'web', kind, ok: false, error: err?.message ?? String(err) });
      }
      return {
        actionId: action.id,
        status: "error",
        resource: action.resource,
        errorCode: "WEB_ERROR",
        errorMessage: err?.message ?? String(err),
      };
    }
  },
};