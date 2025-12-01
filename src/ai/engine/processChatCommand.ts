import type { IntentClassification } from '@/ai/nlu/intentClassifier';
import { classifyIntent } from '@/ai/nlu/intentClassifier';
import type { PromptContext } from './promptBuilder';
import { buildPrompt } from './promptBuilder';
import { routeCommand } from './commandRouter';
import type { LocalActionDescriptor } from './commandRouter';

interface ProcessChatCommandOptions {
  text: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  context?: PromptContext;
}

interface AssistantMessagePayload {
  content: string;
  actions?: Array<{ label?: string; type?: string }>;
  data?: unknown;
  data_summary?: string;
  mode?: string;
}

interface ProcessChatCommandResult {
  route: 'local_action' | 'ai_chat' | 'ai_brain';
  assistantMessage: AssistantMessagePayload;
  classification: IntentClassification;
  localAction?: LocalActionDescriptor;
}

const ensureHistoryFormat = (history: ProcessChatCommandOptions['history']) => {
  if (!history) return [];
  return history
    .filter((msg) => (msg.role === 'user' || msg.role === 'assistant') && Boolean(msg.content))
    .map((msg) => ({ role: msg.role, content: msg.content.trim() }));
};

const buildLocalAssistantMessage = (action: LocalActionDescriptor): AssistantMessagePayload => {
  const label = `Open ${action.entity}`;
  const summaryParts = [`Intent: ${action.intent}`];
  if (action.filters.timeframe) summaryParts.push(`timeframe=${action.filters.timeframe}`);
  if (action.filters.owner) summaryParts.push(`owner=${action.filters.owner}`);
  if (action.filters.status) summaryParts.push(`status=${action.filters.status}`);

  return {
    content: `I'll help with that. ${action.description}. Tap the highlighted section in the UI to continue.`,
    actions: [{ label, type: 'ui_navigation' }],
    data: { localAction: action },
    data_summary: summaryParts.join(', '),
    mode: 'ui_helper'
  };
};

const normalizeChatResponse = (route: 'ai_chat' | 'ai_brain', response: any): AssistantMessagePayload => {
  if (!response) {
    return {
      content: 'AiSHA could not complete that request. Please try again.',
      mode: route === 'ai_brain' ? 'propose_actions' : 'read_only'
    };
  }

  if (route === 'ai_chat') {
    const payload = response?.data || {};
    if (response.status !== 200 || payload.status !== 'success') {
      const message = payload?.message || `AiSHA returned status ${response.status || 'unknown'}`;
      throw new Error(message);
    }
    return {
      content: payload.response || payload.data?.response || 'I have no further updates yet.',
      actions: Array.isArray(payload.actions) ? payload.actions : undefined,
      data: payload.data,
      data_summary: payload.data_summary,
      mode: payload.mode || 'read_only'
    };
  }

  const brainPayload = response?.data || {};
  if (response.status !== 200) {
    throw new Error(brainPayload?.message || `Brain task failed with status ${response.status}`);
  }

  return {
    content: brainPayload.summary || 'Here is what I found.',
    actions: Array.isArray(brainPayload.proposed_actions) ? brainPayload.proposed_actions : undefined,
    data: brainPayload,
    data_summary: brainPayload.summary,
    mode: 'propose_actions'
  };
};

export async function processChatCommand({ text, history = [], context }: ProcessChatCommandOptions): Promise<ProcessChatCommandResult> {
  const sanitizedHistory = ensureHistoryFormat(history);
  const classification = classifyIntent(text);
  const prompt = buildPrompt({ text, classification, history: sanitizedHistory, context });

  const routeResult = await routeCommand({ text, classification, prompt, context });

  if (routeResult.type === 'local_action') {
    return {
      route: 'local_action',
      assistantMessage: buildLocalAssistantMessage(routeResult.action),
      classification,
      localAction: routeResult.action
    };
  }

  if (routeResult.type === 'ai_brain') {
    return {
      route: 'ai_brain',
      assistantMessage: normalizeChatResponse('ai_brain', routeResult.response),
      classification
    };
  }

  return {
    route: 'ai_chat',
    assistantMessage: normalizeChatResponse('ai_chat', routeResult.response),
    classification
  };
}
