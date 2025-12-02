/**
 * Ambiguity Resolver — Task 2.10 Error Handling & Edge Cases
 *
 * Detects unclear/ambiguous commands and generates contextual clarifying questions.
 * Provides fallback suggestions when the intent parser returns low confidence.
 */

import type { ParsedIntent, ConversationalEntity, ConversationalIntent } from './intentParser';

export type AmbiguityReason =
  | 'empty_input'
  | 'no_intent'
  | 'no_entity'
  | 'low_confidence'
  | 'destructive_blocked'
  | 'vague_request'
  | 'missing_details'
  | 'voice_unclear';

export interface AmbiguityOption {
  label: string;
  prompt: string;
  entity?: ConversationalEntity;
  intent?: ConversationalIntent;
}

export interface ClarificationRequest {
  reason: AmbiguityReason;
  message: string;
  hint?: string;
  options: AmbiguityOption[];
  showExamples: boolean;
  offerTextFallback: boolean;
  canRetry: boolean;
}

export interface AmbiguityResolution {
  isAmbiguous: boolean;
  clarification: ClarificationRequest | null;
}

const ENTITY_EXAMPLES: Record<ConversationalEntity, string[]> = {
  leads: [
    'Show me all open leads',
    'Create a new lead',
    'Find leads from California'
  ],
  accounts: [
    'List my accounts',
    'Show accounts with revenue over $1M',
    'Create new account'
  ],
  contacts: [
    'Show contacts for this account',
    'Add a new contact',
    'Find contacts at Acme Corp'
  ],
  opportunities: [
    'Show my open deals',
    'Create a new opportunity',
    'List opportunities closing this month'
  ],
  activities: [
    'Show my tasks for today',
    'Log a call',
    'List overdue activities'
  ],
  dashboard: [
    'Show the dashboard',
    'Give me an overview',
    'What are my metrics?'
  ],
  general: [
    'What can you help me with?',
    'Show me leads',
    'Create a new account'
  ]
};

const INTENT_CLARIFICATIONS: Record<ConversationalIntent, { question: string; examples: string[] }> = {
  query: {
    question: 'What would you like to find or view?',
    examples: ['Show my leads', 'List open opportunities', 'Find accounts in Texas']
  },
  create: {
    question: 'What would you like to create?',
    examples: ['Create a lead', 'Add new account', 'Log an activity']
  },
  update: {
    question: 'What would you like to update?',
    examples: ['Change lead status to qualified', 'Update account revenue', 'Mark task complete']
  },
  navigate: {
    question: 'Where would you like to go?',
    examples: ['Go to leads', 'Open accounts', 'Switch to dashboard']
  },
  analyze: {
    question: 'What would you like me to analyze?',
    examples: ['Summarize my pipeline', 'How many leads this month?', 'Forecast for Q1']
  },
  ambiguous: {
    question: 'I didn\'t quite catch that. Could you clarify?',
    examples: ['Show me leads', 'Create a new account', 'What\'s my pipeline forecast?']
  }
};

const VAGUE_PATTERNS = [
  /^(do|make|help|get)\s+(it|that|this|the thing)$/i,
  /^(something|anything|stuff)$/i,
  /^(hmm|um|uh|er|like|so|well)$/i,
  /^(idk|dunno|not sure)$/i,
  /^(please|thanks|ok|okay|yes|no|maybe)$/i,
  /^[?!.]+$/
];

const MISSING_DETAIL_PATTERNS: { pattern: RegExp; missing: string; hint: string }[] = [
  {
    pattern: /^(show|list|find|get)\s*(all)?$/i,
    missing: 'entity',
    hint: 'What would you like to see? Leads, accounts, contacts, opportunities, or activities?'
  },
  {
    pattern: /^(create|add|new)\s*(a|an)?$/i,
    missing: 'entity',
    hint: 'What would you like to create? A lead, account, contact, opportunity, or activity?'
  },
  {
    pattern: /^(update|change|modify|edit)\s*$/i,
    missing: 'target',
    hint: 'What would you like to update? Please specify the record or field.'
  },
  {
    pattern: /^(delete|remove)\s*$/i,
    missing: 'target',
    hint: 'Deletion requires explicit confirmation. What specifically would you like to remove?'
  }
];

const isVagueRequest = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();
  if (normalized.length < 3) return true;
  return VAGUE_PATTERNS.some((pattern) => pattern.test(normalized));
};

const detectMissingDetails = (text: string): { isMissing: boolean; hint: string } => {
  const normalized = text.trim();
  for (const { pattern, hint } of MISSING_DETAIL_PATTERNS) {
    if (pattern.test(normalized)) {
      return { isMissing: true, hint };
    }
  }
  return { isMissing: false, hint: '' };
};

const buildEntityOptions = (currentEntity: ConversationalEntity): AmbiguityOption[] => {
  const entities: ConversationalEntity[] = ['leads', 'accounts', 'contacts', 'opportunities', 'activities'];

  return entities
    .filter((entity) => entity !== currentEntity || currentEntity === 'general')
    .slice(0, 4)
    .map((entity) => ({
      label: entity.charAt(0).toUpperCase() + entity.slice(1),
      prompt: `Show me ${entity}`,
      entity,
      intent: 'query' as ConversationalIntent
    }));
};

const buildIntentOptions = (currentIntent: ConversationalIntent): AmbiguityOption[] => {
  const options: AmbiguityOption[] = [
    { label: 'Search for something', prompt: 'Find leads', intent: 'query' },
    { label: 'Create something new', prompt: 'Create a new lead', intent: 'create' },
    { label: 'Get insights', prompt: 'Summarize my pipeline', intent: 'analyze' },
    { label: 'Navigate somewhere', prompt: 'Go to accounts', intent: 'navigate' }
  ];

  return options.filter((opt) => opt.intent !== currentIntent);
};

const getExamplesForEntity = (entity: ConversationalEntity): string[] => {
  return ENTITY_EXAMPLES[entity] || ENTITY_EXAMPLES.general;
};

const buildClarificationForReason = (
  reason: AmbiguityReason,
  parsed: ParsedIntent | null,
  rawText: string
): ClarificationRequest => {
  const entity = parsed?.entity || 'general';
  const intent = parsed?.intent || 'ambiguous';

  switch (reason) {
    case 'empty_input':
      return {
        reason,
        message: 'I didn\'t receive any input. What would you like to do?',
        hint: 'Try typing or speaking a command like "Show my leads" or "Create new account".',
        options: buildEntityOptions(entity),
        showExamples: true,
        offerTextFallback: true,
        canRetry: true
      };

    case 'no_intent':
      return {
        reason,
        message: 'I\'m not sure what action you want to take.',
        hint: INTENT_CLARIFICATIONS[intent]?.question || 'Could you be more specific?',
        options: buildIntentOptions(intent),
        showExamples: true,
        offerTextFallback: false,
        canRetry: true
      };

    case 'no_entity':
      return {
        reason,
        message: 'I\'m not sure which type of record you\'re referring to.',
        hint: 'Would you like to work with leads, accounts, contacts, opportunities, or activities?',
        options: buildEntityOptions(entity),
        showExamples: true,
        offerTextFallback: false,
        canRetry: true
      };

    case 'low_confidence':
      return {
        reason,
        message: `I think you might want to ${intent === 'query' ? 'view' : intent} ${entity}, but I'm not certain.`,
        hint: 'Did you mean one of these?',
        options: [
          { label: 'Yes, that\'s right', prompt: rawText, entity, intent },
          ...buildEntityOptions(entity).slice(0, 2),
          { label: 'Something else', prompt: 'Help me', entity: 'general', intent: 'ambiguous' }
        ],
        showExamples: false,
        offerTextFallback: false,
        canRetry: true
      };

    case 'destructive_blocked':
      return {
        reason,
        message: 'That command appears to involve deletion or modification that I can\'t perform automatically.',
        hint: 'For safety, destructive operations require explicit confirmation through the UI.',
        options: [
          { label: 'View instead', prompt: `Show me ${entity}`, entity, intent: 'query' },
          { label: 'Start over', prompt: 'Help me', entity: 'general', intent: 'ambiguous' }
        ],
        showExamples: false,
        offerTextFallback: false,
        canRetry: false
      };

    case 'vague_request':
      return {
        reason,
        message: 'I\'m not sure what you mean by that.',
        hint: 'Could you be more specific? Here are some examples of what I can help with:',
        options: buildIntentOptions(intent),
        showExamples: true,
        offerTextFallback: true,
        canRetry: true
      };

    case 'missing_details': {
      const details = detectMissingDetails(rawText);
      return {
        reason,
        message: 'I need a bit more information to help with that.',
        hint: details.hint || 'Please provide more details about what you\'d like to do.',
        options: buildEntityOptions(entity),
        showExamples: true,
        offerTextFallback: false,
        canRetry: true
      };
    }

    case 'voice_unclear':
      return {
        reason,
        message: 'I couldn\'t clearly understand that voice command.',
        hint: 'Try speaking more slowly, or type your request instead.',
        options: [
          { label: 'Try again', prompt: '', entity: 'general', intent: 'ambiguous' },
          { label: 'Type instead', prompt: '', entity: 'general', intent: 'ambiguous' }
        ],
        showExamples: true,
        offerTextFallback: true,
        canRetry: true
      };

    default:
      return {
        reason: 'vague_request',
        message: 'I\'m not sure how to help with that.',
        hint: 'Try one of these common actions:',
        options: buildIntentOptions(intent),
        showExamples: true,
        offerTextFallback: true,
        canRetry: true
      };
  }
};

/**
 * Determines if a parsed intent is ambiguous and needs clarification.
 * Returns a structured clarification request if so.
 */
export const resolveAmbiguity = (
  parsed: ParsedIntent | null,
  rawText: string,
  options?: { origin?: 'text' | 'voice' }
): AmbiguityResolution => {
  const text = (rawText || '').trim();
  const origin = options?.origin || 'text';

  // Empty input
  if (!text) {
    return {
      isAmbiguous: true,
      clarification: buildClarificationForReason('empty_input', parsed, text)
    };
  }

  // Vague/meaningless input
  if (isVagueRequest(text)) {
    return {
      isAmbiguous: true,
      clarification: buildClarificationForReason('vague_request', parsed, text)
    };
  }

  // Missing details (incomplete command)
  const missingCheck = detectMissingDetails(text);
  if (missingCheck.isMissing) {
    return {
      isAmbiguous: true,
      clarification: buildClarificationForReason('missing_details', parsed, text)
    };
  }

  // No parsed result at all
  if (!parsed) {
    return {
      isAmbiguous: true,
      clarification: buildClarificationForReason(
        origin === 'voice' ? 'voice_unclear' : 'vague_request',
        null,
        text
      )
    };
  }

  // Destructive command blocked
  if (parsed.isPotentiallyDestructive) {
    return {
      isAmbiguous: true,
      clarification: buildClarificationForReason('destructive_blocked', parsed, text)
    };
  }

  // Explicit ambiguity flag from parser
  if (parsed.isAmbiguous) {
    // Determine specific reason
    if (parsed.intent === 'ambiguous') {
      return {
        isAmbiguous: true,
        clarification: buildClarificationForReason('no_intent', parsed, text)
      };
    }
    if (parsed.entity === 'general') {
      return {
        isAmbiguous: true,
        clarification: buildClarificationForReason('no_entity', parsed, text)
      };
    }
  }

  // Low confidence
  if (parsed.confidence < 0.4) {
    return {
      isAmbiguous: true,
      clarification: buildClarificationForReason('low_confidence', parsed, text)
    };
  }

  // All checks passed — not ambiguous
  return {
    isAmbiguous: false,
    clarification: null
  };
};

/**
 * Get example commands for a given entity context.
 */
export const getContextualExamples = (entity: ConversationalEntity): string[] => {
  return getExamplesForEntity(entity);
};

/**
 * Build a friendly "I don't understand" message with suggestions.
 */
export const buildFallbackMessage = (
  parsed: ParsedIntent | null,
  rawText: string,
  consecutiveFailures: number = 0
): { content: string; actions: Array<{ label: string; type: string; prompt?: string }> } => {
  const entity = parsed?.entity || 'general';
  const examples = getExamplesForEntity(entity);

  let content: string;
  let showSupport = false;

  if (consecutiveFailures >= 3) {
    content = `I'm having trouble understanding your requests. Would you like to try a different approach or contact support for help?`;
    showSupport = true;
  } else if (consecutiveFailures >= 2) {
    content = `I'm still not sure what you need. Here are some things I can help with:\n\n${examples.map((ex) => `• ${ex}`).join('\n')}`;
  } else {
    content = `I'm not sure I understood that. Did you mean one of these?\n\n${examples.slice(0, 3).map((ex) => `• ${ex}`).join('\n')}`;
  }

  const actions: Array<{ label: string; type: string; prompt?: string }> = [
    { label: 'Show examples', type: 'show_examples' },
    { label: 'Start over', type: 'reset_thread' }
  ];

  if (showSupport) {
    actions.push({ label: 'Contact Support', type: 'escalate_support' });
  }

  return { content, actions };
};

/**
 * Check if input looks like an unrecognized voice transcription.
 */
export const isLikelyVoiceGarble = (text: string): boolean => {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();

  // Very short, likely mishear
  if (normalized.length < 3) return true;

  // All same character repeated
  if (/^(.)\1+$/.test(normalized)) return true;

  // Mostly non-alphabetic
  const alphaRatio = (normalized.match(/[a-z]/g) || []).length / normalized.length;
  if (alphaRatio < 0.5) return true;

  // Common voice recognition artifacts
  const voiceArtifacts = ['um', 'uh', 'hmm', 'ah', 'eh', 'oh'];
  if (voiceArtifacts.includes(normalized)) return true;

  return false;
};
