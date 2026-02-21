/**
 * URL Validator - Prevents Server-Side Request Forgery (SSRF) attacks
 * Validates URLs before making HTTP requests
 */

import logger from './logger.js';

// Allowed URL schemes
const ALLOWED_SCHEMES = ['http:', 'https:'];

// Private/internal IP ranges to block (SSRF protection)
const PRIVATE_IP_RANGES = [
  /^127\./, // 127.0.0.0/8 (loopback)
  /^10\./, // 10.0.0.0/8 (private)
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12 (private)
  /^192\.168\./, // 192.168.0.0/16 (private)
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^::1$/, // IPv6 loopback
  /^fe80:/i, // IPv6 link-local
  /^fc00:/i, // IPv6 private
];

/**
 * Check if an IP address is private/internal
 * @param {string} hostname - The hostname to check
 * @returns {boolean} - True if IP is private
 */
function isPrivateIP(hostname) {
  // Check if hostname looks like an IP address
  const ipv4Pattern =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const ipv6Pattern = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;

  if (!ipv4Pattern.test(hostname) && !ipv6Pattern.test(hostname)) {
    return false; // Not an IP address
  }

  // Check against private IP ranges
  return PRIVATE_IP_RANGES.some((pattern) => pattern.test(hostname));
}

/**
 * Validate URL to prevent SSRF attacks
 * @param {string} urlString - The URL to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowPrivateIPs - Allow private IPs (default: false)
 * @param {boolean} options.allowLocalhostInDev - Allow localhost in dev mode (default: true)
 * @returns {Object} - { valid: boolean, url?: URL, error?: string }
 */
export function validateUrl(urlString, options = {}) {
  const { allowPrivateIPs = false, allowLocalhostInDev = true } = options;

  try {
    // Parse URL
    const url = new URL(urlString);

    // Check scheme
    if (!ALLOWED_SCHEMES.includes(url.protocol)) {
      return {
        valid: false,
        error: `Invalid URL scheme: ${url.protocol}. Only http: and https: are allowed.`,
      };
    }

    // Extract hostname
    const hostname = url.hostname.toLowerCase();

    // Check for localhost/internal IPs
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      /^127\./.test(hostname) || // Entire 127.0.0.0/8 loopback range
      hostname === '::1' ||
      hostname.startsWith('::ffff:127.') ||
      hostname.startsWith('[::ffff:127.');
    const isPrivate = isPrivateIP(hostname);

    // Block localhost in production
    if (isLocalhost) {
      if (
        allowLocalhostInDev &&
        (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
      ) {
        logger.warn('[URL Validator] Allowing localhost in development mode:', hostname);
        return { valid: true, url };
      }
      return {
        valid: false,
        error: 'Localhost URLs are not allowed in production (SSRF protection)',
      };
    }

    // Block private IPs unless explicitly allowed
    if (isPrivate && !allowPrivateIPs) {
      return {
        valid: false,
        error: `Private IP addresses are not allowed (SSRF protection): ${hostname}`,
      };
    }

    // Additional security checks
    if (url.username || url.password) {
      return {
        valid: false,
        error: 'URLs with embedded credentials are not allowed',
      };
    }

    return { valid: true, url };
  } catch (error) {
    return {
      valid: false,
      error: `Invalid URL: ${error.message}`,
    };
  }
}

/**
 * Validate that a URL is within allowed domains
 * @param {string} urlString - The URL to validate
 * @param {string[]} allowedDomains - List of allowed domains (wildcards supported with *)
 * @returns {Object} - { valid: boolean, url?: URL, error?: string }
 */
export function validateUrlAgainstWhitelist(urlString, allowedDomains = []) {
  const validation = validateUrl(urlString);
  if (!validation.valid) {
    return validation;
  }

  const url = validation.url;
  const hostname = url.hostname.toLowerCase();

  // Check against whitelist
  const isAllowed = allowedDomains.some((domain) => {
    const pattern = domain.toLowerCase().replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(hostname);
  });

  if (!isAllowed) {
    return {
      valid: false,
      error: `Domain ${hostname} is not in the allowed whitelist`,
    };
  }

  return { valid: true, url };
}

/**
 * Validate URL for internal API calls (same host only)
 * @param {string} urlString - The URL to validate
 * @param {string} expectedHost - The expected host (e.g., req.get('host'))
 * @returns {Object} - { valid: boolean, url?: URL, error?: string }
 */
export function validateInternalUrl(urlString, expectedHost) {
  const validation = validateUrl(urlString, { allowLocalhostInDev: true });
  if (!validation.valid) {
    return validation;
  }

  const url = validation.url;
  const urlHost = url.host.toLowerCase(); // includes port
  const expected = expectedHost.toLowerCase();

  if (urlHost !== expected) {
    return {
      valid: false,
      error: `URL host ${urlHost} does not match expected host ${expected} (SSRF protection)`,
    };
  }

  return { valid: true, url };
}
