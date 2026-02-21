/**
 * CORS Helper - Secure origin whitelisting for credentials transfer
 *
 * This module prevents CORS misconfiguration vulnerabilities by validating
 * request origins against a whitelist before setting CORS headers.
 *
 * CodeQL Alert: js/cors-misconfiguration-for-credentials
 * Fix: Never reflect arbitrary origins when using Access-Control-Allow-Credentials
 */

import logger from './logger.js';

/**
 * Get allowed origins from environment or use defaults
 * @returns {string[]} Array of allowed origin URLs
 */
function getAllowedOrigins() {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (envOrigins && envOrigins.length > 0) {
    return envOrigins;
  }

  // Default allowed origins for development and production
  const defaults = [
    'http://localhost:5173', // Vite dev server
    'http://localhost:4000', // Docker frontend
    'http://localhost:3000', // Alternative dev port
    'https://localhost:5173',
    'https://localhost:4000',
    'https://localhost:3000',
  ];

  // Add production domain if configured
  if (process.env.FRONTEND_URL) {
    defaults.push(process.env.FRONTEND_URL);
  }

  return defaults;
}

const ALLOWED_ORIGINS = getAllowedOrigins();

/**
 * Check if origin is allowed and set appropriate CORS headers
 * @param {string|undefined} origin - Request origin header
 * @param {object} res - Express response object
 * @param {boolean} allowCredentials - Whether to allow credentials (default: true)
 * @returns {boolean} True if origin is allowed, false otherwise
 */
export function setCorsHeaders(origin, res, allowCredentials = true) {
  if (!origin) {
    // No origin header (same-origin request or non-browser client)
    return false;
  }

  // Check if origin is in whitelist
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');

    if (allowCredentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    return true;
  }

  // Origin not allowed - log and don't set CORS headers
  logger.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
  return false;
}

/**
 * Express middleware to set CORS headers based on origin whitelist
 * @param {boolean} allowCredentials - Whether to allow credentials (default: true)
 * @returns {Function} Express middleware function
 */
export function corsMiddleware(allowCredentials = true) {
  return (req, res, next) => {
    setCorsHeaders(req.headers.origin, res, allowCredentials);
    next();
  };
}

/**
 * Get the list of allowed origins (for debugging/logging)
 * @returns {string[]} Array of allowed origin URLs
 */
export function getAllowedOriginsList() {
  return [...ALLOWED_ORIGINS];
}

logger.info(`[CORS] Configured ${ALLOWED_ORIGINS.length} allowed origins`);
