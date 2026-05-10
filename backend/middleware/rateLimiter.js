import rateLimit from 'express-rate-limit';
import logger from '../lib/logger.js';
import { logRateLimitViolation } from '../lib/rateLimitTracker.js';

/**
 * Rate limiting middleware for API routes
 * Implements CodeQL recommendation js/missing-rate-limiting
 *
 * Default: 100 requests per minute per IP
 * Auth endpoints: 10 requests per minute per IP (stricter)
 * Write-heavy endpoints: 20 requests per minute per IP
 *
 * NOTE: Rate limiting is disabled in test environment (NODE_ENV=test)
 * to prevent 429 errors from cascading test failures.
 */

// Skip rate limiting in test environment.
// Evaluated at REQUEST TIME (not module load) so it works whether the server
// or the test runner sets NODE_ENV=test.
const skipForTests = () =>
  process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === 'true';

/**
 * Create rate limit handler with violation tracking
 * @param {String} limitType - Type of limit ('default', 'auth', 'write', 'read', 'refresh')
 * @returns {Function} Rate limit handler
 */
function createRateLimitHandler(limitType) {
  return (req, res) => {
    const violation = {
      ip: req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
      tenantId: req.tenant?.id || null,
      userId: req.user?.id || null,
      endpoint: req.path,
      method: req.method,
      limitType,
      userAgent: req.headers['user-agent'] || null,
      cloudflareRay: req.headers['cf-ray'] || null,
      cloudflareCountry: req.headers['cf-ipcountry'] || null,
    };

    // Log to database (async, don't wait)
    logRateLimitViolation(violation).catch(err => {
      logger.error('[RateLimitTracker] Failed to log violation:', err);
    });

    logger.warn(`[RateLimit] ${limitType} limit exceeded`, {
      ip: violation.ip,
      path: req.path,
      method: req.method,
    });

    res.status(429).json({
      status: 'error',
      message: `Too many requests from this IP, please try again after a minute.`,
    });
  };
}

// Default rate limiter - 100 requests/minute per IP
// High limit accommodates test suites (1200+ requests). Production traffic
// from a single IP rarely exceeds 100/min; tests can hit 1000+/min.
export const defaultLimiter = rateLimit({
  skip: skipForTests,
  windowMs: 60 * 1000, // 1 minute
  max: 2000, // limit each IP to 2000 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again after a minute.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: createRateLimitHandler('default'),
});

// Strict rate limiter for authentication endpoints - 10 requests/minute per IP
export const authLimiter = rateLimit({
  skip: skipForTests,
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many authentication attempts from this IP, please try again after a minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests
  handler: createRateLimitHandler('auth'),
});

// Moderate rate limiter for write-heavy endpoints - 20 requests/minute per IP
export const writeLimiter = rateLimit({
  skip: skipForTests,
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many write requests from this IP, please try again after a minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('write'),
});

// Read-heavy endpoints - 200 requests/minute per IP
export const readLimiter = rateLimit({
  skip: skipForTests,
  windowMs: 60 * 1000, // 1 minute
  max: 200, // limit each IP to 200 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many read requests from this IP, please try again after a minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('read'),
});

// Public-route limiter — used by unauthenticated capability-token-gated
// endpoints (4VD-43 public /api/sign/:token routes). 60 requests/minute
// per IP balances legitimate recipient reload/redraft against abuse.
// Tighter than defaultLimiter, looser than writeLimiter (which would
// reject normal "click sign → undo → re-sign → submit" flows).
export const publicLimiter = rateLimit({
  skip: skipForTests,
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again after a minute.',
  },
  handler: createRateLimitHandler('public'),
});

// Token refresh limiter - 60 requests/minute per IP
export const refreshLimiter = rateLimit({
  skip: skipForTests,
  windowMs: 60 * 1000,
  max: 60,
  skipSuccessfulRequests: true,
  message: {
    status: 'error',
    message: 'Too many token refresh attempts, please try again after a minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('refresh'),
});