/**
 * URL Validator - Prevents Server-Side Request Forgery (SSRF) attacks
 * Validates URLs before making HTTP requests
 *
 * DNS Rebinding Protection:
 * The synchronous validateUrl() only checks the hostname as supplied in the URL.
 * A malicious DNS server can initially return a public IP (passing validation) then
 * switch to a private IP when the actual TCP connection is made — a "DNS rebinding" attack.
 *
 * Use resolveAndValidateUrl() or safeFetch() instead of validateUrl() + fetch() when
 * the target hostname is not fully trusted, to re-validate the resolved IP address
 * and significantly reduce the DNS rebinding attack window.
 *
 * Remaining limitation: a tiny race window exists between the DNS lookup in
 * resolveAndValidateUrl() and the TCP connect inside fetch(). In practice this window
 * is negligible when the DNS TTL of the resolved IP is short and the DNS infrastructure
 * is not under active adversarial control.
 */

import { promises as dnsPromises } from 'node:dns';
import logger from './logger.js';

// DNS resolution cache — short TTL keeps the attack window small while
// avoiding a fresh DNS round-trip for every repeated request to the same host.
const DNS_CACHE_TTL_MS = 30_000; // 30 seconds
const _dnsCache = new Map();

// DNS lookup implementation — can be overridden in tests via _setDnsLookupForTesting()
let _dnsLookupImpl = (hostname, opts) => dnsPromises.lookup(hostname, opts);

/**
 * Override the DNS lookup implementation (for unit tests only).
 * @param {Function} fn - Replacement for dnsPromises.lookup(hostname, opts)
 */
export function _setDnsLookupForTesting(fn) {
  _dnsLookupImpl = fn ?? ((hostname, opts) => dnsPromises.lookup(hostname, opts));
  // Clear cache so the new lookup is used immediately
  _dnsCache.clear();
}

/**
 * Resolve a hostname to an IP address, with a short-TTL in-memory cache.
 * @param {string} hostname
 * @returns {Promise<string>} Resolved IP address
 */
async function resolveHostname(hostname) {
  const cached = _dnsCache.get(hostname);
  if (cached && Date.now() - cached.timestamp < DNS_CACHE_TTL_MS) {
    return cached.address;
  }

  const { address } = await _dnsLookupImpl(hostname, { family: 0 });

  // Bound cache size to prevent unbounded memory growth
  if (_dnsCache.size >= 500) {
    _dnsCache.delete(_dnsCache.keys().next().value);
  }
  _dnsCache.set(hostname, { address, timestamp: Date.now() });
  return address;
}

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
  const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
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

// Reuse IP patterns for the DNS re-validation step
const _ipv4Re = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const _ipv6Re = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;

/**
 * Resolve a URL's hostname via DNS and re-validate the resulting IP address.
 *
 * This provides protection against DNS rebinding: even if validateUrl() accepted
 * the hostname, a DNS server could later return a private IP when the actual
 * connection is made.  By resolving first and checking here we close that window.
 *
 * @param {string} urlString - The URL to validate
 * @param {Object} options - Same options as validateUrl()
 * @returns {Promise<{valid: boolean, url?: URL, resolvedIP?: string, error?: string}>}
 */
export async function resolveAndValidateUrl(urlString, options = {}) {
  // Basic (synchronous) validation first
  const validation = validateUrl(urlString, options);
  if (!validation.valid) {
    return validation;
  }

  const { allowPrivateIPs = false, allowLocalhostInDev = true } = options;
  const url = validation.url;
  const hostname = url.hostname.toLowerCase();

  // If the hostname is already a literal IP address it was already checked above
  if (_ipv4Re.test(hostname) || _ipv6Re.test(hostname)) {
    return { ...validation, resolvedIP: hostname };
  }

  // Resolve the hostname to an IP and validate the result
  let resolvedIP;
  try {
    resolvedIP = await resolveHostname(hostname);
  } catch (err) {
    return {
      valid: false,
      error: `DNS resolution failed for ${hostname}: ${err.message}`,
    };
  }

  const resolvedLower = resolvedIP.toLowerCase();

  const resolvedIsLoopback =
    resolvedLower === '127.0.0.1' ||
    resolvedLower === '::1' ||
    resolvedLower === '0.0.0.0' ||
    /^127\./.test(resolvedLower) ||
    resolvedLower.startsWith('::ffff:127.');

  const resolvedIsPrivate = isPrivateIP(resolvedIP);

  if (resolvedIsLoopback) {
    if (
      allowLocalhostInDev &&
      (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
    ) {
      logger.warn(
        '[URL Validator] DNS resolved to loopback in dev mode:',
        hostname,
        '->',
        resolvedIP,
      );
      return { valid: true, url, resolvedIP };
    }
    logger.warn('[URL Validator] DNS rebinding blocked — loopback:', hostname, '->', resolvedIP);
    return {
      valid: false,
      error: `DNS rebinding detected: ${hostname} resolved to loopback address ${resolvedIP}`,
    };
  }

  if (resolvedIsPrivate && !allowPrivateIPs) {
    logger.warn('[URL Validator] DNS rebinding blocked — private IP:', hostname, '->', resolvedIP);
    return {
      valid: false,
      error: `DNS rebinding detected: ${hostname} resolved to private IP ${resolvedIP}`,
    };
  }

  return { valid: true, url, resolvedIP };
}

/**
 * Fetch a URL with DNS rebinding protection.
 *
 * Resolves the hostname and validates the IP is not private/loopback before
 * issuing the HTTP request.  Drop-in replacement for:
 *   const validation = validateUrl(url); fetch(validation.url.toString(), opts)
 *
 * @param {string} urlString - The URL to fetch
 * @param {Object} fetchOptions - Options forwarded to fetch()
 * @param {Object} validationOptions - Options forwarded to validateUrl()
 * @returns {Promise<Response>}
 * @throws {Error} When URL validation or DNS resolution fails
 */
export async function safeFetch(urlString, fetchOptions = {}, validationOptions = {}) {
  const validation = await resolveAndValidateUrl(urlString, validationOptions);
  if (!validation.valid) {
    throw new Error(`[safeFetch] URL validation failed: ${validation.error}`);
  }
  return fetch(urlString, fetchOptions);
}
