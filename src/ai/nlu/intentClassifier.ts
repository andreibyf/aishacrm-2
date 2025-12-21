export type IntentLabel =
  | 'list_records'
  | 'summaries'
  | 'forecast'
  | 'activities'
  | 'tasks'
  | 'generic_question';

export type EntityLabel =
  | 'leads'
  | 'accounts'
  | 'opportunities'
  | 'activities'
  | 'tasks'
  | 'pipeline'
  | 'dashboard'
  | 'general';

export interface IntentFilters {
  timeframe?: 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'overdue';
  owner?: 'me' | 'team';
  status?: 'open' | 'won' | 'lost';
}

export interface IntentClassification {
  rawText: string;
  normalized: string;
  intent: IntentLabel;
  entity: EntityLabel;
  filters: IntentFilters;
  confidence: number;
  matchedKeywords: string[];
}

const ENTITY_KEYWORDS: Record<EntityLabel, string[]> = {
  leads: ['lead', 'pipeline', 'prospect'],
  accounts: ['account', 'customer', 'client', 'company'],
  opportunities: ['opportunity', 'deal'],
  activities: ['activity', 'activities', 'call', 'meeting', 'note'],
  tasks: ['task', 'todo', 'follow-up'],
  pipeline: ['pipeline', 'forecast'],
  dashboard: ['dashboard', 'overview'],
  general: []
};

const INTENT_KEYWORDS: Record<IntentLabel, string[]> = {
  list_records: ['show', 'list', 'view', 'display', 'see', 'open'],
  summaries: ['summary', 'summaries', 'summarize', 'recap', 'brief'],
  forecast: ['forecast', 'projection', 'predict', 'pipeline'],
  activities: ['activity', 'activities', 'calls', 'meetings', 'notes'],
  tasks: ['task', 'tasks', 'todo', 'follow-up', 'due'],
  generic_question: []
};

const TIMEFRAME_KEYWORDS: Record<NonNullable<IntentFilters['timeframe']>, string[]> = {
  today: ['today', 'tonight', 'this morning', 'this afternoon'],
  this_week: ['this week', 'current week', 'next few days'],
  this_month: ['this month', 'current month'],
  this_quarter: ['this quarter', 'current quarter'],
  overdue: ['overdue', 'late', 'behind']
};

const OWNER_KEYWORDS: Record<NonNullable<IntentFilters['owner']>, string[]> = {
  team: ['team', 'everyone', 'all users'],
  me: ['my', 'for me', 'assigned to me']
};

const STATUS_KEYWORDS: Record<NonNullable<IntentFilters['status']>, string[]> = {
  open: ['open', 'active', 'in progress'],
  won: ['won', 'closed won', 'success'],
  lost: ['lost', 'closed lost']
};

const stripPunctuation = (value: string) => value.replace(/[!?.,]/g, ' ').replace(/\s+/g, ' ').trim();

const collectMatches = (normalized: string, keywordMap: Record<string, string[] | undefined>) => {
  const matches: string[] = [];
  Object.entries(keywordMap).forEach(([label, keywords]) => {
    if (!keywords) return;
    keywords.forEach((keyword) => {
      if (normalized.includes(keyword)) {
        matches.push(keyword);
      }
    });
  });
  return matches;
};

const detectEntity = (normalized: string): { entity: EntityLabel; matched: string[] } => {
  let bestEntity: EntityLabel = 'general';
  let bestScore = 0;
  let bestMatches: string[] = [];

  Object.entries(ENTITY_KEYWORDS).forEach(([entity, keywords]) => {
    const matches = keywords.filter((keyword) => normalized.includes(keyword));
    if (matches.length > bestScore) {
      bestEntity = entity as EntityLabel;
      bestScore = matches.length;
      bestMatches = matches;
    }
  });

  return { entity: bestEntity, matched: bestMatches };
};

const detectIntent = (normalized: string): { intent: IntentLabel; matched: string[] } => {
  let bestIntent: IntentLabel = 'generic_question';
  let bestScore = 0;
  let bestMatches: string[] = [];

  Object.entries(INTENT_KEYWORDS).forEach(([intent, keywords]) => {
    const matches = keywords.filter((keyword) => normalized.includes(keyword));
    if (matches.length > bestScore) {
      bestIntent = intent as IntentLabel;
      bestScore = matches.length;
      bestMatches = matches;
    }
  });

  return { intent: bestIntent, matched: bestMatches };
};

const detectFilter = <T extends string>(normalized: string, keywordRecord: Record<T, string[]>) => {
  for (const [label, keywords] of Object.entries(keywordRecord) as [T, string[]][]) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return label;
    }
  }
  return undefined;
};

export function classifyIntent(raw: string): IntentClassification {
  const text = raw || '';
  const normalized = stripPunctuation(text.toLowerCase());
  const { entity, matched: entityMatches } = detectEntity(normalized);
  const { intent, matched: intentMatches } = detectIntent(normalized);

  const filters: IntentFilters = {};
  filters.timeframe = detectFilter(normalized, TIMEFRAME_KEYWORDS);
  filters.owner = detectFilter(normalized, OWNER_KEYWORDS);
  filters.status = detectFilter(normalized, STATUS_KEYWORDS);

  let confidence = 0.35; // baseline confidence for parsed text
  if (intent !== 'generic_question') confidence += 0.25;
  if (entity !== 'general') confidence += 0.25;
  if (filters.timeframe || filters.owner || filters.status) confidence += 0.15;
  if (text.trim().length < 5) confidence = 0.2;
  confidence = Math.min(0.95, Number(confidence.toFixed(2)));

  return {
    rawText: text,
    normalized,
    intent,
    entity,
    filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value))) as IntentFilters,
    confidence,
    matchedKeywords: [...intentMatches, ...entityMatches]
  };
}
