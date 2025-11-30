import { randomUUID } from 'node:crypto';
import { getOpenAIClient } from './aiProvider.js';
import { BRAID_SYSTEM_PROMPT, executeBraidTool, generateToolSchemas, summarizeToolResult, } from './braidIntegration-v2.js';
import { resolveCanonicalTenant, isUuid as isUuidHelper } from './tenantCanonicalResolver.js';
const READ_ONLY_NAME_REGEX = /^(search_|list_|get_|fetch_|lookup_|debug_)/i;
function assertUuid(value, label) {
    if (!value || !isUuid(value)) {
        throw new BrainError(`${label} must be a valid UUID`, 400);
    }
}
function isUuid(value) {
    if (typeof isUuidHelper === 'function') {
        return isUuidHelper(value);
    }
    const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return UUID_REGEX.test(value ?? '');
}
function buildSystemPrompt(params, tenant) {
    const modeDescription = params.mode === 'read_only'
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
function logBrainRun(entry) {
    console.log('[AI Brain]', JSON.stringify(entry));
}
function classifyReadOnly(toolName, policy) {
    if (policy && policy.toUpperCase() === 'READ_ONLY') {
        return true;
    }
    return READ_ONLY_NAME_REGEX.test(toolName);
}
function classifyActionType(toolName) {
    if (toolName.startsWith('create_'))
        return 'create';
    if (toolName.startsWith('update_'))
        return 'update';
    if (toolName.startsWith('mark_') || toolName.startsWith('schedule_'))
        return 'update';
    return null;
}
function sanitizeTextContent(content) {
    if (!content) {
        return '';
    }
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((block) => {
            if (typeof block === 'string')
                return block;
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
function normalizeContext(context) {
    if (!context || typeof context !== 'object') {
        return {};
    }
    return context;
}
function parseToolArgs(rawArgs, toolName) {
    if (!rawArgs)
        return {};
    try {
        return JSON.parse(rawArgs);
    }
    catch (error) {
        console.warn(`[AI Brain] Failed to parse arguments for ${toolName}:`, error);
        return {};
    }
}
class BrainError extends Error {
    statusCode;
    constructor(message, statusCode) {
        super(message);
        this.name = 'BrainError';
        this.statusCode = statusCode;
    }
}
export async function runTask(params) {
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
        const tenant = (await resolveCanonicalTenant(params.tenantId));
        if (!tenant?.found || !tenant.uuid) {
            throw new BrainError(`Unable to resolve tenant ${params.tenantId}`, 404);
        }
        if (!tenant.slug) {
            throw new BrainError(`Tenant ${params.tenantId} is missing canonical slug`, 500);
        }
        const allowedToolNames = await resolveAllowedTools(params.mode);
        const toolSchemas = (await generateToolSchemas(allowedToolNames));
        const filteredSchemas = filterToolSchemas(toolSchemas, allowedToolNames);
        const systemPrompt = buildSystemPrompt({ ...params, context }, tenant);
        const openai = getOpenAIClient();
        const completionPayload = {
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
            completionPayload.tools = filteredSchemas;
            completionPayload.tool_choice = 'auto';
        }
        const completion = await openai.chat.completions.create(completionPayload);
        const choice = completion?.choices?.[0];
        const assistantMessage = choice?.message || {};
        const summary = sanitizeTextContent(assistantMessage.content) || 'No summary provided.';
        const insights = [];
        const proposedActions = [];
        const toolCalls = assistantMessage.tool_calls || [];
        for (const call of toolCalls) {
            const toolName = call?.function?.name;
            if (!toolName)
                continue;
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
            const result = await executeBraidTool(toolName, args, tenantRecord, params.userId);
            insights.push(summarizeToolResult(result, toolName));
        }
        const output = {
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
    }
    catch (error) {
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
async function resolveAllowedTools(mode) {
    const registry = await getToolRegistrySnapshot();
    const allowed = new Set();
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
async function getToolRegistrySnapshot() {
    if (!cachedRegistry) {
        const module = await import('./braidIntegration-v2.js');
        cachedRegistry = module.TOOL_REGISTRY || {};
    }
    return cachedRegistry;
}
function filterToolSchemas(schemas, allowedNames) {
    if (!allowedNames.size) {
        return [];
    }
    return schemas.filter((schema) => {
        const name = schema?.function?.name;
        return !!name && allowedNames.has(name);
    });
}
function getToolPolicy(toolName) {
    if (!cachedRegistry) {
        return undefined;
    }
    return cachedRegistry[toolName]?.policy;
}
let cachedRegistry = null;
// Preload registry cache asynchronously (best-effort)
void (async () => {
    try {
        cachedRegistry = await getToolRegistrySnapshot();
    }
    catch (error) {
        console.warn('[AI Brain] Failed to preload tool registry:', error);
    }
})();
