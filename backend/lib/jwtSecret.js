/**
 * Centralized JWT secret resolution with fail-fast in production.
 *
 * Background: previously each call site used `process.env.JWT_SECRET || 'change-me-access'`,
 * which silently signed/verified tokens with a public literal string if the env var was
 * ever unset (Doppler outage, env load failure, container misconfig). That meant a
 * silent compromise — anyone reading the source could forge tokens for any user.
 *
 * Behavior:
 *   - production: throws if the resolved secret is missing, empty, or matches the
 *     legacy insecure fallback strings. Process should crash early during boot rather
 *     than accept forged tokens silently.
 *   - non-production (dev/test): returns the resolved secret or a deterministic
 *     fallback so local dev and the test suite keep working.
 *
 * Usage:
 *   import { getAccessSecret, getRefreshSecret } from '../lib/jwtSecret.js';
 *   jwt.sign(payload, getAccessSecret(), { ... });
 *   jwt.verify(token, getAccessSecret(), { ... });
 */

const INSECURE_FALLBACKS = new Set([
  'change-me-access',
  'change-me-refresh',
  'your-secret-key-change-in-production',
]);

const DEV_FALLBACK_ACCESS = 'change-me-access';
const DEV_FALLBACK_REFRESH = 'change-me-refresh';

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function assertSecure(value, label) {
  if (!isProd()) return;
  if (!value || INSECURE_FALLBACKS.has(value)) {
    // Hard fail — do NOT accept the legacy insecure fallback in production.
    throw new Error(
      `[jwtSecret] Refusing to start: ${label} is missing or set to an insecure default in production. ` +
        `Set JWT_SECRET (and optionally JWT_ACCESS_SECRET / JWT_REFRESH_SECRET) in your secret manager.`,
    );
  }
}

/**
 * Returns the secret used to sign and verify short-lived access tokens
 * (aisha_access cookie). Resolution order:
 *   1. JWT_ACCESS_SECRET
 *   2. JWT_SECRET
 *   3. dev fallback (non-production only)
 */
export function getAccessSecret() {
  const secret =
    process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_SECRET ||
    (isProd() ? null : DEV_FALLBACK_ACCESS);
  assertSecure(secret, 'JWT access secret');
  return secret;
}

/**
 * Returns the secret used to sign and verify refresh tokens
 * (aisha_refresh cookie). Resolution order:
 *   1. JWT_REFRESH_SECRET
 *   2. JWT_SECRET
 *   3. dev fallback (non-production only)
 */
export function getRefreshSecret() {
  const secret =
    process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_SECRET ||
    (isProd() ? null : DEV_FALLBACK_REFRESH);
  assertSecure(secret, 'JWT refresh secret');
  return secret;
}
