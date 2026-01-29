import {
  BraidAction,
  BraidActionResult,
  BraidRequestEnvelope as _BraidRequestEnvelope,
  BraidResponseEnvelope as _BraidResponseEnvelope,
  BraidActor as _BraidActor,
} from "./types";
import logger from '../lib/logger';

export { 
  BraidAction,
  BraidActionResult,
  _BraidRequestEnvelope as BraidRequestEnvelope,
  _BraidResponseEnvelope as BraidResponseEnvelope,
  _BraidActor as BraidActor,
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

// Minimal logger for Braid adapters using Pino
export function createConsoleLogger(): BraidAdapterContext["log"] {
  return {
    debug: (msg, meta) => logger.debug(meta ?? {}, msg),
    info: (msg, meta) => logger.info(meta ?? {}, msg),
    warn: (msg, meta) => logger.warn(meta ?? {}, msg),
    error: (msg, meta) => logger.error(meta ?? {}, msg),
  };
}
