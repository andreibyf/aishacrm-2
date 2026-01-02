import {
  BraidAction,
  BraidActionResult,
  BraidRequestEnvelope,
  BraidResponseEnvelope,
  BraidActor,
} from "./types";

export { 
  BraidAction,
  BraidActionResult,
  BraidRequestEnvelope,
  BraidResponseEnvelope,
  BraidActor,
} from "./types";

export interface BraidAdapterContext {
  log: {
    debug: (msg: string, meta?: unknown) => void;
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export interface BraidAdapter {
  system: string; // e.g. "crm", "erp", "billing"

  handleAction(
    action: BraidAction,
    ctx: BraidAdapterContext
  ): Promise<BraidActionResult>;
}

export interface BraidRegistry {
  registerAdapter(adapter: BraidAdapter): void;
  getAdapter(system: string): BraidAdapter | undefined;
  /**
   * Return a list of registered adapter system names. The list
   * should be sorted alphabetically to provide stable ordering.
   */
  listAdapters(): string[];
}

// Minimal console-based logger for v0.
// Replace with your own logging system if desired.
export function createConsoleLogger(): BraidAdapterContext["log"] {
  return {
    debug: (msg, meta) => console.debug(msg, meta ?? {}),
    info: (msg, meta) => console.info(msg, meta ?? {}),
    warn: (msg, meta) => console.warn(msg, meta ?? {}),
    error: (msg, meta) => console.error(msg, meta ?? {}),
  };
}
