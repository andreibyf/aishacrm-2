import rateLimit from 'express-rate-limit';
import logger from '../lib/logger.js';

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
  handler: (req, res) => {
    logger.warn('[RateLimit] Default limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many requests from this IP, please try again after a minute.',
    });
  },
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
  handler: (req, res) => {
    logger.warn('[RateLimit] Auth limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many authentication attempts from this IP, please try again after a minute.',
    });
  },
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
  handler: (req, res) => {
    logger.warn('[RateLimit] Write limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many write requests from this IP, please try again after a minute.',
    });
  },
});

// Lenient rate limiter for read-heavy endpoints - 200 requests/minute per IP
export const readLimiter = rateLimit({
  skip: skipForTests,
  windowMs: 60 * 1000, // 1 minute
  max: 200, // limit each IP to 200 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again after a minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('[RateLimit] Read limit exceeded', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many requests from this IP, please try again after a minute.',
    });
  },
});
