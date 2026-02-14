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
import { BraidRequestEnvelope, BraidResponseEnvelope } from "./braid/types";
import { CrmPolicies } from "./braid/policy";
import { initMemory, isMemoryAvailable, getStatus as getMemoryStatus } from "./lib/memory";
import { initQueue, initWorker, queueJob, getQueueStats, shutdownQueue } from "./lib/jobQueue";
import { getErrorMessage } from "./lib/errorUtils";
import logger from './lib/logger';

const app = express();

// Configuration
const MCP_ROLE = process.env.MCP_ROLE || "standalone"; // "server", "node", or "standalone"
const MCP_NODE_ID = process.env.MCP_NODE_ID || `mcp-${process.pid}`;

logger.debug(`[MCP] Starting in ${MCP_ROLE} mode (ID: ${MCP_NODE_ID})`);

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
  logger.info(`[HTTP] ${req.method} ${req.path}`);
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
  policies: CrmPolicies,
  logger: createConsoleLogger(),
});

// Execute an envelope (used by both modes)
async function executeEnvelope(envelope: BraidRequestEnvelope): Promise<BraidResponseEnvelope> {
  return executor.executeEnvelope(envelope);
}

// Initialize based on role
async function initializeRole(): Promise<void> {
  // Initialize memory for all modes
  try {
    await initMemory(process.env.REDIS_URL);
    logger.debug(`[MCP] Memory layer ${isMemoryAvailable() ? 'available' : 'unavailable'}`);
  } catch (e: unknown) {
    logger.warn(`[MCP] Memory init failed: ${getErrorMessage(e)}`);
  }

  if (MCP_ROLE === "server") {
    // Server mode: Initialize job queue for dispatching
    await initQueue();
    logger.debug("[MCP] Server mode: Queue initialized, accepting requests");
  } else if (MCP_ROLE === "node") {
    // Node mode: Initialize worker to process jobs
    await initWorker(executeEnvelope);
    logger.debug("[MCP] Node mode: Worker initialized, processing jobs");
  } else {
    // Standalone mode: Execute directly (backward compatible)
    logger.debug("[MCP] Standalone mode: Processing requests directly");
  }
}

// Health check
app.get("/health", async (_req: Request, res: Response) => {
  const baseHealth = { 
    status: "ok", 
    service: "braid-mcp-node-server",
    role: MCP_ROLE,
    nodeId: MCP_NODE_ID,
  };

  // Add queue stats for server mode
  if (MCP_ROLE === "server") {
    try {
      const queueStats = await getQueueStats();
      return res.json({ ...baseHealth, queue: queueStats });
    } catch (e: unknown) {
      return res.json({ ...baseHealth, queue: { error: getErrorMessage(e) } });
    }
  }

  res.json(baseHealth);
});

// Queue statistics endpoint (server mode only)
app.get("/queue/stats", async (_req: Request, res: Response) => {
  if (MCP_ROLE !== "server") {
    return res.status(400).json({ error: "Queue stats only available in server mode" });
  }

  try {
    const stats = await getQueueStats();
    res.json({ status: "success", data: stats });
  } catch (e: unknown) {
    res.status(500).json({ status: "error", message: getErrorMessage(e) });
  }
});

// Memory quick status (debug)
app.get("/memory/status", async (_req: Request, res: Response) => {
  try {
    const st = await getMemoryStatus();
    res.json({ status: 'success', data: st });
  } catch (e: unknown) {
    res.status(500).json({ status: 'error', message: getErrorMessage(e) });
  }
});

// List registered adapters and the current MCP role. Useful for admin introspection.
app.get("/adapters", (_req: Request, res: Response) => {
  try {
    res.json({
      status: "ok",
      role: MCP_ROLE || "unknown",
      adapters: registry.listAdapters(),
    });
  } catch (e: unknown) {
    res.status(500).json({ status: "error", message: getErrorMessage(e) });
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

    // Extract tenant ID from metadata or first action's metadata
    const tenantId = (body.metadata?.tenantId as string) || 
                     (body.actions?.[0]?.metadata?.tenantId as string) ||
                     undefined;

    let response: BraidResponseEnvelope;

    if (MCP_ROLE === "server") {
      // Server mode: Queue the job and wait for result
      logger.debug(`[MCP Server] Queueing job ${envelope.requestId} for tenant ${tenantId || "unknown"}`);
      const result = await queueJob(envelope, tenantId, {
        ip: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      response = result.response;
      
      // Add processing metadata to response
      res.setHeader("X-MCP-Node-Id", result.nodeId);
      res.setHeader("X-MCP-Duration-Ms", String(result.durationMs));
    } else if (MCP_ROLE === "node") {
      // Node mode: Nodes don't accept direct requests (they process from queue)
      return res.status(400).json({
        error: "INVALID_MODE",
        message: "Worker nodes do not accept direct requests. Send requests to the server.",
      });
    } else {
      // Standalone mode: Execute directly (backward compatible)
      response = await executeEnvelope(envelope);
    }

    res.json(response);
  } catch (err: unknown) {
    logger.error(`Error in /mcp/run: ${err}`);
    res.status(500).json({
      error: "MCP_EXECUTION_ERROR",
      message: getErrorMessage(err),
    });
  }
});

// Basic error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({ error: "UNHANDLED_ERROR", message: err?.message ?? String(err) });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.debug("[MCP] Received SIGTERM, shutting down gracefully...");
  await shutdownQueue();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.debug("[MCP] Received SIGINT, shutting down gracefully...");
  await shutdownQueue();
  process.exit(0);
});

const port = process.env.PORT || 8000;

// Startup env sanity check (non-fatal): informs developer if required vars are missing.
const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRM_BACKEND_URL", "JWT_SECRET"];
const missing = requiredEnv.filter(k => !process.env[k] || String(process.env[k]).trim() === "");
if (missing.length) {
  logger.warn(`[ENV WARNING] Missing env vars: ${missing.join(', ')}. Create braid-mcp-node-server/.env or sync from backend/.env (see docs/mcp/README.md).`);
}

// Initialize role-specific components then start server
initializeRole().then(() => {
  app.listen(port, () => {
    logger.debug(`Braid MCP ${MCP_ROLE} listening on port ${port} (ID: ${MCP_NODE_ID})`);
  });
}).catch((err) => {
  logger.error("[MCP] Failed to initialize:", err);
  process.exit(1);
});
