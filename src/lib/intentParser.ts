import type { IntentFilters } from '@/ai/nlu/intentClassifier';

export type ConversationalIntent = 'query' | 'create' | 'update' | 'navigate' | 'analyze' | 'ambiguous';

export type ConversationalEntity =
  | 'leads'
  | 'accounts'
  | 'contacts'
  | 'opportunities'
  | 'activities'
  | 'dashboard'
  | 'general';

export type DateRangeLabel =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_quarter'
  | 'last_week'
  | 'last_month'
  | 'last_30_days';

export type NumericOperator = 'greater_than' | 'less_than';

export interface IntentNumericFilter {
  field: 'revenue' | 'amount';
  operator: NumericOperator;
  value: number;
  raw?: string;
}

export interface IntentDateRangeFilter {
  label: DateRangeLabel;
}

export interface IntentParserFilters {
  states?: string[];
  statuses?: string[];
  owner?: 'me' | 'team';
  assignee?: string;
  dateRange?: IntentDateRangeFilter;
  numeric?: IntentNumericFilter[];
}

export interface ParsedIntent {
  rawText: string;
  normalized: string;
  intent: ConversationalIntent;
  entity: ConversationalEntity;
  filters: IntentParserFilters;
  confidence: number;
  isAmbiguous: boolean;
  isMultiStep: boolean;
  isPotentiallyDestructive: boolean;
  detectedPhrases: string[];
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\w\s$.,%-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripPunctuationPreserveDelimiters = (value: string) => value.replace(/[!?]/g, ' ').replace(/\s+/g, ' ').trim();

const STATE_NAMES = [
  'alabama',
  'alaska',
  'arizona',
  'arkansas',
  'california',
  'colorado',
  'connecticut',
  'delaware',
  'florida',
  'georgia',
  'hawaii',
  'idaho',
  'illinois',
  'indiana',
  'iowa',
  'kansas',
  'kentucky',
  'louisiana',
  'maine',
  'maryland',
  'massachusetts',
  'michigan',
  'minnesota',
  'mississippi',
  'missouri',
  'montana',
  'nebraska',
  'nevada',
  'new hampshire',
  'new jersey',
  'new mexico',
  'new york',
  'north carolina',
  'north dakota',
  'ohio',
  'oklahoma',
  'oregon',
  'pennsylvania',
  'rhode island',
  'south carolina',
  'south dakota',
  'tennessee',
  'texas',
  'utah',
  'vermont',
  'virginia',
  'washington',
  'west virginia',
  'wisconsin',
  'wyoming'
];

const DESTRUCTIVE_KEYWORDS = ['delete', 'remove all', 'wipe', 'clear all', 'erase', 'drop', 'purge'];

const MULTI_STEP_PATTERNS = [/\bthen\b/, /\bafter that\b/, /\bnext\b/, /\bfollowed by\b/, /\bfirst\b.*\bthen\b/];

const INTENT_KEYWORDS: Record<Exclude<ConversationalIntent, 'ambiguous'>, string[]> = {
  query: ['show', 'list', 'find', 'display', 'view', 'see', 'pull', 'how many', 'count', 'total', 'do i have', 'what are', 'give me', 'get'],
  create: ['create', 'add', 'log', 'new', 'open a new'],
  update: ['update', 'change', 'set', 'move', 'adjust', 'mark'],
  navigate: ['go to', 'open', 'navigate', 'jump to', 'switch to'],
  analyze: ['summarize', 'summary', 'analyze', 'analysis', 'insights', 'report', 'recap']
};

const INTENT_PRIORITY: Record<ConversationalIntent, number> = {
  query: 0,
  create: 0.3,
  update: 0.3,
  navigate: 0.5,
  analyze: 0.3,
  ambiguous: 0
};

const ENTITY_KEYWORDS: Record<Exclude<ConversationalEntity, 'general'>, string[]> = {
  leads: ['lead', 'leads', 'prospect'],
  accounts: ['account', 'accounts', 'customer', 'customers', 'client', 'clients', 'company', 'companies'],
  contacts: ['contact', 'contacts', 'person', 'people'],
  opportunities: ['opportunity', 'opportunities', 'deal', 'deals', 'pipeline'],
  activities: ['activity', 'activities', 'call', 'calls', 'meeting', 'meetings', 'note', 'notes', 'task', 'tasks'],
  dashboard: ['dashboard', 'home', 'overview']
};

const STATUS_KEYWORDS: Record<string, string[]> = {
  open: ['open', 'active', 'in progress'],
  won: ['won', 'closed won'],
  lost: ['lost', 'closed lost'],
  stalled: ['stalled', 'stuck', 'slowed'],
  pending: ['pending', 'awaiting', 'on hold'],
  overdue: ['overdue', 'late', 'behind']
};

const DATE_RANGE_KEYWORDS: Record<DateRangeLabel, string[]> = {
  today: ['today'],
  this_week: ['this week', 'current week'],
  this_month: ['this month', 'current month'],
  this_quarter: ['this quarter', 'current quarter'],
  last_week: ['last week', 'previous week'],
  last_month: ['last month', 'previous month'],
  last_30_days: ['last 30 days', 'past 30 days']
};

const OWNERSHIP_PATTERNS: Record<'me' | 'team', RegExp> = {
  me: /\bmy\b|\bfor me\b|\bassigned to me\b/,
  team: /\bteam\b|\beveryone\b|\ball users\b/
};

const ASSIGNEE_PATTERN = /assigned to ([a-z ]+)/i;

const NUMERIC_REGEX =
  /(over|above|greater than|more than|at least|under|below|less than|fewer than|at most)\s+\$?(\d[\d,]*(?:\.\d+)?)\s*(million|billion|thousand|k|m|b)?/gi;

const NUMERIC_FIELD_HINTS: Record<'revenue' | 'amount', string[]> = {
  revenue: ['revenue', 'arr', 'mrr', 'sales'],
  amount: ['amount', 'value', 'deal', 'deals', 'opportunity', 'pipeline']
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const unique = <T>(values: T[] = []) => Array.from(new Set(values));

const keywordMatches = (text: string, keyword: string) => {
  if (keyword.includes(' ')) return text.includes(keyword);
  return new RegExp(`\\b${keyword}\\b`).test(text);
};

const collectMatches = (text: string, keywords: string[]) =>
  keywords.filter((keyword) => keywordMatches(text, keyword)).map((keyword) => keyword.trim());

const detectIntent = (normalized: string): { intent: ConversationalIntent; matches: string[] } => {
  let best: ConversationalIntent = 'ambiguous';
  let bestScore = 0;
  let matched: string[] = [];

  (Object.entries(INTENT_KEYWORDS) as [Exclude<ConversationalIntent, 'ambiguous'>, string[]][]).forEach(([intent, keywords]) => {
    const hits = collectMatches(normalized, keywords);
    if (!hits.length) return;
    const score = hits.length + (INTENT_PRIORITY[intent] ?? 0);
    if (score > bestScore) {
      best = intent;
      bestScore = score;
      matched = hits;
    }
  });

  return { intent: best, matches: matched };
};

const detectEntity = (normalized: string): { entity: ConversationalEntity; matches: string[] } => {
  let best: ConversationalEntity = 'general';
  let bestScore = 0;
  let matched: string[] = [];

  (Object.entries(ENTITY_KEYWORDS) as [Exclude<ConversationalEntity, 'general'>, string[]][]).forEach(([entity, keywords]) => {
    const hits = collectMatches(normalized, keywords);
    if (hits.length > bestScore) {
      best = entity;
      bestScore = hits.length;
      matched = hits;
    }
  });

  return { entity: best, matches: matched };
};

const containsWord = (normalized: string, word: string) => new RegExp(`\\b${word}\\b`).test(normalized);

const extractStates = (normalized: string) => {
  const found = STATE_NAMES.filter((state) => containsWord(normalized, state));
  return found.length ? found.map((state) => state.split(' ').map(capitalize).join(' ')) : undefined;
};

const extractStatuses = (normalized: string) => {
  const matches = Object.entries(STATUS_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))
    .map(([status]) => status);
  return matches.length ? unique(matches) : undefined;
};

const extractOwner = (normalized: string) => {
  if (OWNERSHIP_PATTERNS.me.test(normalized)) return 'me';
  if (OWNERSHIP_PATTERNS.team.test(normalized)) return 'team';
  return undefined;
};

const extractAssignee = (raw: string) => {
  const match = ASSIGNEE_PATTERN.exec(raw);
  if (!match) return undefined;
  return stripPunctuationPreserveDelimiters(match[1]).trim();
};

const extractDateRange = (normalized: string): IntentDateRangeFilter | undefined => {
  for (const [label, keywords] of Object.entries(DATE_RANGE_KEYWORDS) as [DateRangeLabel, string[]][]) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return { label };
    }
  }
  return undefined;
};

const parseNumericValue = (value: string, unit?: string) => {
  const parsed = Number(value.replace(/,/g, ''));
  if (Number.isNaN(parsed)) return undefined;
  const normalizedUnit = unit?.toLowerCase();
  const multiplierMap: Record<string, number> = {
    k: 1_000,
    thousand: 1_000,
    m: 1_000_000,
    million: 1_000_000,
    b: 1_000_000_000,
    billion: 1_000_000_000
  };
  const multiplier = normalizedUnit ? multiplierMap[normalizedUnit] ?? 1 : 1;
  return parsed * multiplier;
};

const extractNumericFilters = (raw: string): IntentNumericFilter[] | undefined => {
  const text = raw.toLowerCase();
  const matches: IntentNumericFilter[] = [];
  let match: RegExpExecArray | null;

  while ((match = NUMERIC_REGEX.exec(text))) {
    const comparator = match[1].toLowerCase();
    const numberValue = parseNumericValue(match[2], match[3]);
    if (typeof numberValue !== 'number') continue;

    const operator: NumericOperator = ['over', 'above', 'greater than', 'more than', 'at least'].some((cue) => comparator.includes(cue))
      ? 'greater_than'
      : 'less_than';

    const windowStart = Math.max(0, match.index - 30);
    const windowEnd = Math.min(text.length, match.index + match[0].length + 30);
    const windowText = text.slice(windowStart, windowEnd);

    let field: IntentNumericFilter['field'] = 'amount';
    for (const [candidate, hints] of Object.entries(NUMERIC_FIELD_HINTS) as [IntentNumericFilter['field'], string[]][]) {
      if (hints.some((hint) => windowText.includes(hint))) {
        field = candidate;
        break;
      }
    }

    matches.push({ field, operator, value: numberValue, raw: match[0].trim() });
  }

  return matches.length ? matches : undefined;
};

const detectDestructive = (normalized: string) => collectMatches(normalized, DESTRUCTIVE_KEYWORDS);

const detectMultiStep = (normalized: string) => MULTI_STEP_PATTERNS.some((pattern) => pattern.test(normalized));

const buildFilters = (raw: string, normalized: string): IntentParserFilters => {
  const filters: IntentParserFilters = {};
  const states = extractStates(normalized);
  if (states) filters.states = states;
  const statuses = extractStatuses(normalized);
  if (statuses) filters.statuses = statuses;
  const owner = extractOwner(normalized);
  if (owner) filters.owner = owner;
  const assignee = extractAssignee(raw);
  if (assignee) filters.assignee = assignee;
  const dateRange = extractDateRange(normalized);
  if (dateRange) filters.dateRange = dateRange;
  const numeric = extractNumericFilters(raw);
  if (numeric) filters.numeric = numeric;
  return filters;
};

const computeConfidence = (intent: ConversationalIntent, entity: ConversationalEntity, filters: IntentParserFilters, flags: { isAmbiguous: boolean; isPotentiallyDestructive: boolean; hasMultiStep: boolean }) => {
  let score = 0.3;
  if (intent !== 'ambiguous') score += 0.25;
  if (entity !== 'general') score += 0.2;
  if (filters.states?.length) score += 0.05;
  if (filters.statuses?.length) score += 0.05;
  if (filters.owner) score += 0.05;
  if (filters.dateRange) score += 0.05;
  if (filters.numeric?.length) score += 0.05;
  if (flags.hasMultiStep) score += 0.05;
  if (flags.isAmbiguous) score -= 0.15;
  if (flags.isPotentiallyDestructive) score -= 0.05;
  return Math.max(0.1, Math.min(0.95, Number(score.toFixed(2))));
};

const determineAmbiguity = (raw: string, normalized: string, intent: ConversationalIntent, entity: ConversationalEntity, detectedDestructive: string[]) => {
  if (!raw.trim()) return true;
  if (intent === 'ambiguous') return true;
  if (entity === 'general') return true;
  if (detectedDestructive.length) return true;
  if (/\bmaybe\b|\bperhaps\b|\bnot sure\b/.test(normalized)) return true;
  return false;
};

const cloneParsedIntent = (parsed: ParsedIntent): ParsedIntent => ({
  ...parsed,
  filters: {
    owner: parsed.filters.owner,
    assignee: parsed.filters.assignee,
    dateRange: parsed.filters.dateRange ? { ...parsed.filters.dateRange } : undefined,
    numeric: parsed.filters.numeric ? parsed.filters.numeric.map((item) => ({ ...item })) : undefined,
    states: parsed.filters.states ? [...parsed.filters.states] : undefined,
    statuses: parsed.filters.statuses ? [...parsed.filters.statuses] : undefined
  },
  detectedPhrases: [...parsed.detectedPhrases]
});

export const parseIntent = (rawInput: string): ParsedIntent => {
  const rawText = rawInput ?? '';
  const normalized = normalize(rawText);
  const detectedPhrases: string[] = [];

  const destructiveHits = detectDestructive(normalized);
  if (destructiveHits.length) detectedPhrases.push(...destructiveHits);

  const intentDetection = detectIntent(normalized);
  if (intentDetection.matches.length) detectedPhrases.push(...intentDetection.matches);

  const entityDetection = detectEntity(normalized);
  if (entityDetection.matches.length) detectedPhrases.push(...entityDetection.matches);

  const filters = buildFilters(rawText, normalized);
  if (filters.states) detectedPhrases.push(...filters.states.map((state) => state.toLowerCase()));
  if (filters.statuses) detectedPhrases.push(...filters.statuses);

  const isMultiStep = detectMultiStep(normalized);
  const isPotentiallyDestructive = destructiveHits.length > 0;

  let intent = isPotentiallyDestructive ? 'ambiguous' : intentDetection.intent;
  let entity = entityDetection.entity;

  const isAmbiguous = determineAmbiguity(rawText, normalized, intent, entity, destructiveHits);

  const confidence = computeConfidence(intent, entity, filters, {
    isAmbiguous,
    isPotentiallyDestructive,
    hasMultiStep: isMultiStep
  });

  return {
    rawText,
    normalized,
    intent,
    entity,
    filters,
    confidence,
    isAmbiguous,
    isMultiStep,
    isPotentiallyDestructive,
    detectedPhrases: unique(detectedPhrases)
  };
};

export const enforceParserSafety = (parsed: ParsedIntent): ParsedIntent => {
  const clone = cloneParsedIntent(parsed);
  const needsDowngrade = clone.confidence < 0.4 || clone.isAmbiguous;
  if (needsDowngrade) {
    clone.intent = 'analyze';
    clone.entity = 'general';
  }
  return clone;
};

export const legacyIntentFromParser = (parsed: ParsedIntent): IntentFilters => {
  const filters: IntentFilters = {};
  if (parsed.filters.owner) filters.owner = parsed.filters.owner;
  if (parsed.filters.dateRange) {
    const { label } = parsed.filters.dateRange;
    if (label === 'today' || label === 'this_week' || label === 'this_month' || label === 'this_quarter') {
      filters.timeframe = label;
    } else if (label === 'last_30_days') {
      filters.timeframe = 'this_month';
    }
  }
  if (parsed.filters.statuses?.length) {
    const prioritized = parsed.filters.statuses.find((value) => ['open', 'won', 'lost'].includes(value));
    if (prioritized) filters.status = prioritized as IntentFilters['status'];
  }
  return filters;
};
