import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const MCP_BASE_URL = process.env.MCP_BASE_URL || process.env.BRAID_MCP_URL || "http://localhost:8000";
const MCP_ALLOW_DELETE = String(process.env.MCP_ALLOW_DELETE || "").toLowerCase() === "true";
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || null;
const REQUEST_TIMEOUT_MS = Number(process.env.MCP_REQUEST_TIMEOUT_MS || "10000");

const server = new Server(
  { name: "braid-mcp-bridge", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const tools = [
  {
    name: "braid_mcp_action",
    description: "Run a single Braid MCP action against /mcp/run.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["verb", "system", "kind"],
      properties: {
        verb: { type: "string", description: "Action verb (read/search/create/update/delete)." },
        system: { type: "string", description: "Adapter system (crm/web/github/llm/mock)." },
        kind: { type: "string", description: "Adapter resource kind (e.g., accounts, leads)." },
        payload: { type: "object", additionalProperties: true },
        metadata: { type: "object", additionalProperties: true },
        options: { type: "object", additionalProperties: true },
        filters: { type: "array", items: { type: "object", additionalProperties: true } },
        sort: { type: "array", items: { type: "object", additionalProperties: true } },
        targetId: { type: "string" },
        actor: { type: "object", additionalProperties: true },
        requestId: { type: "string" }
      }
    }
  },
  {
    name: "braid_mcp_run",
    description: "Run a full BraidRequestEnvelope against /mcp/run.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["envelope"],
      properties: {
        envelope: { type: "object", additionalProperties: true }
      }
    }
  }
];

function normalizeTenantId(metadata, payload) {
  const tenantId =
    metadata?.tenant_id ||
    metadata?.tenantId ||
    payload?.tenant_id ||
    payload?.tenantId ||
    DEFAULT_TENANT_ID ||
    null;

  return tenantId;
}

function normalizeActor(inputActor) {
  if (inputActor && typeof inputActor === "object") {
    return inputActor;
  }
  return { id: "agent:continue", type: "agent" };
}

function toAction(input) {
  const action = {
    id: input.requestId ? `action-${input.requestId}` : `action-${Date.now()}`,
    verb: String(input.verb || "").toLowerCase(),
    actor: normalizeActor(input.actor),
    resource: { system: input.system, kind: input.kind },
    payload: input.payload || undefined,
    metadata: input.metadata || undefined,
    options: input.options || undefined,
    filters: input.filters || undefined,
    sort: input.sort || undefined,
    targetId: input.targetId || undefined
  };

  const tenantId = normalizeTenantId(action.metadata, action.payload);
  if (tenantId) {
    action.metadata = { ...(action.metadata || {}), tenant_id: tenantId };
  }

  return action;
}

function ensureDeleteAllowed(actions) {
  if (MCP_ALLOW_DELETE) {
    return null;
  }

  const hasDelete = actions.some((action) => String(action.verb || "").toLowerCase() === "delete");
  if (hasDelete) {
    return "Delete actions are blocked. Set MCP_ALLOW_DELETE=true to enable.";
  }

  return null;
}

async function postEnvelope(envelope) {
  const url = `${MCP_BASE_URL.replace(/\/$/, "")}/mcp/run`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`MCP HTTP ${response.status}: ${text}`);
    }

    return JSON.parse(text);
  } finally {
    clearTimeout(timeoutId);
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = request.params.arguments || {};

  if (name === "braid_mcp_action") {
    const action = toAction(args);
    const envelope = {
      requestId: args.requestId || `req-${Date.now()}`,
      actor: normalizeActor(args.actor),
      createdAt: new Date().toISOString(),
      actions: [action]
    };

    const deleteBlock = ensureDeleteAllowed(envelope.actions);
    if (deleteBlock) {
      return {
        content: [{ type: "text", text: deleteBlock }]
      };
    }

    const response = await postEnvelope(envelope);
    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
    };
  }

  if (name === "braid_mcp_run") {
    const envelope = args.envelope;
    if (!envelope || !Array.isArray(envelope.actions)) {
      throw new Error("Invalid envelope: must include actions array.");
    }

    const deleteBlock = ensureDeleteAllowed(envelope.actions);
    if (deleteBlock) {
      return {
        content: [{ type: "text", text: deleteBlock }]
      };
    }

    const response = await postEnvelope(envelope);
    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
