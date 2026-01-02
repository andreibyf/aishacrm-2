/**
 * REDACTION MODULE FOR AI MEMORY
 * Sanitizes sensitive data before embedding and storage
 * Keeps CRM facts while masking secrets (API keys, passwords, tokens, etc.)
 */

// Patterns for detecting sensitive data
const SENSITIVE_PATTERNS = [
  // API keys and tokens
  { pattern: /\b[A-Za-z0-9_-]{32,}\b/g, replace: '[REDACTED_TOKEN]' },
  { pattern: /sk-[A-Za-z0-9]{32,}/g, replace: '[REDACTED_API_KEY]' },
  { pattern: /Bearer\s+[A-Za-z0-9_-]+/gi, replace: 'Bearer [REDACTED_TOKEN]' },
  
  // Passwords and credentials
  { pattern: /password[:\s=]+["']?[^\s"']+/gi, replace: 'password=[REDACTED_PASSWORD]' },
  { pattern: /pwd[:\s=]+["']?[^\s"']+/gi, replace: 'pwd=[REDACTED_PASSWORD]' },
  { pattern: /secret[:\s=]+["']?[^\s"']+/gi, replace: 'secret=[REDACTED_SECRET]' },
  { pattern: /auth[:\s=]+["']?[^\s"']+/gi, replace: 'auth=[REDACTED_AUTH]' },
  
  // Credit card numbers (basic detection)
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replace: '[REDACTED_CARD]' },
  
  // Social Security Numbers
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replace: '[REDACTED_SSN]' },
  
  // Database connection strings
  { pattern: /postgres:\/\/[^\s]+/gi, replace: 'postgres://[REDACTED_DB_URL]' },
  { pattern: /mysql:\/\/[^\s]+/gi, replace: 'mysql://[REDACTED_DB_URL]' },
  { pattern: /mongodb:\/\/[^\s]+/gi, replace: 'mongodb://[REDACTED_DB_URL]' },
  
  // JWT tokens (basic detection - starts with eyJ)
  { pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replace: '[REDACTED_JWT]' }
];

/**
 * Redacts sensitive information from text while preserving CRM facts
 * @param {string} text - Raw text to redact
 * @returns {string} - Redacted text safe for embedding and storage
 */
export function redactSensitive(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }
  
  let redacted = text;
  
  // Apply all sensitive patterns
  for (const { pattern, replace } of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, replace);
  }
  
  return redacted;
}

/**
 * Check if text contains potentially sensitive data
 * @param {string} text - Text to check
 * @returns {boolean} - True if sensitive data detected
 */
export function containsSensitiveData(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  return SENSITIVE_PATTERNS.some(({ pattern }) => {
    // Reset regex lastIndex to avoid state issues
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

/**
 * Sanitize text for safe storage in memory chunks
 * Combines redaction with basic text cleanup
 * @param {string} text - Raw text
 * @returns {string} - Sanitized text
 */
export function sanitizeForMemory(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  let sanitized = text;
  
  // 1. Redact sensitive data
  sanitized = redactSensitive(sanitized);
  
  // 2. Normalize whitespace (collapse multiple spaces/newlines)
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // 3. Remove very long tokens that might be noise (>100 consecutive alphanumeric chars)
  sanitized = sanitized.replace(/\b[A-Za-z0-9]{100,}\b/g, '[TRUNCATED_LONG_TOKEN]');
  
  return sanitized;
}
