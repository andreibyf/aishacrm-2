import { processChatCommand as callChatApi } from '@/api/functions';
import type { IntentClassification } from '@/ai/nlu/intentClassifier';
import type { PromptPayload, PromptContext } from './promptBuilder';

export interface CommandRouterAdapters {
  callChatApi?: typeof callChatApi;
  callBrainTest?: (payload: BrainRequestPayload) => Promise<{ status: number; data: unknown }>;
}

export interface BrainRequestPayload {
  taskType: string;
  mode: 'read_only' | 'propose_actions';
  context: Record<string, unknown>;
}

export interface LocalActionDescriptor {
  entity: IntentClassification['entity'];
  intent: IntentClassification['intent'];
  filters: IntentClassification['filters'];
  description: string;
}

export type CommandRouterResult =
  | { type: 'local_action'; action: LocalActionDescriptor }
  | { type: 'ai_chat'; response: Awaited<ReturnType<typeof callChatApi>> }
  | { type: 'ai_brain'; response: { status: number; data: unknown } };

interface RouteCommandOptions {
  text: string;
  classification: IntentClassification;
  prompt: PromptPayload;
  context?: PromptContext;
  adapters?: CommandRouterAdapters;
}

const localIntentSet = new Set<IntentClassification['intent']>([]); // Disabled to force Braid tool usage for all data queries
// Note: brainIntentSet disabled - brain-test requires internal API key not available to frontend
// All user requests now route through /api/ai/chat which has proper tenant isolation
const brainIntentSet = new Set<IntentClassification['intent']>([]); // Was: ['summaries', 'forecast']

// Default brain caller - currently disabled but kept for future internal tooling
const defaultBrainCaller = async (payload: BrainRequestPayload) => {
  // brain-test endpoint requires X-Internal-AI-Key header (server-side only)
  // For user-facing requests, use callChatApi instead which routes to /api/ai/chat
  console.warn('[commandRouter] brain-test endpoint requires internal API key - use chat endpoint instead');
  return { status: 401, data: { status: 'error', message: 'Brain endpoint requires internal API key' } };
};

const buildLocalActionDescription = (classification: IntentClassification) => {
  const parts = [`Focus: ${classification.entity}`];
  if (classification.filters.timeframe) parts.push(`when=${classification.filters.timeframe}`);
  if (classification.filters.owner) parts.push(`owner=${classification.filters.owner}`);
  if (classification.filters.status) parts.push(`status=${classification.filters.status}`);
  return parts.join(', ');
};

export async function routeCommand({
  text,
  classification,
  prompt,
  context,
  adapters
}: RouteCommandOptions): Promise<CommandRouterResult> {
  const callChat = adapters?.callChatApi ?? callChatApi;
  const callBrain = adapters?.callBrainTest ?? defaultBrainCaller;

  const shouldUseLocalAction = localIntentSet.has(classification.intent) && classification.confidence >= 0.55;
  if (shouldUseLocalAction) {
    return {
      type: 'local_action',
      action: {
        entity: classification.entity,
        intent: classification.intent,
        filters: classification.filters,
        description: buildLocalActionDescription(classification)
      }
    };
  }

  const shouldUseBrain = brainIntentSet.has(classification.intent) || text.toLowerCase().includes('brain');
  if (shouldUseBrain) {
    const response = await callBrain({
      taskType: classification.intent,
      mode: prompt.mode,
      context: {
        ...context,
        entity: classification.entity,
        filters: classification.filters,
        summary: prompt.summary,
        rawText: text
      }
    });
    return { type: 'ai_brain', response };
  }

  // Pass tenantId from context to API call for proper tenant isolation
  // Include entityContext for follow-up question resolution
  const response = await callChat({
    messages: prompt.messages,
    temperature: 0.2,
    tenantId: context?.tenantId,
    entityContext: prompt.entityContext // Session context for follow-up questions
  });
  return { type: 'ai_chat', response };
}
