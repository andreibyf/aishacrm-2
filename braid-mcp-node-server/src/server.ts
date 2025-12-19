import express, { Request, Response, NextFunction } from "express";
import { InMemoryBraidRegistry } from "./braid/registry";
import { BraidExecutor } from "./braid/executor";
import { createConsoleLogger } from "./braid";
import { MockAdapter } from "./braid/adapters/mock";
import { CrmAdapter } from "./braid/adapters/crm";
import { WebAdapter } from "./braid/adapters/web";
import { GitHubAdapter } from "./braid/adapters/github";
import { LlmAdapter } from "./braid/adapters/llm";
import { MemoryAdapter } from "./braid/adapters/memory";
import { BraidRequestEnvelope } from "./braid/types";
import { initMemory, isMemoryAvailable, getStatus as getMemoryStatus } from "./lib/memory";

const app = express();

// CORS middleware - allow frontend to access MCP server
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.get("origin");
  const allowedOrigins = [
    "http://localhost:4000",
    "http://localhost:5173",
    "http://localhost:3000"
  ];
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: "1mb" }));

// Simple logging middleware (replace with real logger if needed)
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.info(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// Setup Braid registry and executor
const registry = new InMemoryBraidRegistry();
registry.registerAdapter(MockAdapter);
registry.registerAdapter(CrmAdapter);
registry.registerAdapter(WebAdapter);
registry.registerAdapter(GitHubAdapter);
registry.registerAdapter(LlmAdapter);
registry.registerAdapter(MemoryAdapter);

const executor = new BraidExecutor(registry, {
  logger: createConsoleLogger(),
});

// Initialize memory (non-fatal)
void (async () => {
  try {
    await initMemory(process.env.REDIS_URL);
    console.log(`[MCP] Memory layer ${isMemoryAvailable() ? 'available' : 'unavailable'}`);
  } catch (e: any) {
    console.warn('[MCP] Memory init failed:', e?.message || String(e));
  }
})();

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "braid-mcp-node-server" });
});

// Memory quick status (debug)
app.get("/memory/status", async (_req: Request, res: Response) => {
  try {
    const st = await getMemoryStatus();
    res.json({ status: 'success', data: st });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e?.message || String(e) });
  }
});

// MCP-style endpoint for executing Braid envelopes
app.post("/mcp/run", async (req: Request, res: Response) => {
  const body = req.body as Partial<BraidRequestEnvelope>;

  if (!body || !body.requestId || !body.actor || !Array.isArray(body.actions)) {
    return res.status(400).json({
      error: "INVALID_ENVELOPE",
      message: "Body must be a valid BraidRequestEnvelope with requestId, actor, and actions[]",
    });
  }

  try {
    const envelope: BraidRequestEnvelope = {
      requestId: body.requestId,
      actor: body.actor,
      actions: body.actions,
      createdAt: body.createdAt ?? new Date().toISOString(),
      client: body.client,
      channel: body.channel,
      // Propagate incoming metadata and attach HTTP info for audit purposes
      metadata: {
        ...(body.metadata ?? {}),
        http: {
          ip: req.ip,
          user_agent: req.get("user-agent") || null,
        },
      },
    };

    const response = await executor.executeEnvelope(envelope);
    res.json(response);
  } catch (err: any) {
    console.error("Error in /mcp/run", err);
    res.status(500).json({
      error: "MCP_EXECUTION_ERROR",
      message: err?.message ?? String(err),
    });
  }
});

// Basic error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "UNHANDLED_ERROR", message: err?.message ?? String(err) });
});

const port = process.env.PORT || 8000;
// Startup env sanity check (non-fatal): informs developer if required vars are missing.
const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRM_BACKEND_URL", "JWT_SECRET"];
const missing = requiredEnv.filter(k => !process.env[k] || String(process.env[k]).trim() === "");
if (missing.length) {
  console.warn(`[ENV WARNING] Missing env vars: ${missing.join(', ')}. Create braid-mcp-node-server/.env or sync from backend/.env (see docs/mcp/README.md).`);
}
app.listen(port, () => {
  console.log(`Braid MCP Node server listening on port ${port}`);
});
