export type BraidActorType = "user" | "agent" | "system";

export interface BraidActor {
  id: string;              // e.g. "user:123", "agent:sales-optimizer"
  type: BraidActorType;
  roles?: string[];        // e.g. ["sales_rep", "billing_admin"]
}

export type BraidVerb =
  | "read"           // get data
  | "search"         // query data with filters
  | "create"
  | "update"
  | "delete"
  | "run"            // run a procedure / job
  | "optimize";      // optimization-style requests

export interface BraidResourceRef {
  system: string;          // e.g. "crm", "erp", "billing", "custom:xyz"
  kind: string;            // e.g. "lead", "account", "invoice", "job"
}

// Simple filter expression for v0.
export interface BraidFilter {
  field: string;
  op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "in" | "contains";
  value: unknown;
}

export interface BraidSort {
  field: string;
  direction: "asc" | "desc";
}

// Optional knobs for execution.
export interface BraidExecutionOptions {
  timeoutMs?: number;
  dryRun?: boolean;          // if true, adapter MUST NOT mutate
  maxItems?: number;         // query cap
  strict?: boolean;          // if true, partial failures are treated as errors
  traceId?: string;          // propagate for logging
}

export interface BraidAction {
  id: string;                     // client-generated action id
  verb: BraidVerb;
  actor: BraidActor;
  resource: BraidResourceRef;

  // For read/update/delete on specific entities
  targetId?: string;

  // For search/read-many
  filters?: BraidFilter[];
  sort?: BraidSort[];

  // For create/update/run/optimize payloads
  payload?: Record<string, unknown>;

  options?: BraidExecutionOptions;
  metadata?: Record<string, unknown>;  // arbitrary agent/hints
}

// Result status from a single action.
export type BraidResultStatus = "success" | "partial" | "error";

export interface BraidActionResult {
  actionId: string;
  status: BraidResultStatus;
  resource: BraidResourceRef;

  // When verb = read/search/create/update
  data?: unknown; // can be object or array

  // Detailed info for partial/error cases
  errorCode?: string;
  errorMessage?: string;
  details?: Record<string, unknown>;
}

// Envelope for batching + logging.
export interface BraidRequestEnvelope {
  requestId: string;
  actor: BraidActor;
  actions: BraidAction[];
  createdAt: string;          // ISO timestamp
  client?: string;            // "aisha-hub-browser", "api-gateway"
  channel?: string;           // "ui", "api", "agent"
  metadata?: Record<string, unknown>;
}

export interface BraidResponseEnvelope {
  requestId: string;
  results: BraidActionResult[];
  startedAt: string;
  finishedAt: string;
  metadata?: Record<string, unknown>;
}
