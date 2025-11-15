import express, { Request, Response, NextFunction } from "express";
import { InMemoryBraidRegistry } from "./braid/registry";
import { BraidExecutor } from "./braid/executor";
import { createConsoleLogger } from "./braid";
import { MockAdapter } from "./braid/adapters/mock";
import { CrmAdapter } from "./braid/adapters/crm";
import { WebAdapter } from "./braid/adapters/web";
import { GitHubAdapter } from "./braid/adapters/github";
import { LlmAdapter } from "./braid/adapters/llm";
import { BraidRequestEnvelope } from "./braid/types";

const app = express();

// CORS middleware - allow frontend to access MCP server
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
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

const executor = new BraidExecutor(registry, {
  logger: createConsoleLogger(),
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "braid-mcp-server" });
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
app.listen(port, () => {
  console.log(`Braid MCP Node server listening on port ${port}`);
});
