export interface SuggestionContext {
  tenantId?: string;
  routeName?: string;
  entity?: 'leads' | 'accounts' | 'contacts' | 'opportunities' | 'activities' | 'general' | 'dashboard';
  origin?: 'text' | 'voice';
}

export interface ParsedCommandSummary {
  intent: 'query' | 'create' | 'update' | 'navigate' | 'analyze' | 'ambiguous';
  entity?: SuggestionContext['entity'];
  rawText: string;
  timestamp: string;
}

export interface Suggestion {
  id: string;
  label: string;
  command: string;
  confidence: number;
  source: 'context' | 'history' | 'playbook';
}

export interface SuggestionHistoryEntry extends ParsedCommandSummary {
  origin: 'text' | 'voice';
}

const MAX_HISTORY = 20;
const STORAGE_KEY = 'aisha_suggestion_history';
const MAX_SUGGESTIONS = 6;
const HISTORY_WEIGHT = 0.85;
const CONTEXT_WEIGHT = 0.7;
const _PLAYBOOK_WEIGHT = 0.55;

const PLAYBOOK_SUGGESTIONS: Record<string, Array<{ label: string; command: string }>> = {
  leads: [
    { label: 'Show idle leads', command: 'Show me leads with no activity this week' },
    { label: 'Prioritize hot leads', command: 'List my hottest leads and recent touches' },
    { label: 'Lead conversion', command: 'Summarize lead conversion for this month' }
  ],
  accounts: [
    { label: 'Accounts by revenue', command: 'Show accounts over $50k ARR' },
    { label: 'Dormant accounts', command: 'Which accounts went quiet this quarter?' }
  ],
  contacts: [
    { label: 'New contacts', command: 'List contacts added this month' },
    { label: 'Key stakeholders', command: 'Show contacts tagged as decision makers' }
  ],
  opportunities: [
    { label: 'Pipeline summary', command: 'Summarize my pipeline health' },
    { label: 'Forecast detail', command: 'Break down opportunities closing this quarter' }
  ],
  activities: [
    { label: 'Today’s tasks', command: 'Show my tasks due today' },
    { label: 'Overdue follow-ups', command: 'List overdue follow-up activities' }
  ],
  dashboard: [
    { label: 'Dashboard overview', command: 'Give me a dashboard summary' }
  ],
  general: [
    { label: 'Pipeline status', command: 'Summarize my pipeline and next actions' },
    { label: 'Priority tasks', command: 'Show my most important tasks for today' }
  ]
};

const fallbackSuggestions: Suggestion[] = [
  {
    id: 'playbook:general:pipeline-summary',
    label: 'Summarize my pipeline',
    command: 'Summarize my pipeline and highlight risks',
    confidence: 0.5,
    source: 'playbook'
  },
  {
    id: 'playbook:general:tasks-today',
    label: "Show today's tasks",
    command: 'Show my tasks due today',
    confidence: 0.48,
    source: 'playbook'
  }
];

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
let memoryHistory: SuggestionHistoryEntry[] | null = null;

const loadHistoryFromStorage = (): SuggestionHistoryEntry[] => {
  if (!isBrowser) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry) => typeof entry?.rawText === 'string');
    }
  } catch {
    return [];
  }
  return [];
};

const persistHistory = (history: SuggestionHistoryEntry[]) => {
  if (!isBrowser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore storage failures
  }
};

const ensureHistory = () => {
  if (!memoryHistory) {
    memoryHistory = loadHistoryFromStorage();
  }
  return memoryHistory;
};

export function addHistoryEntry(entry: SuggestionHistoryEntry): void {
  const history = ensureHistory();
  const deduped = history.filter((existing) => existing.rawText !== entry.rawText);
  const updated = [entry, ...deduped].slice(0, MAX_HISTORY);
  memoryHistory = updated;
  persistHistory(updated);
}

export function getRecentHistory(limit = 10): SuggestionHistoryEntry[] {
  const history = ensureHistory();
  return history.slice(0, limit);
}

const uniqueByCommand = (suggestions: Suggestion[]): Suggestion[] => {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.command.toLowerCase())) return false;
    seen.add(suggestion.command.toLowerCase());
    return true;
  });
};

const formatHistoryLabel = (entry: ParsedCommandSummary) => {
  if (entry.intent === 'query' && entry.entity) {
    return `Show ${entry.entity} (${new Date(entry.timestamp).toLocaleDateString()})`;
  }
  if (entry.intent === 'create' && entry.entity) {
    return `Create ${entry.entity.slice(0, -1)} record again`;
  }
  if (entry.intent === 'update') {
    return 'Repeat last update command';
  }
  if (entry.intent === 'analyze') {
    return 'Run that analysis again';
  }
  return entry.rawText.length > 60 ? `${entry.rawText.slice(0, 57)}...` : entry.rawText;
};

const buildHistorySuggestions = (context: SuggestionContext, history: ParsedCommandSummary[]): Suggestion[] => {
  if (!history?.length) return [];
  const baseEntity = context.entity && context.entity !== 'general' ? context.entity : undefined;

  const filtered = history.filter((entry) => {
    if (!entry.rawText) return false;
    if (baseEntity && entry.entity && entry.entity !== baseEntity) return false;
    return true;
  });

  return filtered.slice(0, 3).map((entry, index) => ({
    id: `history:${entry.timestamp}:${index}`,
    label: formatHistoryLabel(entry),
    command: entry.rawText,
    confidence: Number((HISTORY_WEIGHT - index * 0.1).toFixed(2)),
    source: 'history' as const
  }));
};

const buildContextSuggestions = (context: SuggestionContext): Suggestion[] => {
  if (!context?.entity) return [];
  const playbook = PLAYBOOK_SUGGESTIONS[context.entity] || PLAYBOOK_SUGGESTIONS.general;
  return playbook.slice(0, 3).map((item, index) => ({
    id: `context:${context.entity}:${index}`,
    label: item.label,
    command: item.command,
    confidence: Number((CONTEXT_WEIGHT - index * 0.05).toFixed(2)),
    source: 'context' as const
  }));
};

const buildPlaybookFallback = (): Suggestion[] => fallbackSuggestions;

export function getSuggestions({ context, history }: { context: SuggestionContext; history: ParsedCommandSummary[] }): Suggestion[] {
  const suggestions: Suggestion[] = [];
  suggestions.push(...buildHistorySuggestions(context, history));
  suggestions.push(...buildContextSuggestions(context));

  if (suggestions.length < 2) {
    suggestions.push(...buildPlaybookFallback());
  }

  return uniqueByCommand(suggestions).slice(0, MAX_SUGGESTIONS);
}

export function __resetSuggestionHistoryForTests() {
  memoryHistory = [];
  if (isBrowser) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
