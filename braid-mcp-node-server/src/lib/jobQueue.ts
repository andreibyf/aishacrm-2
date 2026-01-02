/**
 * MCP Job Queue - Master-Worker job distribution using BullMQ
 * 
 * Server (master) mode: Queues incoming requests for worker processing
 * Node (worker) mode: Processes jobs from the queue
 */
import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from "bullmq";
import { BraidRequestEnvelope, BraidResponseEnvelope } from "../braid/types";
import { getErrorMessage } from "./errorUtils";

const QUEUE_NAME = "mcp-jobs";
const JOB_TIMEOUT = 30000; // 30 seconds

// Redis connection from environment
function getRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
  };
}

// Job data structure
export interface McpJobData {
  envelope: BraidRequestEnvelope;
  tenantId?: string;
  queuedAt: string;
  httpMetadata?: {
    ip?: string;
    userAgent?: string;
  };
}

export interface McpJobResult {
  response: BraidResponseEnvelope;
  processedAt: string;
  nodeId: string;
  durationMs: number;
}

// Singleton instances
let queue: Queue<McpJobData, McpJobResult> | null = null;
let worker: Worker<McpJobData, McpJobResult> | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Initialize the job queue (for server mode)
 */
export async function initQueue(): Promise<Queue<McpJobData, McpJobResult>> {
  if (queue) return queue;

  const connection = getRedisConnection();
  queue = new Queue<McpJobData, McpJobResult>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000 }, // Keep last 1000 completed jobs
      removeOnFail: { count: 500 }, // Keep last 500 failed jobs
    },
  });

  // Initialize queue events for waiting on job completion
  queueEvents = new QueueEvents(QUEUE_NAME, { connection });
  await queueEvents.waitUntilReady();

  console.log("[MCP Queue] Queue initialized (server mode)");
  return queue;
}

/**
 * Queue a job for processing (server mode)
 */
export async function queueJob(
  envelope: BraidRequestEnvelope,
  tenantId?: string,
  httpMetadata?: { ip?: string; userAgent?: string }
): Promise<McpJobResult> {
  if (!queue || !queueEvents) {
    throw new Error("Queue not initialized. Call initQueue() first.");
  }

  const jobData: McpJobData = {
    envelope,
    tenantId,
    queuedAt: new Date().toISOString(),
    httpMetadata,
  };

  // Add job with tenant-based priority (lower number = higher priority)
  // Future: Could look up tenant priority in database
  const priority = 5; // Default priority (1=highest, 10=lowest)

  const job = await queue.add(`mcp-${envelope.requestId}`, jobData, {
    priority,
    jobId: envelope.requestId, // Use requestId as jobId for deduplication
  });

  console.log(`[MCP Queue] Job ${job.id} queued for tenant ${tenantId || "unknown"}`);

  // Wait for job completion
  const result = await job.waitUntilFinished(queueEvents, JOB_TIMEOUT);
  
  if (!result) {
    throw new Error(`Job ${job.id} timed out after ${JOB_TIMEOUT}ms`);
  }

  return result;
}

/**
 * Initialize the worker (for node mode)
 */
export async function initWorker(
  processor: (envelope: BraidRequestEnvelope) => Promise<BraidResponseEnvelope>
): Promise<Worker<McpJobData, McpJobResult>> {
  if (worker) return worker;

  const connection = getRedisConnection();
  const nodeId = process.env.MCP_NODE_ID || `worker-${process.pid}`;

  worker = new Worker<McpJobData, McpJobResult>(
    QUEUE_NAME,
    async (job: Job<McpJobData, McpJobResult>) => {
      const startTime = Date.now();
      console.log(`[MCP Worker ${nodeId}] Processing job ${job.id} for tenant ${job.data.tenantId || "unknown"}`);

      try {
        const response = await processor(job.data.envelope);
        const durationMs = Date.now() - startTime;

        console.log(`[MCP Worker ${nodeId}] Job ${job.id} completed in ${durationMs}ms`);

        return {
          response,
          processedAt: new Date().toISOString(),
          nodeId,
          durationMs,
        };
      } catch (error: unknown) {
        console.error(`[MCP Worker ${nodeId}] Job ${job.id} failed:`, getErrorMessage(error));
        throw error;
      }
    },
    {
      connection,
      concurrency: 3, // Process up to 3 jobs concurrently per worker
      limiter: {
        max: 10, // Max 10 jobs per 1 second (rate limiting)
        duration: 1000,
      },
    }
  );

  worker.on("completed", (job) => {
    console.log(`[MCP Worker ${nodeId}] Job ${job.id} marked complete`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[MCP Worker ${nodeId}] Job ${job?.id} failed:`, error.message);
  });

  worker.on("error", (error) => {
    console.error(`[MCP Worker ${nodeId}] Worker error:`, error);
  });

  console.log(`[MCP Worker ${nodeId}] Worker initialized (node mode, concurrency=3)`);
  return worker;
}

/**
 * Get queue statistics (for monitoring)
 */
export async function getQueueStats() {
  if (!queue) {
    return { error: "Queue not initialized" };
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Graceful shutdown
 */
export async function shutdownQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  console.log("[MCP Queue] Shutdown complete");
}
