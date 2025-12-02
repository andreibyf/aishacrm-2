import type { IntentClassification } from '@/ai/nlu/intentClassifier';
import { classifyIntent as legacyClassifyIntent } from '@/ai/nlu/intentClassifier';
import type { PromptContext } from './promptBuilder';
import { buildPrompt } from './promptBuilder';
import { routeCommand } from './commandRouter';
import type { LocalActionDescriptor } from './commandRouter';
import type { ParsedIntent, ConversationalIntent, ConversationalEntity } from '@/lib/intentParser';
import { enforceParserSafety, legacyIntentFromParser, parseIntent } from '@/lib/intentParser';

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

type ParserAugmentedClassification = IntentClassification & {
  parserResult: ParsedIntent;
  effectiveParser: ParsedIntent;
};

const PARSER_TO_LEGACY_INTENT: Record<ConversationalIntent, IntentClassification['intent']> = {
  query: 'list_records',
  create: 'tasks',
  update: 'tasks',
  navigate: 'activities',
  analyze: 'summaries',
  ambiguous: 'generic_question'
};

const PARSER_TO_LEGACY_ENTITY: Record<ConversationalEntity, IntentClassification['entity']> = {
  leads: 'leads',
  accounts: 'accounts',
  contacts: 'leads',
  opportunities: 'opportunities',
  activities: 'activities',
  dashboard: 'dashboard',
  general: 'general'
};

const LEGACY_TO_PARSER_INTENT: Record<IntentClassification['intent'], ConversationalIntent> = {
  list_records: 'query',
  summaries: 'analyze',
  forecast: 'analyze',
  activities: 'navigate',
  tasks: 'update',
  generic_question: 'ambiguous'
};

const LEGACY_TO_PARSER_ENTITY: Record<IntentClassification['entity'], ConversationalEntity> = {
  leads: 'leads',
  accounts: 'accounts',
  opportunities: 'opportunities',
  activities: 'activities',
  tasks: 'activities',
  pipeline: 'opportunities',
  dashboard: 'dashboard',
  general: 'general'
};

const convertIntentToLegacy = (intent: ConversationalIntent) => PARSER_TO_LEGACY_INTENT[intent] ?? 'generic_question';
const convertEntityToLegacy = (entity: ConversationalEntity) => PARSER_TO_LEGACY_ENTITY[entity] ?? 'general';

const buildParserFromLegacy = (legacy: IntentClassification): ParsedIntent => ({
  rawText: legacy.rawText,
  normalized: legacy.normalized,
  intent: LEGACY_TO_PARSER_INTENT[legacy.intent] ?? 'ambiguous',
  entity: LEGACY_TO_PARSER_ENTITY[legacy.entity] ?? 'general',
  filters: {},
  confidence: legacy.confidence,
  isAmbiguous: legacy.intent === 'generic_question' || legacy.entity === 'general',
  isMultiStep: false,
  isPotentiallyDestructive: false,
  detectedPhrases: legacy.matchedKeywords ?? []
});

const mapParsedToLegacyClassification = (effective: ParsedIntent, original: ParsedIntent): ParserAugmentedClassification => {
  const filters = legacyIntentFromParser(original);
  const classification: ParserAugmentedClassification = {
    rawText: original.rawText,
    normalized: original.normalized,
    intent: convertIntentToLegacy(effective.intent),
    entity: convertEntityToLegacy(effective.entity),
    filters,
    confidence: Number(Math.max(0.1, Math.min(0.95, effective.confidence)).toFixed(2)),
    matchedKeywords: original.detectedPhrases,
    parserResult: original,
    effectiveParser: effective
  };
  return classification;
};

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
  let parserResult: ParsedIntent | null = null;

  try {
    parserResult = parseIntent(text);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('intentParser failed, falling back to legacy classifier', error);
  }

  let classification: ParserAugmentedClassification;

  if (!parserResult) {
    const legacy = legacyClassifyIntent(text);
    const fallbackParser = buildParserFromLegacy(legacy);
    classification = {
      ...legacy,
      parserResult: fallbackParser,
      effectiveParser: fallbackParser
    };
    parserResult = fallbackParser;
  } else {
    const effectiveParser = enforceParserSafety(parserResult);
    classification = mapParsedToLegacyClassification(effectiveParser, parserResult);
  }

  let prompt = buildPrompt({ text, classification, history: sanitizedHistory, context });
  if (parserResult.isPotentiallyDestructive && prompt.mode !== 'propose_actions') {
    prompt = { ...prompt, mode: 'propose_actions' };
  }

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
    const assistantMessage = normalizeChatResponse('ai_brain', routeResult.response);
    if (parserResult.isPotentiallyDestructive) {
      assistantMessage.mode = 'propose_actions';
    }
    return {
      route: 'ai_brain',
      assistantMessage,
      classification
    };
  }

  const assistantMessage = normalizeChatResponse('ai_chat', routeResult.response);
  if (parserResult.isPotentiallyDestructive) {
    assistantMessage.mode = 'propose_actions';
  }

  return {
    route: 'ai_chat',
    assistantMessage,
    classification
  };
}
