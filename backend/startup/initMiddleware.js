import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { attachRequestContext } from '../lib/requestContext.js';
import { performanceLogger } from '../middleware/performanceLogger.js';
import { productionSafetyGuard } from '../middleware/productionSafetyGuard.js';
import { intrusionDetection } from '../middleware/intrusionDetection.js';
import { authenticateRequest } from '../middleware/authenticate.js';
import { pool as perfLogPool } from '../lib/supabase-db.js';
import { setCorsHeaders } from '../lib/cors.js';
import logger from '../lib/logger.js';

export function initMiddleware(app, pgPool) {
  // Middleware
  // Apply Helmet with secure defaults globally
  app.use(helmet()); // Security headers (no insecure overrides globally)
  app.use(compression()); // Compress responses
  app.use(morgan('combined')); // Logging
  app.use(cookieParser()); // Cookie parsing for auth cookies
  // Attach request-scoped context for accumulating DB timing
  app.use(attachRequestContext);

  // Simple, in-memory rate limiter (dependency-free)
  // Configure via ENV:
  //   RATE_LIMIT_WINDOW_MS (default 60000)
  //   RATE_LIMIT_MAX (default 120)
  // Test overrides:
  //   E2E_TEST_MODE=true or NODE_ENV=test will switch to RATE_LIMIT_TEST_MAX (default 120)
  //   RATE_LIMIT_FORCE_DEFAULT=1 forces ignoring a very large RATE_LIMIT_MAX (e.g. 100000) during tests
  const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const RAW_RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);
  const IS_TEST_MODE = process.env.E2E_TEST_MODE === 'true' || process.env.NODE_ENV === 'test';
  const FORCE_DEFAULT = process.env.RATE_LIMIT_FORCE_DEFAULT === '1';
  const RATE_LIMIT_MAX =
    IS_TEST_MODE || FORCE_DEFAULT
      ? parseInt(process.env.RATE_LIMIT_TEST_MAX || '120', 10)
      : RAW_RATE_LIMIT_MAX;
  if (IS_TEST_MODE) {
    logger.debug(
      { effectiveMax: RATE_LIMIT_MAX, rawMax: RAW_RATE_LIMIT_MAX },
      '[RateLimiter] Test mode active',
    );
  }
  if (FORCE_DEFAULT) {
    logger.debug(
      { effectiveMax: RATE_LIMIT_MAX, rawMax: RAW_RATE_LIMIT_MAX },
      '[RateLimiter] FORCE_DEFAULT enabled',
    );
  }
  const rateBucket = new Map(); // key -> { count, ts }
  const rateSkip = new Set(['/health', '/api/status', '/api-docs', '/api-docs.json']);

  function rateLimiter(req, res, next) {
    try {
      if (rateSkip.has(req.path)) return next();
      // Allow OPTIONS preflight freely
      if (req.method === 'OPTIONS') return next();
      const now = Date.now();
      const key = `${req.ip}`; // after trust proxy, this reflects client IP
      const entry = rateBucket.get(key);
      if (!entry || now - entry.ts >= RATE_LIMIT_WINDOW_MS) {
        rateBucket.set(key, { count: 1, ts: now });
        return next();
      }
      if (entry.count < RATE_LIMIT_MAX) {
        entry.count++;
        return next();
      }
      // Prepare CORS headers early if not already set (ensures browser can read 429)
      if (!res.getHeader('Access-Control-Allow-Origin')) {
        setCorsHeaders(req.headers.origin, res, true);
      }
      res.setHeader('Retry-After', Math.ceil((entry.ts + RATE_LIMIT_WINDOW_MS - now) / 1000));
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again soon.`,
      });
    } catch {
      // Fail open on limiter errors
      return next();
    }
  }

  // CORS configuration
  // Only use ALLOWED_ORIGINS from environment - no hardcoded defaults for production safety
  const envAllowed = (process.env.ALLOWED_ORIGINS?.split(',') || [])
    .map((s) => s.trim())
    .filter(Boolean);

  // In development, add localhost origins if not already specified
  const devDefaults =
    process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:5173',
          'https://localhost:5173',
          'http://localhost:4000',
          'https://localhost:4000',
        ]
      : [];

  // Always allow the primary app domain in production if not explicitly set
  const prodDefaults = ['https://app.aishacrm.com', 'https://api.aishacrm.com'];

  const allowedOrigins = [...new Set([...envAllowed, ...devDefaults, ...prodDefaults])];

  // Fail loudly if no origins configured in production
  if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    logger.error(
      'CRITICAL: ALLOWED_ORIGINS not set in production environment. Set ALLOWED_ORIGINS in .env with your frontend URL(s)',
    );
    process.exit(1);
  }

  logger.info({ origins: allowedOrigins.join(', ') }, '[CORS] Allowed origins configured');

  // CSRF Protection Middleware
  // For JWT-based APIs, CSRF is mitigated by requiring custom headers on state-changing operations
  // This implements defense-in-depth for any cookie-based auth
  function csrfProtection(req, res, next) {
    try {
      // Skip CSRF for safe methods (CSRF only affects state-changing operations)
      const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
      if (safeMethods.includes(req.method)) {
        return next();
      }

      // Skip CSRF for requests with Bearer token (JWT auth inherently CSRF-safe)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        return next();
      }

      // For cookie-based auth or no auth, require custom headers as CSRF protection
      // These headers cannot be set by simple forms, only by JavaScript with CORS
      const hasCustomHeader =
        req.headers['x-requested-with'] ||
        (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) ||
        req.headers['x-csrf-token'];

      if (hasCustomHeader) {
        return next();
      }

      // Additional check: verify request came from allowed origin
      const origin = req.headers.origin || req.headers.referer;
      if (origin) {
        try {
          const originUrl = new URL(origin);
          const hostname = originUrl.hostname;

          // Allow requests from our own domains
          if (
            hostname === 'aishacrm.com' ||
            hostname.endsWith('.aishacrm.com') ||
            hostname === 'localhost' ||
            allowedOrigins.includes(origin)
          ) {
            return next();
          }
        } catch {
          // Invalid origin URL, reject
        }
      }

      // CSRF protection triggered - reject request
      logger.warn(
        {
          method: req.method,
          path: req.path,
          hasAuth: !!authHeader,
          origin: req.headers.origin,
          referer: req.headers.referer,
        },
        '[CSRF] Request blocked - missing CSRF protection headers',
      );

      return res.status(403).json({
        error: 'Forbidden',
        message: 'CSRF protection: Missing required headers for state-changing operation',
      });
    } catch (err) {
      logger.error({ err }, '[CSRF] Error in CSRF protection middleware');
      // Fail closed on error - reject the request
      return res.status(403).json({
        error: 'Forbidden',
        message: 'CSRF protection error',
      });
    }
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        try {
          // Allow server-to-server or same-origin calls
          if (!origin) return callback(null, true);

          // Explicit allowlist or wildcard
          if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
          }

          // Check for aishacrm.com and its subdomains based on hostname only
          try {
            const parsed = new URL(origin);
            const hostname = parsed.hostname;

            if (hostname === 'aishacrm.com' || hostname.endsWith('.aishacrm.com')) {
              return callback(null, true);
            }
          } catch {
            // If origin is not a valid URL, fall through to rejection
          }

          logger.warn({ origin }, '[CORS] Origin rejected');
          return callback(null, false); // Return false instead of Error to avoid triggering error handler
        } catch (e) {
          logger.error({ err: e }, '[CORS] Error in origin callback');
          return callback(null, false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Tenant-ID',
        'X-Internal-AI-Key',
        'X-User-Role',
        'X-User-Email',
        'X-User-First-Name',
        'X-User-Last-Name',
        'X-Auth-Retry',
        'Cache-Control',
        'Pragma',
      ],
      exposedHeaders: ['Content-Range', 'X-Content-Range'],
      maxAge: 86400, // 24 hours - cache preflight for performance
    }),
  );

  // Explicit OPTIONS handler for all API routes (preflight requests)
  // This ensures preflight requests are handled before any other middleware
  app.options('/api/*', (req, res) => {
    res.status(204).end();
  });

  // Apply limiter to API routes AFTER CORS so 429 responses include CORS headers
  app.use('/api', rateLimiter);

  // Apply CSRF protection to API routes (after CORS and rate limiting)
  app.use('/api', csrfProtection);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Performance logging middleware (must be after body parsers, before routes)
  // Build a resilient perf DB wrapper that falls back to Supabase API pool if the direct pool was ended
  const resilientPerfDb = {
    query: async (...args) => {
      const directAlive = perfLogPool && !perfLogPool.ended;
      const db = directAlive ? perfLogPool : pgPool;
      try {
        return await db.query(...args);
      } catch (e) {
        // Fallback broadly to Supabase API pool when direct connection fails for any reason
        if (directAlive && pgPool && db === perfLogPool) {
          try {
            return await pgPool.query(...args);
          } catch (e2) {
            // Log fallback error and re-throw original
            logger.error({ err: e2 }, '[ResilientPerfDb] Fallback query failed');
            throw e;
          }
        }
        throw e;
      }
    },
  };

  if (perfLogPool || pgPool) {
    app.use(performanceLogger(resilientPerfDb));
    logger.info(
      { source: perfLogPool ? 'PostgreSQL direct' : 'Supabase API' },
      'Performance logging middleware enabled',
    );
  } else {
    logger.warn('Performance logging disabled - no database connection available');
  }

  // Block mutating requests in production Supabase unless explicitly allowed
  // Exempt non-DB-mutating CI endpoints (GitHub Actions dispatch) from the guard
  app.use(
    productionSafetyGuard({
      exemptPaths: [
        '/api/testing/run-playwright', // POST triggers GitHub workflow, no DB writes
        '/api/system-logs', // System telemetry and monitoring
        '/api/users/heartbeat', // User session keepalive
        '/api/users/sync-from-auth', // Supabase auth sync (critical for login)
        '/api/users/reset-password', // Password reset email (Supabase Auth, no direct DB writes)
        '/api/cron/run', // Scheduled job execution
        '/api/notifications', // User notification delivery
        '/api/ai/tts', // Voice output proxy (no DB writes)
        '/api/ai/speech-to-text', // Voice input transcription (no DB writes)
        '/api/auth/login', // Authentication login (critical for access)
        '/api/auth/refresh', // JWT token refresh (critical for sessions)
        '/api/auth/logout', // Authentication logout
        '/api/pep/compile', // PEP LLM compile — read-only NL→IR, no DB writes
        '/api/pep/query', // PEP query execution — read-only SELECT via Supabase
        '/api/pep/saved-reports', // PEP saved reports — tenant-scoped reads/writes
      ],
      pgPool, // Pass database connection for security event logging
    }),
  );
  logger.info('Production safety guard enabled');

  // Attach Supabase client to request for IDR middleware
  app.use((req, _res, next) => {
    req.supabase = pgPool;
    next();
  });

  // Enable Intrusion Detection and Response (IDR) system
  if (process.env.IDR_ENABLED !== 'false') {
    app.use(intrusionDetection);
    logger.info('Intrusion Detection & Response (IDR) middleware enabled');
  } else {
    logger.warn('IDR middleware disabled via IDR_ENABLED=false');
  }

  // Attach authentication context (cookie or Supabase bearer) for downstream route auth checks
  app.use('/api', authenticateRequest);

  // ----------------------------------------------------------------------------
  // Canary logging middleware for BizDevSource promote diagnostics
  // Logs every POST to /api/bizdevsources/* BEFORE route handlers.
  // Helps distinguish client/network stall vs server handling issues.
  // ----------------------------------------------------------------------------
  app.use((req, _res, next) => {
    try {
      if (req.method === 'POST' && req.path.startsWith('/api/bizdevsources/')) {
        logger.debug(
          {
            path: req.path,
            method: req.method,
            origin: req.headers.origin,
            contentType: req.headers['content-type'],
            hasBody: !!req.headers['content-length'],
            productionGuardEnabled: true,
          },
          '[CANARY Promote POST] Incoming request',
        );
      }
    } catch (e) {
      logger.warn({ err: e }, '[CANARY Promote POST] Logging error');
    }
    return next();
  });

  return { resilientPerfDb };
}
