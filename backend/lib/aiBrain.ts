import { randomUUID } from 'node:crypto';
import { getOpenAIClient } from './aiProvider.js';
import {
  BRAID_SYSTEM_PROMPT,
  executeBraidTool,
  generateToolSchemas,
  summarizeToolResult,
} from './braidIntegration-v2.js';
import { resolveCanonicalTenant, isUuid as isUuidHelper } from './tenantCanonicalResolver.js';

export type BrainMode = 'read_only' | 'propose_actions' | 'apply_allowed';

export interface ProposedAction {
  type: 'create' | 'update';
  entity: string;
  payload: Record<string, any>;
  reason: string;
  confidence: number;
}

export interface RunTaskParams {
  tenantId: string;
  userId: string;
  taskType: string;
  context: Record<string, any>;
  mode: BrainMode;
}

export interface RunTaskResult {
  summary: string;
  insights: string[];
  proposed_actions: ProposedAction[];
  requires_confirmation: boolean;
}

interface CanonicalTenant {
  uuid: string | null;
  slug: string | null;
  source: string;
  found: boolean;
}

interface ToolSchema {
  type?: string;
  function?: {
    name?: string;
  };
  [key: string]: any;
}

interface ToolCall {
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface ToolRegistryEntry {
  policy?: string;
}

type ToolRegistry = Record<string, ToolRegistryEntry>;

interface BrainRunLog {
  runId: string;
  timestamp: string;
  tenantId: string | null;
  userId: string;
  taskType: string;
  mode: BrainMode;
  durationMs: number;
  success: boolean;
  error?: string;
}

const READ_ONLY_NAME_REGEX = /^(search_|list_|get_|fetch_|lookup_|debug_)/i;

function assertUuid(value: string, label: string): void {
  if (!value || !isUuid(value)) {
    throw new BrainError(`${label} must be a valid UUID`, 400);
  }
}

function isUuid(value: string): boolean {
  if (typeof isUuidHelper === 'function') {
    return isUuidHelper(value);
  }
  const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return UUID_REGEX.test(value ?? '');
}

function buildSystemPrompt(params: RunTaskParams, tenant: CanonicalTenant): string {
  const modeDescription =
    params.mode === 'read_only'
      ? 'Read-only mode: Only data retrieval is allowed.'
      : params.mode === 'propose_actions'
        ? 'Propose-actions mode: You may suggest create/update actions but MUST NOT execute them.'
        : 'Apply mode requested, but Phase 1 forbids autonomous execution.';

  const contextSummary = JSON.stringify(params.context ?? {}, null, 2);

  return `${BRAID_SYSTEM_PROMPT}\n\n` +
    `Tenant UUID: ${tenant.uuid || 'unknown'}\n` +
    `Tenant Slug: ${tenant.slug || 'unknown'}\n` +
    `User ID: ${params.userId}\n` +
    `Task Type: ${params.taskType}\n` +
    `Mode: ${params.mode}\n` +
    `${modeDescription}\n` +
    `Context:\n${contextSummary}`;
}

function logBrainRun(entry: BrainRunLog): void {
  console.log('[AI Brain]', JSON.stringify(entry));
}

function classifyReadOnly(toolName: string, policy?: string): boolean {
  if (policy && policy.toUpperCase() === 'READ_ONLY') {
    return true;
  }
  return READ_ONLY_NAME_REGEX.test(toolName);
}

function classifyActionType(toolName: string): 'create' | 'update' | null {
  if (toolName.startsWith('create_')) return 'create';
  if (toolName.startsWith('update_')) return 'update';
  if (toolName.startsWith('mark_') || toolName.startsWith('schedule_')) return 'update';
  return null;
}

function sanitizeTextContent(content: any): string {
  if (!content) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block?.type === 'text' && typeof block?.text?.content === 'string') {
          return block.text.content;
        }
        if (block?.type === 'output_text' && typeof block?.text === 'string') {
          return block.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object' && typeof content?.text === 'string') {
    return content.text;
  }
  return '';
}

function normalizeContext(context: Record<string, any> | undefined): Record<string, any> {
  if (!context || typeof context !== 'object') {
    return {};
  }
  return context;
}

function parseToolArgs(rawArgs: string | undefined, toolName: string): Record<string, any> {
  if (!rawArgs) return {};
  try {
    return JSON.parse(rawArgs);
  } catch (error) {
    console.warn(`[AI Brain] Failed to parse arguments for ${toolName}:`, error);
    return {};
  }
}

class BrainError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'BrainError';
    this.statusCode = statusCode;
  }
}

export async function runTask(params: RunTaskParams): Promise<RunTaskResult> {
  const start = Date.now();
  const runId = randomUUID();
  const context = normalizeContext(params.context);

  try {
    assertUuid(params.tenantId, 'tenantId');
    assertUuid(params.userId, 'userId');

    if (!params.taskType || typeof params.taskType !== 'string') {
      throw new BrainError('taskType is required', 400);
    }

    if (params.mode === 'apply_allowed') {
      throw new BrainError('apply_allowed mode is not implemented in Phase 1', 501);
    }

    const tenant = (await resolveCanonicalTenant(params.tenantId)) as CanonicalTenant;
    if (!tenant?.found || !tenant.uuid) {
      throw new BrainError(`Unable to resolve tenant ${params.tenantId}`, 404);
    }

    if (!tenant.slug) {
      throw new BrainError(`Tenant ${params.tenantId} is missing canonical slug`, 500);
    }

    const allowedToolNames = await resolveAllowedTools(params.mode);
    const toolSchemas = (await generateToolSchemas(allowedToolNames)) as ToolSchema[];
    const filteredSchemas = filterToolSchemas(toolSchemas, allowedToolNames);

    const systemPrompt = buildSystemPrompt({ ...params, context }, tenant);
    const openai = getOpenAIClient() as any;

    const completionPayload: any = {
      model: process.env.DEFAULT_OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Task Type: ${params.taskType}\nContext: ${JSON.stringify(context, null, 2)}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    };

    if (filteredSchemas.length > 0) {
      completionPayload.tools = filteredSchemas as any;
      completionPayload.tool_choice = 'auto';
    }

    const completion = await openai.chat.completions.create(completionPayload);

    const choice = completion?.choices?.[0];
    const assistantMessage = choice?.message || {};
    const summary = sanitizeTextContent(assistantMessage.content) || 'No summary provided.';
    const insights: string[] = [];
    const proposedActions: ProposedAction[] = [];

    const toolCalls = (assistantMessage.tool_calls as ToolCall[]) || [];

    for (const call of toolCalls) {
      const toolName = call?.function?.name;
      if (!toolName) continue;
      if (toolName.startsWith('delete_')) {
        console.warn('[AI Brain] Ignoring delete tool call in Phase 1:', toolName);
        continue;
      }

      const args = parseToolArgs(call.function?.arguments, toolName);
      const policy = getToolPolicy(toolName);
      const isReadTool = classifyReadOnly(toolName, policy);

      if (params.mode === 'propose_actions' && !isReadTool) {
        const actionType = classifyActionType(toolName);
        if (!actionType) {
          console.warn('[AI Brain] Unable to classify proposed action for tool:', toolName);
          continue;
        }
        proposedActions.push({
          type: actionType,
          entity: toolName.replace(/^(create_|update_|mark_|schedule_)/, ''),
          payload: args,
          reason: 'Proposed by AI Brain in propose_actions mode',
          confidence: 0.8,
        });
        continue;
      }

      if (!isReadTool && params.mode === 'read_only') {
        console.warn('[AI Brain] Blocking non-read tool execution in read_only mode:', toolName);
        continue;
      }

      const tenantRecord = {
        id: tenant.uuid,
        tenant_id: tenant.slug,
      };
      const result = await (executeBraidTool as any)(toolName, args, tenantRecord, params.userId);
      insights.push(summarizeToolResult(result, toolName));
    }

    const output: RunTaskResult = {
      summary,
      insights,
      proposed_actions: params.mode === 'propose_actions' ? proposedActions : [],
      requires_confirmation: proposedActions.length > 0,
    };

    logBrainRun({
      runId,
      timestamp: new Date().toISOString(),
      tenantId: tenant.uuid,
      userId: params.userId,
      taskType: params.taskType,
      mode: params.mode,
      durationMs: Date.now() - start,
      success: true,
    });

    return output;
  } catch (error: any) {
    logBrainRun({
      runId,
      timestamp: new Date().toISOString(),
      tenantId: params.tenantId,
      userId: params.userId,
      taskType: params.taskType,
      mode: params.mode,
      durationMs: Date.now() - start,
      success: false,
      error: error?.message,
    });
    throw error;
  }
}

async function resolveAllowedTools(mode: BrainMode): Promise<Set<string>> {
  const registry = await getToolRegistrySnapshot();
  const allowed = new Set<string>();

  for (const [toolName, config] of Object.entries(registry)) {
    if (toolName.startsWith('delete_')) {
      continue;
    }

    if (mode === 'read_only') {
      if (classifyReadOnly(toolName, config.policy)) {
        allowed.add(toolName);
      }
      continue;
    }

    allowed.add(toolName);
  }

  return allowed;
}

async function getToolRegistrySnapshot(): Promise<ToolRegistry> {
  if (!cachedRegistry) {
    const module = await import('./braidIntegration-v2.js');
    cachedRegistry = (module as any).TOOL_REGISTRY || {};
  }
  return cachedRegistry;
}

function filterToolSchemas(schemas: ToolSchema[], allowedNames: Set<string>): ToolSchema[] {
  if (!allowedNames.size) {
    return [];
  }
  return schemas.filter((schema) => {
    const name = schema?.function?.name;
    return !!name && allowedNames.has(name);
  });
}

function getToolPolicy(toolName: string): string | undefined {
  if (!cachedRegistry) {
    return undefined;
  }
  return cachedRegistry[toolName]?.policy;
}

let cachedRegistry: ToolRegistry | null = null;

// Preload registry cache asynchronously (best-effort)
void (async () => {
  try {
    cachedRegistry = await getToolRegistrySnapshot();
  } catch (error) {
    console.warn('[AI Brain] Failed to preload tool registry:', error);
  }
})();
