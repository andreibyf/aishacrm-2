/**
 * Type declaration for backend/lib/logger.js (the project Pino logger).
 *
 * Pino's bundled types reject `logger.error('msg', { ctx })` unless the
 * first arg is a "merging object" — but our codebase uses
 * `logger.<level>(msg, structuredFields)` extensively. This sibling .d.ts
 * is preferred over the upstream Pino types via TS's per-file resolution
 * for .js files (logger.d.ts wins for `import logger from './logger.js'`).
 *
 * Net effect: structured second-args are accepted across all backend
 * routes/lib files without rewriting call sites.
 */
declare const logger: {
  fatal: (msg: string, ctx?: unknown) => void;
  error: (msg: string, ctx?: unknown) => void;
  warn: (msg: string, ctx?: unknown) => void;
  info: (msg: string, ctx?: unknown) => void;
  debug: (msg: string, ctx?: unknown) => void;
  trace: (msg: string, ctx?: unknown) => void;
  child: (bindings: Record<string, unknown>) => typeof logger;
  level: string;
};

export default logger;
