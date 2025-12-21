import { BraidAdapter, BraidAdapterContext } from "../index";
import { BraidAction, BraidActionResult } from "../types";

// Node 18+ provides a global fetch
declare const fetch: any;

function getGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

async function callGitHubAPI(
  path: string,
  token: string,
  ctx: BraidAdapterContext
): Promise<any> {
  const url = `https://api.github.com${path}`;
  ctx.debug("Calling GitHub API", { url });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "aishacrm-braid-mcp",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${text}`);
  }

  return await response.json();
}

export const GitHubAdapter: BraidAdapter = {
  system: "github",

  async handleAction(
    action: BraidAction,
    ctx: BraidAdapterContext
  ): Promise<BraidActionResult> {
    ctx.info("GitHub adapter handling action", {
      actionId: action.id,
      verb: action.verb,
      resource: action.resource,
    });

    const token = getGitHubToken();
    if (!token) {
      return {
        actionId: action.id,
        status: "error",
        resource: action.resource,
        errorCode: "MISSING_TOKEN",
        errorMessage: "GITHUB_TOKEN or GH_TOKEN environment variable not configured",
      };
    }

    const kind = action.resource.kind.toLowerCase();
    const payload = (action.payload || {}) as Record<string, unknown>;

    try {
      if (kind === "repos" || kind === "list_repos") {
        const perPage = Math.min(Number(payload.per_page || 10), 100);
        const data = await callGitHubAPI(`/user/repos?per_page=${perPage}`, token, ctx);

        return {
          actionId: action.id,
          status: "success",
          resource: action.resource,
          data,
        };
      }

      if (kind === "user" || kind === "get_user") {
        const data = await callGitHubAPI("/user", token, ctx);

        return {
          actionId: action.id,
          status: "success",
          resource: action.resource,
          data,
        };
      }

      return {
        actionId: action.id,
        status: "error",
        resource: action.resource,
        errorCode: "UNSUPPORTED_KIND",
        errorMessage: `GitHub adapter does not support kind "${action.resource.kind}"`,
      };
    } catch (err: any) {
      ctx.error("GitHub adapter error", { error: err?.message ?? String(err) });
      return {
        actionId: action.id,
        status: "error",
        resource: action.resource,
        errorCode: "GITHUB_ERROR",
        errorMessage: err?.message ?? String(err),
      };
    }
  },
};
