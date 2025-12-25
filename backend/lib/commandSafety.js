/**
 * Command Safety Classification for Developer AI
 * Classifies commands as safe (auto-execute), risky (approval required), or blocked
 */

import { containsSensitiveOperation } from './devaiSecurity.js';

/**
 * Command classification result
 * @typedef {Object} CommandClassification
 * @property {'allowed'|'requires_approval'|'blocked'} level
 * @property {string} reason - Why this classification was chosen
 * @property {boolean} autoExecute - Can this command run immediately?
 */

/**
 * Allowlist - Safe read-only commands that can auto-execute
 * These are diagnostic commands with no side effects
 */
const SAFE_COMMANDS = [
  // Docker diagnostics
  { pattern: /^docker\s+ps(\s|$)/, description: 'List running containers' },
  { pattern: /^docker\s+logs\s+(--tail\s+\d+\s+)?[\w-]+(\s|$)/, description: 'View container logs' },
  { pattern: /^docker\s+compose\s+ps(\s|$)/, description: 'List compose services' },
  { pattern: /^docker\s+inspect\s+[\w-]+(\s|$)/, description: 'Inspect container' },
  { pattern: /^docker\s+stats(\s+--no-stream)?(\s|$)/, description: 'Container stats' },
  
  // System diagnostics
  { pattern: /^systemctl\s+status\s+[\w.-]+(\s|$)/, description: 'Service status' },
  { pattern: /^journalctl\s+-u\s+[\w.-]+\s+--since\s+/, description: 'Service logs' },
  { pattern: /^ps\s+aux(\s|$)/, description: 'Process list' },
  { pattern: /^df\s+-h(\s|$)/, description: 'Disk usage' },
  { pattern: /^free\s+-h(\s|$)/, description: 'Memory usage' },
  { pattern: /^uptime(\s|$)/, description: 'System uptime' },
  
  // Network diagnostics (safe endpoints only)
  { pattern: /^curl\s+-I\s+http:\/\/localhost:\d+\/health(\s|$)/, description: 'Health check' },
  { pattern: /^curl\s+-s\s+http:\/\/localhost:\d+\/health(\s|$)/, description: 'Health check' },
  { pattern: /^netstat\s+-tlnp(\s|$)/, description: 'Listening ports' },
  { pattern: /^ss\s+-tlnp(\s|$)/, description: 'Socket stats' },
  
  // File operations (read-only, safe paths)
  { pattern: /^ls\s+/, description: 'List files' },
  { pattern: /^cat\s+[^.][^/]*\.(js|json|md|txt|log)(\s|$)/, description: 'Read safe files' },
  { pattern: /^head\s+-n\s+\d+\s+/, description: 'Read file head' },
  { pattern: /^tail\s+-n\s+\d+\s+/, description: 'Read file tail' },
  { pattern: /^grep\s+/, description: 'Search files' },
  { pattern: /^find\s+/, description: 'Find files' },
  { pattern: /^wc\s+-l\s+/, description: 'Count lines' },
  
  // Git operations (read-only)
  { pattern: /^git\s+status(\s|$)/, description: 'Git status' },
  { pattern: /^git\s+log(\s|$)/, description: 'Git log' },
  { pattern: /^git\s+diff(\s|$)/, description: 'Git diff' },
  { pattern: /^git\s+branch(\s|$)/, description: 'List branches' },
];

/**
 * Blocklist - Dangerous commands that are explicitly blocked
 * These require high-risk approval or are denied entirely
 */
const BLOCKED_COMMANDS = [
  // Destructive operations
  { pattern: /\brm\s+-rf?\s+/, description: 'Recursive file deletion', severity: 'high' },
  { pattern: /\brm\s+/, description: 'File deletion', severity: 'medium' },
  { pattern: /\bchmod\s+/, description: 'Permission changes', severity: 'medium' },
  { pattern: /\bchown\s+/, description: 'Ownership changes', severity: 'medium' },
  
  // Privilege escalation
  { pattern: /\bsudo\s+/, description: 'Elevated privileges', severity: 'high' },
  { pattern: /\bsu\s+/, description: 'Switch user', severity: 'high' },
  
  // Remote operations
  { pattern: /\bssh\s+/, description: 'Remote shell', severity: 'high' },
  { pattern: /\bscp\s+/, description: 'Remote copy', severity: 'medium' },
  { pattern: /\brsync\s+/, description: 'Remote sync', severity: 'medium' },
  
  // Network security
  { pattern: /\biptables\s+/, description: 'Firewall rules', severity: 'high' },
  { pattern: /\bufw\s+/, description: 'Firewall changes', severity: 'high' },
  
  // Environment access
  { pattern: /\benv\b/, description: 'Environment variables', severity: 'medium' },
  { pattern: /\bprintenv\b/, description: 'Print environment', severity: 'medium' },
  { pattern: /\bexport\s+[A-Z_]+=/, description: 'Export variables', severity: 'medium' },
  
  // Package management
  { pattern: /\bapt\s+/, description: 'Package management', severity: 'medium' },
  { pattern: /\bapt-get\s+/, description: 'Package management', severity: 'medium' },
  { pattern: /\byum\s+/, description: 'Package management', severity: 'medium' },
  { pattern: /\bnpm\s+install\s+/, description: 'NPM install', severity: 'medium' },
  
  // System control
  { pattern: /\bsystemctl\s+(stop|start|restart|reload)/, description: 'Service control', severity: 'high' },
  { pattern: /\breboot\b/, description: 'System reboot', severity: 'high' },
  { pattern: /\bshutdown\b/, description: 'System shutdown', severity: 'high' },
];

/**
 * Classify a command for safety
 * @param {string} command - The command to classify
 * @returns {CommandClassification}
 */
export function classifyCommand(command) {
  if (!command || typeof command !== 'string') {
    return {
      level: 'blocked',
      reason: 'Invalid command',
      autoExecute: false,
    };
  }

  const trimmedCommand = command.trim();

  // Check if command contains sensitive operations (secret access)
  if (containsSensitiveOperation(trimmedCommand)) {
    return {
      level: 'blocked',
      reason: 'Command attempts to access sensitive data (secrets, env vars, keys)',
      autoExecute: false,
    };
  }

  // Check blocklist first (explicit blocks)
  for (const blocked of BLOCKED_COMMANDS) {
    if (blocked.pattern.test(trimmedCommand)) {
      return {
        level: blocked.severity === 'high' ? 'blocked' : 'requires_approval',
        reason: `${blocked.description} - ${blocked.severity} risk`,
        autoExecute: false,
      };
    }
  }

  // Check allowlist (safe commands)
  for (const safe of SAFE_COMMANDS) {
    if (safe.pattern.test(trimmedCommand)) {
      return {
        level: 'allowed',
        reason: `Safe diagnostic command: ${safe.description}`,
        autoExecute: true,
      };
    }
  }

  // Default: Unknown commands require approval
  return {
    level: 'requires_approval',
    reason: 'Command not in safe allowlist - manual approval required',
    autoExecute: false,
  };
}

/**
 * Check if a file operation is safe
 * @param {string} operation - The operation type (read, write, delete, etc.)
 * @param {string} filePath - The target file path
 * @returns {CommandClassification}
 */
export function classifyFileOperation(operation, filePath) {
  const opLower = operation?.toLowerCase();

  // Read operations on safe paths
  if (opLower === 'read' || opLower === 'list') {
    if (filePath && (
      filePath.includes('.env') ||
      filePath.includes('secret') ||
      filePath.includes('.key') ||
      filePath.includes('password')
    )) {
      return {
        level: 'blocked',
        reason: 'Attempting to read sensitive file',
        autoExecute: false,
      };
    }
    return {
      level: 'allowed',
      reason: 'Read-only operation on safe path',
      autoExecute: true,
    };
  }

  // Write/create operations require approval
  if (opLower === 'write' || opLower === 'create' || opLower === 'modify') {
    return {
      level: 'requires_approval',
      reason: 'File modification requires approval',
      autoExecute: false,
    };
  }

  // Delete operations are high risk
  if (opLower === 'delete' || opLower === 'remove') {
    return {
      level: 'blocked',
      reason: 'File deletion requires explicit approval',
      autoExecute: false,
    };
  }

  // Unknown operation
  return {
    level: 'requires_approval',
    reason: 'Unknown file operation type',
    autoExecute: false,
  };
}

/**
 * Get a human-readable explanation of the classification
 * @param {CommandClassification} classification
 * @returns {string}
 */
export function getClassificationMessage(classification) {
  const { level, reason } = classification;

  switch (level) {
    case 'allowed':
      return `✅ Safe to execute: ${reason}`;
    case 'requires_approval':
      return `⚠️ Approval required: ${reason}`;
    case 'blocked':
      return `🚫 Blocked: ${reason}`;
    default:
      return `Unknown classification: ${reason}`;
  }
}
