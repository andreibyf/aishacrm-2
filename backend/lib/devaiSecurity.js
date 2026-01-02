/**
 * Security Utilities for Developer AI
 * Redaction, path validation, and safety checks
 */

/**
 * Redact sensitive information from text
 * Redacts: JWTs, API keys, Bearer tokens, environment variables, passwords
 */
export function redactSecrets(text) {
  if (!text || typeof text !== 'string') return text;
  
  let redacted = text;
  
  // JWT tokens (3 base64 segments separated by dots)
  redacted = redacted.replace(
    /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    '[REDACTED_JWT]'
  );
  
  // Bearer tokens
  redacted = redacted.replace(
    /Bearer\s+[A-Za-z0-9._-]+/gi,
    'Bearer [REDACTED_TOKEN]'
  );
  
  // API keys (various patterns)
  redacted = redacted.replace(
    /['"](sk|pk|api|key)[-_]?[A-Za-z0-9]{20,}['"]/gi,
    '"[REDACTED_API_KEY]"'
  );
  
  // Authorization headers
  redacted = redacted.replace(
    /authorization['":\s]+['"]*[A-Za-z0-9._-]{20,}['"]/gi,
    'authorization: "[REDACTED_AUTH]"'
  );
  
  // Supabase keys
  redacted = redacted.replace(
    /eyJ[A-Za-z0-9_-]{100,}/g,
    '[REDACTED_SUPABASE_KEY]'
  );
  
  // Environment variable values (common patterns)
  const envPatterns = [
    /_KEY\s*=\s*['"]?([A-Za-z0-9._-]{10,})['"]?/gi,
    /_SECRET\s*=\s*['"]?([A-Za-z0-9._-]{10,})['"]?/gi,
    /_TOKEN\s*=\s*['"]?([A-Za-z0-9._-]{10,})['"]?/gi,
    /PASSWORD\s*=\s*['"]?([A-Za-z0-9._-]{4,})['"]?/gi,
    /ANTHROPIC_API_KEY\s*=\s*['"]?([A-Za-z0-9._-]{10,})['"]?/gi,
    /OPENAI_API_KEY\s*=\s*['"]?([A-Za-z0-9._-]{10,})['"]?/gi,
  ];
  
  envPatterns.forEach(pattern => {
    redacted = redacted.replace(pattern, (match, _value) => {
      const key = match.split('=')[0].trim();
      return `${key}=[REDACTED]`;
    });
  });
  
  return redacted;
}

/**
 * Redact secrets from an object (recursive)
 * Creates a deep copy with sensitive values redacted
 */
export function redactSecretsFromObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSecretsFromObject(item));
  }
  
  const redacted = {};
  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'apiKey', 'api_key',
    'bearer', 'authorization', 'auth', 'credential', 'private'
  ];
  
  for (const [key, value] of Object.entries(obj)) {
    // Check if key name suggests sensitive data
    const isSensitive = sensitiveKeys.some(sk => 
      key.toLowerCase().includes(sk.toLowerCase())
    );
    
    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      redacted[key] = redactSecrets(value);
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSecretsFromObject(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * Validate that a file path is safe for operations
 * Prevents path traversal attacks and access to sensitive files
 */
export function isPathSafe(filePath, allowedBasePaths = ['/app']) {
  if (!filePath || typeof filePath !== 'string') return false;
  
  // Normalize path
  const normalized = filePath.replace(/\\/g, '/');
  
  // Check for path traversal
  if (normalized.includes('../') || normalized.includes('..\\')) {
    return false;
  }
  
  // Check for absolute paths outside allowed bases
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    const isAllowed = allowedBasePaths.some(base => 
      normalized.startsWith(base)
    );
    if (!isAllowed) return false;
  }
  
  // Forbidden patterns
  const forbiddenPatterns = [
    /\.env($|\.)/i,  // .env or .env.local, .env.production, etc.
    /\.key$/i,
    /\.pem$/i,
    /id_rsa/i,
    /secrets?\//i,
    /credentials?\//i,
    /password/i,
    /doppler/i,
    /\.git\//,
  ];
  
  return !forbiddenPatterns.some(pattern => pattern.test(normalized));
}

/**
 * Validate that a file is safe for export
 * Additional restrictions for export bundles
 */
export function isFileExportable(filePath) {
  if (!isPathSafe(filePath)) return false;
  
  // Additional exclusions for exports
  const exportExclusions = [
    /node_modules\//,
    /\.git\//,
    /dist\//,
    /build\//,
    /coverage\//,
    /\.log$/,
    /\.tmp$/,
    /\.cache/,
  ];
  
  return !exportExclusions.some(pattern => pattern.test(filePath));
}

/**
 * Sanitize command for logging/storage
 * Redacts sensitive arguments
 */
export function sanitizeCommand(command) {
  if (!command || typeof command !== 'string') return command;
  
  let sanitized = command;
  
  // Redact after specific flags
  const sensitiveFlags = [
    '-p', '--password',
    '-k', '--key',
    '-t', '--token',
    '--api-key',
    '--secret',
  ];
  
  sensitiveFlags.forEach(flag => {
    const regex = new RegExp(`${flag}\\s+['"]?[^\\s'"]+['"]?`, 'gi');
    sanitized = sanitized.replace(regex, `${flag} [REDACTED]`);
  });
  
  return redactSecrets(sanitized);
}

/**
 * Check if a command contains sensitive operations
 */
export function containsSensitiveOperation(command) {
  if (!command || typeof command !== 'string') return false;
  
  const sensitivePatterns = [
    /\bcat\b.*\.env/i,
    /\bprintenv\b/i,
    /\benv\b/i,
    /\bexport\b.*=.*[A-Za-z0-9]{20,}/,
    /\becho\b.*\$[A-Z_]+.*KEY/i,
    /\.pem/i,
    /id_rsa/i,
    /secrets?\//i,
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(command));
}
