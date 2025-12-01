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

const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';

const localIntentSet = new Set<IntentClassification['intent']>(['list_records', 'activities', 'tasks']);
const brainIntentSet = new Set<IntentClassification['intent']>(['summaries', 'forecast']);

const defaultBrainCaller = async (payload: BrainRequestPayload) => {
  const response = await fetch(`${BACKEND_URL}/api/ai/brain-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
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

  const response = await callChat({
    messages: prompt.messages,
    temperature: 0.2
  });
  return { type: 'ai_chat', response };
}
