/**
 * Developer AI - Superadmin-only AI assistant for code development
 * Uses Claude 3.5 Sonnet for advanced coding tasks
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Initialize Anthropic client
let anthropicClient = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropicClient = new Anthropic({
      apiKey,
      baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    });
  }
  return anthropicClient;
}

// Allowed directories for file operations (security boundary)
const ALLOWED_PATHS = [
  '/app/backend',
  '/app/braid-llm-kit',
  '/app/src',  // Frontend source (if mounted)
];

const FORBIDDEN_PATTERNS = [
  '.env',
  'secrets',
  'credentials',
  'password',
  '.pem',
  '.key',
  'doppler',
];

// Developer AI Tools
const DEVELOPER_TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file from the codebase. Use this to understand existing code before making changes.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file relative to /app (e.g., "backend/routes/ai.js")',
        },
        start_line: {
          type: 'integer',
          description: 'Optional: Start reading from this line number (1-indexed)',
        },
        end_line: {
          type: 'integer',
          description: 'Optional: Stop reading at this line number (inclusive)',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories in a path. Use this to explore the codebase structure.',
    input_schema: {
      type: 'object',
      properties: {
        dir_path: {
          type: 'string',
          description: 'Path to directory relative to /app (e.g., "backend/routes")',
        },
        recursive: {
          type: 'boolean',
          description: 'If true, list contents recursively (max 3 levels deep)',
        },
      },
      required: ['dir_path'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for a pattern in the codebase using grep. Returns matching lines with context.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Search pattern (supports regex)',
        },
        directory: {
          type: 'string',
          description: 'Directory to search in, relative to /app (e.g., "backend")',
        },
        file_pattern: {
          type: 'string',
          description: 'Optional: File pattern to filter (e.g., "*.js")',
        },
        case_insensitive: {
          type: 'boolean',
          description: 'If true, search is case-insensitive',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'read_logs',
    description: 'Read application logs from the container. Use this to diagnose issues or understand runtime behavior.',
    input_schema: {
      type: 'object',
      properties: {
        log_type: {
          type: 'string',
          enum: ['backend', 'errors', 'ai', 'braid'],
          description: 'Type of logs to read',
        },
        lines: {
          type: 'integer',
          description: 'Number of recent log lines to retrieve (default: 100, max: 500)',
        },
        filter: {
          type: 'string',
          description: 'Optional: Filter logs containing this string',
        },
      },
      required: ['log_type'],
    },
  },
  {
    name: 'get_file_outline',
    description: 'Get an outline of functions and classes in a JavaScript/TypeScript file',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file relative to /app',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'propose_change',
    description: 'Propose a code change. This generates a diff that the superadmin can review and apply.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to modify',
        },
        change_description: {
          type: 'string',
          description: 'Description of what the change does',
        },
        original_code: {
          type: 'string',
          description: 'The exact original code to replace',
        },
        new_code: {
          type: 'string',
          description: 'The new code to insert',
        },
      },
      required: ['file_path', 'change_description', 'original_code', 'new_code'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file. This will REPLACE the entire file content. Requires user approval. Use propose_change for targeted edits.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file relative to /app (e.g., "backend/routes/test.js")',
        },
        content: {
          type: 'string',
          description: 'The complete file content to write',
        },
        description: {
          type: 'string',
          description: 'Brief description of what this file does or why it is being written',
        },
      },
      required: ['file_path', 'content', 'description'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a new file. Fails if the file already exists. Requires user approval.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path for the new file relative to /app',
        },
        content: {
          type: 'string',
          description: 'The initial content for the new file',
        },
        description: {
          type: 'string',
          description: 'Brief description of what this file is for',
        },
      },
      required: ['file_path', 'content', 'description'],
    },
  },
  {
    name: 'run_command',
    description: 'Execute a shell command in the container. Safe commands (npm run lint, npm test, etc.) are auto-approved. Other commands require user approval.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute (e.g., "npm run lint", "npm test backend/lib/test.js")',
        },
        working_directory: {
          type: 'string',
          description: 'Optional: Directory to run the command in, relative to /app (default: /app)',
        },
        reason: {
          type: 'string',
          description: 'Why this command needs to be run',
        },
      },
      required: ['command', 'reason'],
    },
  },
];

// Security check for file paths
function isPathAllowed(filePath) {
  const normalizedPath = path.normalize(filePath);
  
  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (normalizedPath.toLowerCase().includes(pattern)) {
      return false;
    }
  }
  
  // Check if within allowed directories
  const fullPath = path.join('/app', normalizedPath);
  return ALLOWED_PATHS.some(allowed => fullPath.startsWith(allowed));
}

// Tool implementations
async function readFile({ file_path, start_line, end_line }) {
  if (!isPathAllowed(file_path)) {
    return { error: `Access denied: ${file_path} is not in an allowed directory or contains forbidden patterns` };
  }
  
  const fullPath = path.join('/app', file_path);
  
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');
    
    if (start_line || end_line) {
      const start = (start_line || 1) - 1;
      const end = end_line || lines.length;
      const selectedLines = lines.slice(start, end);
      return {
        file: file_path,
        total_lines: lines.length,
        showing_lines: `${start + 1}-${Math.min(end, lines.length)}`,
        content: selectedLines.map((line, i) => `${start + i + 1}: ${line}`).join('\n'),
      };
    }
    
    // For large files, truncate
    if (lines.length > 500) {
      return {
        file: file_path,
        total_lines: lines.length,
        note: 'File truncated to first 500 lines. Use start_line/end_line to view specific sections.',
        content: lines.slice(0, 500).map((line, i) => `${i + 1}: ${line}`).join('\n'),
      };
    }
    
    return {
      file: file_path,
      total_lines: lines.length,
      content: lines.map((line, i) => `${i + 1}: ${line}`).join('\n'),
    };
  } catch (error) {
    return { error: `Failed to read file: ${error.message}` };
  }
}

async function listDirectory({ dir_path, recursive }) {
  if (!isPathAllowed(dir_path)) {
    return { error: `Access denied: ${dir_path} is not in an allowed directory` };
  }
  
  const fullPath = path.join('/app', dir_path);
  
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const result = [];
    
    for (const entry of entries) {
      const entryPath = path.join(dir_path, entry.name);
      const item = {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: entryPath,
      };
      
      if (entry.isFile()) {
        try {
          const stats = await fs.stat(path.join(fullPath, entry.name));
          item.size = stats.size;
        } catch { /* ignore stat errors */ }
      }
      
      if (recursive && entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        try {
          const subEntries = await fs.readdir(path.join(fullPath, entry.name));
          item.children_count = subEntries.length;
        } catch { /* ignore readdir errors */ }
      }
      
      result.push(item);
    }
    
    return {
      directory: dir_path,
      entries: result.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    };
  } catch (error) {
    return { error: `Failed to list directory: ${error.message}` };
  }
}

async function searchCode({ pattern, directory = 'backend', file_pattern, case_insensitive }) {
  if (!isPathAllowed(directory)) {
    return { error: `Access denied: ${directory} is not in an allowed directory` };
  }
  
  const fullPath = path.join('/app', directory);
  
  try {
    let cmd = `grep -rn${case_insensitive ? 'i' : ''} --include="${file_pattern || '*.js'}" "${pattern}" "${fullPath}" 2>/dev/null | head -50`;
    const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 });
    
    if (!stdout.trim()) {
      return { pattern, directory, matches: [], message: 'No matches found' };
    }
    
    const matches = stdout.trim().split('\n').map(line => {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (match) {
        return {
          file: match[1].replace('/app/', ''),
          line: parseInt(match[2]),
          content: match[3].trim(),
        };
      }
      return { raw: line };
    });
    
    return {
      pattern,
      directory,
      matches,
      total_shown: matches.length,
      note: matches.length >= 50 ? 'Results limited to 50 matches. Narrow your search for more specific results.' : undefined,
    };
  } catch (error) {
    return { error: `Search failed: ${error.message}` };
  }
}

async function readLogs({ log_type, lines = 100, filter }) {
  const maxLines = Math.min(lines, 500);
  const isProduction = process.env.NODE_ENV === 'production';
  
  // In production, logs aren't accessible via docker - they're in the platform's logging system
  if (isProduction) {
    return {
      log_type,
      note: 'In production, logs are accessed via the deployment platform (Railway, Render, etc.) rather than via Docker. Use the platform\'s log viewer for production debugging.',
      suggestion: 'For real-time debugging in production, check the platform\'s logging dashboard or consider searching the codebase for error handling related to the issue.',
    };
  }
  
  try {
    // Local development: Read from container stdout/stderr (captured by Docker)
    let cmd;
    
    switch (log_type) {
      case 'backend':
        cmd = `docker logs aishacrm-backend --tail ${maxLines} 2>&1`;
        break;
      case 'errors':
        cmd = `docker logs aishacrm-backend --tail ${maxLines * 2} 2>&1 | grep -iE "error|exception|failed|crash" | tail -${maxLines}`;
        break;
      case 'ai':
        cmd = `docker logs aishacrm-backend --tail ${maxLines * 2} 2>&1 | grep -iE "\\[AI|\\[Braid|LLM_CALL|tool" | tail -${maxLines}`;
        break;
      case 'braid':
        cmd = `docker logs aishacrm-backend --tail ${maxLines * 2} 2>&1 | grep -i "braid" | tail -${maxLines}`;
        break;
      default:
        return { error: `Unknown log type: ${log_type}` };
    }
    
    if (filter) {
      cmd = `${cmd} | grep -i "${filter}"`;
    }
    
    const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 });
    
    return {
      log_type,
      lines_requested: maxLines,
      filter: filter || null,
      content: stdout || 'No logs found matching criteria',
    };
  } catch (error) {
    return {
      log_type,
      error: `Log retrieval failed: ${error.message}`,
      note: 'Local dev logs require docker to be running. Use docker compose logs backend directly.',
    };
  }
}

async function getFileOutline({ file_path }) {
  const result = await readFile({ file_path });
  if (result.error) return result;
  
  const lines = result.content.split('\n');
  const outline = [];
  
  // Simple regex-based outline extraction for JS/TS
  const patterns = [
    { type: 'function', regex: /^\d+:\s*(export\s+)?(async\s+)?function\s+(\w+)/ },
    { type: 'const_function', regex: /^\d+:\s*(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\(/ },
    { type: 'arrow_function', regex: /^\d+:\s*(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?.*=>/ },
    { type: 'class', regex: /^\d+:\s*(export\s+)?class\s+(\w+)/ },
    { type: 'method', regex: /^\d+:\s+(async\s+)?(\w+)\s*\([^)]*\)\s*{/ },
  ];
  
  for (const line of lines) {
    for (const { type, regex } of patterns) {
      const match = line.match(regex);
      if (match) {
        const lineNum = parseInt(line.match(/^(\d+):/)?.[1] || '0');
        const name = match[3] || match[2];
        if (name && !['if', 'for', 'while', 'switch', 'catch', 'try'].includes(name)) {
          outline.push({ type, name, line: lineNum });
        }
        break;
      }
    }
  }
  
  return {
    file: file_path,
    total_lines: result.total_lines,
    outline,
  };
}

function proposeChange({ file_path, change_description, original_code, new_code }) {
  // This doesn't actually apply the change - it returns a proposal for review
  return {
    type: 'code_change_proposal',
    file: file_path,
    description: change_description,
    diff: {
      original: original_code,
      proposed: new_code,
    },
    instructions: 'Review this proposed change. To apply it, copy the new code and paste it into the file, or ask me to write it directly.',
  };
}

// Pending actions store (in-memory, could be moved to Redis for persistence)
const pendingActions = new Map();

// Safe commands that don't require approval
const SAFE_COMMANDS = [
  /^npm run lint/,
  /^npm run test/,
  /^npm test/,
  /^cat /,
  /^head /,
  /^tail /,
  /^grep /,
  /^ls /,
  /^pwd$/,
  /^echo /,
  /^docker logs/,
  /^wc /,
];

// Blocked commands (never allowed)
const BLOCKED_COMMANDS = [
  /rm\s+-rf/,
  /rm\s+--force/,
  /\bformat\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bdd\s+if=/,
  />\s*\/dev\//,
];

// Check if command is safe to auto-approve
function isCommandSafe(command) {
  const normalized = command.trim().toLowerCase();
  
  // Check blocked commands first
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(normalized)) {
      return { safe: false, blocked: true, reason: 'This command is blocked for security reasons' };
    }
  }
  
  // Check safe commands
  for (const pattern of SAFE_COMMANDS) {
    if (pattern.test(normalized)) {
      return { safe: true, blocked: false };
    }
  }
  
  return { safe: false, blocked: false, reason: 'Requires user approval' };
}

// Write file implementation - returns approval request
async function writeFile({ file_path, content, description }) {
  if (!isPathAllowed(file_path)) {
    return { error: `Access denied: ${file_path} is not in an allowed directory or contains forbidden patterns` };
  }
  
  const fullPath = path.join('/app', file_path);
  const actionId = `write_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Check if file exists
  let existingContent = null;
  try {
    existingContent = await fs.readFile(fullPath, 'utf-8');
  } catch {
    // File doesn't exist - that's okay for write_file
  }
  
  // Store pending action
  pendingActions.set(actionId, {
    type: 'write_file',
    file_path,
    content,
    description,
    existingContent,
    createdAt: Date.now(),
    status: 'pending',
  });
  
  // Return approval request
  return {
    type: 'approval_required',
    action_id: actionId,
    action_type: 'write_file',
    file: file_path,
    description,
    preview: content.length > 500 ? content.substring(0, 500) + '\n... (truncated)' : content,
    lines: content.split('\n').length,
    instructions: `This will ${existingContent ? 'REPLACE' : 'CREATE'} the file. Click "Approve" to proceed or "Reject" to cancel.`,
  };
}

// Create file implementation - returns approval request
async function createFile({ file_path, content, description }) {
  if (!isPathAllowed(file_path)) {
    return { error: `Access denied: ${file_path} is not in an allowed directory or contains forbidden patterns` };
  }
  
  const fullPath = path.join('/app', file_path);
  
  // Check if file already exists
  try {
    await fs.access(fullPath);
    return { error: `File already exists: ${file_path}. Use write_file to overwrite or propose_change for edits.` };
  } catch {
    // File doesn't exist - good
  }
  
  const actionId = `create_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  // Store pending action
  pendingActions.set(actionId, {
    type: 'create_file',
    file_path,
    content,
    description,
    createdAt: Date.now(),
    status: 'pending',
  });
  
  // Return approval request
  return {
    type: 'approval_required',
    action_id: actionId,
    action_type: 'create_file',
    file: file_path,
    description,
    preview: content.length > 500 ? content.substring(0, 500) + '\n... (truncated)' : content,
    lines: content.split('\n').length,
    instructions: 'This will create a new file. Click "Approve" to proceed or "Reject" to cancel.',
  };
}

// Run command implementation - auto-approves safe commands, requests approval for others
async function runCommand({ command, working_directory, reason }) {
  const safetyCheck = isCommandSafe(command);
  
  if (safetyCheck.blocked) {
    return { error: safetyCheck.reason, command, blocked: true };
  }
  
  const cwd = working_directory ? path.join('/app', working_directory) : '/app';
  
  if (safetyCheck.safe) {
    // Auto-execute safe commands
    try {
      console.log(`[Developer AI] Auto-executing safe command: ${command}`);
      const { stdout, stderr } = await execAsync(command, { 
        cwd, 
        maxBuffer: 1024 * 1024,
        timeout: 30000 // 30 second timeout
      });
      
      return {
        command,
        auto_approved: true,
        reason,
        output: stdout || stderr || '(no output)',
        exit_code: 0,
      };
    } catch (error) {
      return {
        command,
        auto_approved: true,
        reason,
        error: error.message,
        output: error.stdout || error.stderr || '',
        exit_code: error.code || 1,
      };
    }
  }
  
  // Requires approval
  const actionId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  
  pendingActions.set(actionId, {
    type: 'run_command',
    command,
    working_directory: cwd,
    reason,
    createdAt: Date.now(),
    status: 'pending',
  });
  
  return {
    type: 'approval_required',
    action_id: actionId,
    action_type: 'run_command',
    command,
    working_directory: cwd,
    reason,
    instructions: 'This command requires your approval. Click "Approve" to execute or "Reject" to cancel.',
  };
}

// Execute an approved action
export async function executeApprovedAction(actionId) {
  const action = pendingActions.get(actionId);
  
  if (!action) {
    return { error: 'Action not found or already executed' };
  }
  
  if (action.status !== 'pending') {
    return { error: `Action is ${action.status}, cannot execute` };
  }
  
  action.status = 'executing';
  
  try {
    switch (action.type) {
      case 'write_file':
      case 'create_file': {
        const fullPath = path.join('/app', action.file_path);
        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, action.content, 'utf-8');
        action.status = 'completed';
        pendingActions.delete(actionId);
        return {
          success: true,
          action_type: action.type,
          file: action.file_path,
          message: `File ${action.type === 'create_file' ? 'created' : 'written'} successfully`,
        };
      }
      
      case 'run_command': {
        const { stdout, stderr } = await execAsync(action.command, {
          cwd: action.working_directory,
          maxBuffer: 1024 * 1024,
          timeout: 30000,
        });
        action.status = 'completed';
        pendingActions.delete(actionId);
        return {
          success: true,
          action_type: 'run_command',
          command: action.command,
          output: stdout || stderr || '(no output)',
          exit_code: 0,
        };
      }
      
      default:
        action.status = 'failed';
        return { error: `Unknown action type: ${action.type}` };
    }
  } catch (error) {
    action.status = 'failed';
    return {
      success: false,
      action_type: action.type,
      error: error.message,
    };
  }
}

// Reject an action
export function rejectAction(actionId) {
  const action = pendingActions.get(actionId);
  
  if (!action) {
    return { error: 'Action not found' };
  }
  
  action.status = 'rejected';
  pendingActions.delete(actionId);
  
  return {
    success: true,
    action_id: actionId,
    message: 'Action rejected',
  };
}

// Get pending action for verification
export function getPendingAction(actionId) {
  return pendingActions.get(actionId) || null;
}

// Execute a developer tool
async function executeDeveloperTool(toolName, args) {
  console.log(`[Developer AI] Executing tool: ${toolName}`, JSON.stringify(args).substring(0, 200));
  
  switch (toolName) {
    case 'read_file':
      return readFile(args);
    case 'list_directory':
      return listDirectory(args);
    case 'search_code':
      return searchCode(args);
    case 'read_logs':
      return readLogs(args);
    case 'get_file_outline':
      return getFileOutline(args);
    case 'propose_change':
      return proposeChange(args);
    case 'write_file':
      return writeFile(args);
    case 'create_file':
      return createFile(args);
    case 'run_command':
      return runCommand(args);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// Developer AI System Prompt with full architecture context
const DEVELOPER_SYSTEM_PROMPT = `You are a Senior Software Engineer AI assistant with direct access to the AiSHA CRM codebase.

## ARCHITECTURE OVERVIEW

AiSHA CRM is a multi-tenant SaaS CRM platform with AI-powered features including:
- Voice-enabled assistant (AiSHA)
- AI-powered lead scoring and activity management
- Workflow automation with n8n integration
- Real-time notifications and activity tracking

### Core Entities (Database Tables)
1. **tenants** - Multi-tenant isolation (each customer is a tenant)
2. **users** - User accounts, linked to auth.users via Supabase
3. **employees** - Employee records per tenant (can be linked to users)
4. **leads** - Sales leads (B2B or B2C via lead_type field)
5. **contacts** - Contact persons, linked to accounts
6. **accounts** - Company/organization records
7. **opportunities** - Sales deals with stages (prospecting, qualification, proposal, negotiation, closed_won, closed_lost)
8. **activities** - Tasks, calls, meetings, emails (has due_date + due_time, related_to + related_id for polymorphic relations)
9. **notes** - Notes on any entity (polymorphic via related_type + related_id)
10. **workflows** - Automation workflows (React Flow based)
11. **bizdev_sources** - Business development sources (can be promoted to leads)
12. **construction_projects, workers** - Industry-specific extensions

### Key Relationships
- leads.assigned_to -> employees.id (UUID)
- contacts.account_id -> accounts.id
- opportunities.account_id -> accounts.id
- activities.related_to + activities.related_id = polymorphic link to any entity
- All entities have tenant_id for multi-tenant isolation

## TECH STACK

**Backend (Node.js/Express):**
- /app/backend/server.js - Main entry point
- /app/backend/routes/ - All API endpoints (activities.v2.js, leads.js, contacts.js, accounts.js, ai.js, etc.)
- /app/backend/lib/ - Shared libraries:
  - supabase-db.js - Supabase client wrapper
  - braidIntegration-v2.js - AI tool calling via Braid DSL
  - aiEngine/ - LLM provider abstraction (OpenAI, Groq, Anthropic)
  - tenantContextDictionary.js - Tenant data context for AI
  - entityLabelInjector.js - Custom field labels per tenant

**Frontend (React/Vite):**
- /app/src/pages/ - Main page components (Dashboard, Leads, Contacts, Accounts, etc.)
- /app/src/components/ - Reusable UI components:
  - ai/ - AIAssistantWidget.jsx (chat widget), voice integrations
  - shared/ - UniversalDetailPanel.jsx, timezoneUtils.jsx
  - forms/ - Entity forms (LeadForm.jsx, ContactForm.jsx, etc.)
- /app/src/api/ - API client layer:
  - entities.js - CRUD operations for all entities
  - functions.js - Cloud function wrappers

**AI Tool Calling (Braid DSL):**
- /app/braid-llm-kit/examples/assistant/ - Tool definitions
  - activities.braid - Activity CRUD, get upcoming activities
  - leads.braid - Lead CRUD, search, scoring
  - contacts.braid - Contact management
  - accounts.braid - Account management
  - opportunities.braid - Pipeline management
  - navigation.braid - CRM page navigation
- Tools are registered in braidIntegration-v2.js TOOL_REGISTRY

## KEY PATTERNS

**Multi-Tenant Isolation:**
- Every API call includes tenant_id (via header x-tenant-id or query param)
- RLS policies in Supabase enforce tenant isolation
- Use getTenantId(req) to extract tenant from requests

**AI Chat Flow:**
1. User message -> POST /api/ai/chat
2. Request goes through tenant resolution
3. AI receives system prompt with context + available tools
4. AI can call Braid tools (executeBraidTool)
5. Results are summarized and returned

**Activity Time Handling:**
- due_date is stored as DATE (YYYY-MM-DD)
- due_time is stored as TIME in LOCAL TIME (not UTC!)
- Frontend displays time directly without conversion
- When AI updates via datetime string, backend extracts date and time separately

**Entity Updates:**
- Standard pattern: PUT /api/v2/{entity}/{id}
- Payload includes fields to update
- tenant_id required for authorization

## COMMON DEVELOPMENT TASKS

**Adding a new API endpoint:**
1. Create or edit route file in /app/backend/routes/
2. Register in server.js
3. Add corresponding frontend API call in functions.js

**Adding a new AI tool:**
1. Create or edit .braid file in /app/braid-llm-kit/examples/assistant/
2. Register tool in TOOL_REGISTRY in braidIntegration-v2.js
3. Add parameter order in BRAID_PARAM_ORDER
4. Update BRAID_SYSTEM_PROMPT if needed

**Modifying database schema:**
1. Update schemas in /app/backend/migrations/
2. Ensure RLS policies include tenant_id checks

## CURRENT FILE STRUCTURE (Key Files)

\`\`\`
/app/backend/
├── server.js              # Main entry, route registration
├── routes/
│   ├── ai.js              # AI endpoints (chat, developer, realtime)
│   ├── activities.v2.js   # Activity CRUD (uses smart date/time handling)
│   ├── leads.js           # Lead management
│   ├── contacts.js        # Contact management
│   ├── accounts.js        # Account management
│   └── ...
├── lib/
│   ├── braidIntegration-v2.js  # AI tool calling
│   ├── aiEngine/               # LLM abstraction layer
│   ├── supabase-db.js          # Database client
│   └── developerAI.js          # This Developer AI module
└── migrations/            # Database schemas

/app/braid-llm-kit/
├── examples/assistant/    # Braid tool definitions
│   ├── activities.braid
│   ├── leads.braid
│   └── ...
└── spec/                  # Type definitions

/app/src/
├── pages/                 # Main page components
├── components/
│   ├── ai/                # AI assistant UI
│   ├── shared/            # Common components
│   └── forms/             # Entity forms
├── api/
│   ├── entities.js        # Entity CRUD
│   └── functions.js       # Function proxies
└── utils/                 # Utility functions
\`\`\`

## YOUR CAPABILITIES

1. **Read and analyze code** - Use read_file to examine specific files
2. **Search codebase** - Use search_code to find patterns, function calls, or bugs
3. **Browse structure** - Use list_directory to explore the codebase
4. **Review logs** - Use read_logs to diagnose runtime issues
5. **Get outlines** - Use get_file_outline to understand file structure
6. **Propose changes** - Use propose_change to suggest code modifications

## GUIDELINES

1. You have full context of the architecture - use your knowledge before reading files
2. Be specific with file paths and line numbers when discussing code
3. When proposing changes, explain the reasoning and any trade-offs
4. Consider multi-tenant implications for any changes
5. Follow existing code patterns and conventions
6. For AI tool changes, remember to update both .braid files AND braidIntegration-v2.js

## SECURITY BOUNDARIES

- Cannot access .env files, secrets, or credentials
- Changes require superadmin approval
- All operations are logged

You are here to help the superadmin understand, debug, and improve the AiSHA CRM codebase efficiently.`;

// Main chat function for Developer AI
export async function developerChat(messages, userId) {
  const client = getAnthropicClient();
  
  console.log('[Developer AI] Starting chat with', messages.length, 'messages');
  
  // Build conversation with tool use
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    system: DEVELOPER_SYSTEM_PROMPT,
    tools: DEVELOPER_TOOLS,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });
  
  console.log('[Developer AI] Initial response:', response.stop_reason);
  
  // Handle tool use loop
  let currentResponse = response;
  const conversationHistory = [...messages];
  
  while (currentResponse.stop_reason === 'tool_use') {
    const toolUseBlocks = currentResponse.content.filter(block => block.type === 'tool_use');
    const toolResults = [];
    
    for (const toolUse of toolUseBlocks) {
      console.log('[Developer AI] Tool call:', toolUse.name);
      const result = await executeDeveloperTool(toolUse.name, toolUse.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result, null, 2),
      });
    }
    
    // Add assistant message with tool calls
    conversationHistory.push({
      role: 'assistant',
      content: currentResponse.content,
    });
    
    // Add tool results
    conversationHistory.push({
      role: 'user',
      content: toolResults,
    });
    
    // Continue conversation
    currentResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      system: DEVELOPER_SYSTEM_PROMPT,
      tools: DEVELOPER_TOOLS,
      messages: conversationHistory.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });
    
    console.log('[Developer AI] Continued response:', currentResponse.stop_reason);
  }
  
  // Extract final text response
  const textBlocks = currentResponse.content.filter(block => block.type === 'text');
  const responseText = textBlocks.map(b => b.text).join('\n');
  
  return {
    response: responseText,
    usage: currentResponse.usage,
    model: 'claude-sonnet-4-20250514',
  };
}

// Check if user is superadmin
export function isSuperadmin(user) {
  return user?.role === 'superadmin';
}

export { DEVELOPER_TOOLS, executeDeveloperTool };
