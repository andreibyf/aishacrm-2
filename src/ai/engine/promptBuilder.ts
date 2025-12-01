import type { IntentClassification } from '@/ai/nlu/intentClassifier';

type HistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export interface PromptContext {
  tenantId?: string;
  tenantName?: string;
  currentPath?: string;
  timezone?: string;
  userName?: string;
}

export interface PromptPayload {
  mode: 'read_only' | 'propose_actions';
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  summary: string;
}

interface PromptBuilderOptions {
  text: string;
  classification: IntentClassification;
  history?: HistoryMessage[];
  context?: PromptContext;
}

const SYSTEM_MESSAGE = `You are AiSHA, the executive assistant for AiSHA CRM. Operate in read_only or propose_actions modes only.
Do not perform destructive actions, updates, deletes, or autonomous workflows. Provide concise, auditable responses.`;

const formatFilters = (filters: IntentClassification['filters']) => {
  const parts: string[] = [];
  if (filters.timeframe) parts.push(`timeframe=${filters.timeframe}`);
  if (filters.owner) parts.push(`owner=${filters.owner}`);
  if (filters.status) parts.push(`status=${filters.status}`);
  return parts.length ? parts.join(', ') : 'none';
};

const buildContextBlock = (context?: PromptContext) => {
  if (!context) return 'n/a';
  const parts: string[] = [];
  if (context.tenantName) parts.push(`tenant=${context.tenantName}`);
  if (context.currentPath) parts.push(`route=${context.currentPath}`);
  if (context.timezone) parts.push(`timezone=${context.timezone}`);
  if (context.userName) parts.push(`user=${context.userName}`);
  if (context.tenantId) parts.push(`tenant_id=${context.tenantId}`);
  return parts.length ? parts.join('; ') : 'n/a';
};

export function buildPrompt({ text, classification, history = [], context }: PromptBuilderOptions): PromptPayload {
  const trimmedHistory = history
    .filter((msg) => Boolean(msg.content))
    .slice(-8)
    .map((msg) => ({ role: msg.role, content: msg.content.trim() }));

  const summaryLines = [
    `User intent: ${classification.intent}`,
    `Target entity: ${classification.entity}`,
    `Filters: ${formatFilters(classification.filters)}`,
    `Context: ${buildContextBlock(context)}`,
    `Confidence: ${classification.confidence}`
  ];

  const summary = summaryLines.join('\n');
  const mode: PromptPayload['mode'] = classification.intent === 'summaries' || classification.intent === 'forecast' ? 'propose_actions' : 'read_only';

  const messages: PromptPayload['messages'] = [
    { role: 'system', content: SYSTEM_MESSAGE },
    ...trimmedHistory,
    {
      role: 'user',
      content: `${summary}\n\nUser request: ${text}`
    }
  ];

  return { mode, messages, summary };
}
