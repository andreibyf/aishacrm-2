/**
 * INTENT CLASSIFIER
 * Deterministic classification of user messages into intent codes
 * Maps to tools via the Canonical Chat Intent Map
 * 
 * Replaces text-based tool guidance with predictable routing
 * Reduces token overhead by 3-4x
 */

/**
 * Intent pattern definitions
 * Each pattern maps to an intent code from the Intent Map
 */
const INTENT_PATTERNS = {
  // SYSTEM / TENANT
  SYSTEM_SNAPSHOT: [
    /\b(show|get|fetch|display)\s+(me\s+)?(the\s+)?(system\s+)?(tenant\s+)?(snapshot|overview|summary|stats|status)\b/i,
    /\b(what('s| is)\s+)?(my|the)\s+(current\s+)?(crm\s+)?(status|state|overview)\b/i,
    /\bhow\s+(many|much)\s+(of\s+)?(everything|all\s+records|total)\b/i
  ],
  
  SYSTEM_DEBUG: [
    /\b(debug|probe|inspect|diagnose)\s+(the\s+)?(system|tenant|database)\b/i
  ],

  // ACCOUNTS
  ACCOUNT_CREATE: [
    /\b(create|add|new)\s+(an?\s+)?(account|company|organization)\b/i,
    /\b(add|create)\s+.+\s+(as\s+)?(an?\s+)?(account|company)\b/i
  ],
  
  ACCOUNT_UPDATE: [
    /\b(update|modify|change|edit)\s+(the\s+)?(account|company)\b/i,
    /\b(set|change)\s+.+\s+(account|company)\s+(to|=)\b/i
  ],
  
  ACCOUNT_GET: [
    /\b(show|get|display|tell me about)\s+(the\s+)?(account|company)\s+(details|info(rmation)?)\b/i,
    /\b(what|who)\s+(is|are)\s+(the\s+)?(account|company)\b/i
  ],
  
  ACCOUNT_LIST: [
    /\b(list|show|display|get)\s+(all\s+)?(the\s+)?(accounts|companies)\b/i,
    /\b(how many|count)\s+(accounts|companies)\b/i
  ],
  
  ACCOUNT_SEARCH: [
    /\b(find|search|look for|locate)\s+(an?\s+)?(account|company)\b/i,
    /\b(search|find)\s+.+\s+(account|company)\b/i
  ],
  
  ACCOUNT_DELETE: [
    /\b(delete|remove)\s+(the\s+)?(account|company)\b/i
  ],

  // LEADS
  LEAD_CREATE: [
    /\b(create|add|new)\s+(an?\s+)?(lead|prospect)\b/i,
    /\b(add|create)\s+.+\s+(as\s+)?(an?\s+)?lead\b/i
  ],
  
  LEAD_UPDATE: [
    /\b(update|modify|change|edit)\s+(the\s+)?lead\b/i,
    /\b(set|change)\s+.+\s+lead\s+(to|=)\b/i
  ],
  
  LEAD_QUALIFY: [
    /\b(qualify|mark\s+as\s+qualified)\s+(the\s+)?lead\b/i
  ],
  
  LEAD_CONVERT: [
    /\b(convert|promote)\s+(the\s+)?lead\s+(to|into)\s+(an?\s+)?(account|customer)\b/i
  ],
  
  LEAD_LIST: [
    /\b(list|show|display|get)\s+(all\s+)?(the\s+)?leads\b/i,
    /\b(how many|count)\s+leads\b/i,
    /\b(show|give)\s+me\s+(all\s+)?(the\s+)?leads\b/i
  ],
  
  LEAD_SEARCH: [
    /\b(find|search|look for|locate)\s+(an?\s+)?lead\b/i,
    /\b(search|find)\s+.+\s+lead\b/i
  ],
  
  LEAD_GET: [
    /\b(show|get|display|tell me about)\s+(the\s+)?lead\s+(details|info(rmation)?)\b/i,
    /\b(what|who)\s+(is|are)\s+(the\s+)?lead\b/i,
    // Common conversational phrasings
    /\bwhat\s+is\s+the\s+name\s+of\s+(my\s+)?(warm|hot|cold)?\s*lead\b/i,
    /\b(my\s+)?(warm|hot|cold)\s+lead\b/i,
    /\bwho\s+is\s+my\s+lead\b/i
  ],
  
  LEAD_DELETE: [
    /\b(delete|remove)\s+(the\s+)?lead\b/i
  ],

  // ACTIVITIES
  ACTIVITY_CREATE: [
    /\b(create|add|new|schedule)\s+(an?\s+)?(activity|task|meeting|call|email)\b/i,
    /\b(add|create)\s+.+\s+(activity|task|meeting)\b/i
  ],
  
  ACTIVITY_UPDATE: [
    /\b(update|modify|change|edit|reschedule)\s+(the\s+)?(activity|task|meeting|call)\b/i,
    /\b(reschedule|move|change)\s+(the\s+)?(meeting|call|task)\b/i
  ],
  
  ACTIVITY_COMPLETE: [
    /\b(mark|set)\s+(the\s+)?(activity|task|meeting)\s+(as\s+)?(complete|done|finished)\b/i,
    /\b(complete|finish)\s+(the\s+)?(activity|task|meeting)\b/i
  ],
  
  ACTIVITY_UPCOMING: [
    /\b(show|get|display)\s+(my\s+)?(upcoming|scheduled|future)\s+(activities|tasks|meetings|calendar)\b/i,
    /\b(what('s| is)\s+)?(on\s+)?(my\s+)?(calendar|schedule)\b/i
  ],
  
  ACTIVITY_LIST: [
    /\b(list|show|display|get)\s+(all\s+)?(the\s+)?(activities|tasks|meetings|calendar)\b/i,
    /\b(what\s+are\s+my|show\s+my)\s+(activities|tasks|meetings)\b/i
  ],
  
  ACTIVITY_SEARCH: [
    /\b(find|search|look for|locate)\s+(an?\s+)?(activity|task|meeting|call)\b/i
  ],
  
  ACTIVITY_GET: [
    /\b(show|get|display)\s+(the\s+)?(activity|task|meeting)\s+(details|info(rmation)?)\b/i
  ],
  
  ACTIVITY_SCHEDULE: [
    /\b(schedule|book|set up)\s+(an?\s+)?meeting\b/i
  ],
  
  ACTIVITY_DELETE: [
    /\b(delete|remove|cancel)\s+(the\s+)?(activity|task|meeting|call)\b/i
  ],

  // NOTES
  NOTE_CREATE: [
    /\b(create|add|new|write)\s+(an?\s+)?note\b/i,
    /\b(add|create)\s+.+\s+note\b/i
  ],
  
  NOTE_UPDATE: [
    /\b(update|modify|change|edit)\s+(the\s+)?note\b/i
  ],
  
  NOTE_SEARCH: [
    /\b(find|search|look for)\s+(notes|note)\b/i,
    /\b(search|find)\s+.+\s+note(s)?\b/i
  ],
  
  NOTE_LIST_FOR_RECORD: [
    /\b(show|get|display|read)\s+(all\s+)?(the\s+)?notes\b/i,
    /\b(show|get|display)\s+(all\s+)?(the\s+)?notes\s+(for|on|about)\b/i,
    /\b(what\s+are\s+the\s+)?notes\s+(for|on|about)\b/i,
    // "last note" / "most recent note" style questions (typically implicit entity)
    /\b(last|latest|most\s+recent)\s+note\b/i,
    /\bwhat\s+is\s+the\s+last\s+note\s+(created|added|written)\b/i,
    // Simple "notes" queries
    /\bare\s+there\s+(any\s+)?notes\b/i,
    /\b(check|see|view)\s+(the\s+)?notes\b/i
  ],
  
  NOTE_GET: [
    /\b(show|get|display)\s+(the\s+)?note\s+(details|info(rmation)?)\b/i
  ],
  
  NOTE_DELETE: [
    /\b(delete|remove)\s+(the\s+)?note\b/i
  ],

  // OPPORTUNITIES
  OPPORTUNITY_CREATE: [
    /\b(create|add|new)\s+(an?\s+)?(opportunity|deal|sale)\b/i
  ],
  
  OPPORTUNITY_UPDATE: [
    /\b(update|modify|change|edit)\s+(the\s+)?(opportunity|deal)\b/i
  ],
  
  OPPORTUNITY_LIST_BY_STAGE: [
    /\b(show|list|get)\s+(opportunities|deals)\s+(by\s+stage|in\s+stage)\b/i,
    /\b(what\s+)?(opportunities|deals)\s+(are\s+)?(in|at)\s+(the\s+)?(\w+)\s+stage\b/i
  ],
  
  OPPORTUNITY_SEARCH: [
    /\b(find|search|look for)\s+(an?\s+)?(opportunity|deal)\b/i
  ],
  
  OPPORTUNITY_GET: [
    /\b(show|get|display)\s+(the\s+)?(opportunity|deal)\s+(details|info(rmation)?)\b/i
  ],
  
  OPPORTUNITY_FORECAST: [
    /\b(show|get|calculate)\s+(the\s+)?(opportunity|revenue|sales)\s+forecast\b/i
  ],
  
  OPPORTUNITY_MARK_WON: [
    /\b(mark|set)\s+(the\s+)?(opportunity|deal)\s+(as\s+)?(won|closed|successful)\b/i
  ],
  
  OPPORTUNITY_DELETE: [
    /\b(delete|remove)\s+(the\s+)?(opportunity|deal)\b/i
  ],

  // CONTACTS
  CONTACT_CREATE: [
    /\b(create|add|new)\s+(an?\s+)?contact\b/i
  ],
  
  CONTACT_UPDATE: [
    /\b(update|modify|change|edit)\s+(the\s+)?contact\b/i
  ],
  
  CONTACT_LIST_FOR_ACCOUNT: [
    /\b(show|list|get)\s+(all\s+)?(the\s+)?contacts\s+(for|at|in)\b/i,
    /\b(who\s+are\s+the\s+)?contacts\s+(at|for|in)\b/i
  ],
  
  CONTACT_GET: [
    /\b(show|get|display)\s+(the\s+)?contact\s+(details|info(rmation)?)\b/i
  ],
  
  CONTACT_SEARCH: [
    /\b(find|search|look for)\s+(an?\s+)?contact\b/i
  ],
  
  CONTACT_DELETE: [
    /\b(delete|remove)\s+(the\s+)?contact\b/i
  ],

  // BIZDEV SOURCES
  BIZDEV_CREATE: [
    /\b(create|add|new)\s+(an?\s+)?(bizdev\s+source|business\s+development\s+source)\b/i
  ],
  
  BIZDEV_LIST: [
    /\b(list|show|display)\s+(all\s+)?(the\s+)?(bizdev\s+sources|business\s+development\s+sources)\b/i
  ],

  // NEXT ACTIONS (CRITICAL - High priority pattern)
  AI_SUGGEST_NEXT_ACTIONS: [
    /\b(what\s+should\s+(I|we)\s+do\s+next|what\s+do\s+you\s+(recommend|suggest|think)|how\s+should\s+(I|we)\s+proceed|what('s| is| are)\s+(my|our|the)\s+next\s+step)\b/i,
    /\b(suggest|recommend)\s+(next\s+)?(action|step)s?\b/i,
    /\b(what\s+(are\s+)?my\s+next\s+steps)\b/i,
    // Conversational "what do you think" style queries
    /\bwhat\s+do\s+you\s+think\s+(about|of)\b/i,
    /\bwhat\s+would\s+you\s+(suggest|recommend|do)\b/i,
    /\b(any|give\s+me)\s+(suggestions?|recommendations?)\b/i,
    /\bhow\s+(should|can|do)\s+(I|we)\s+(approach|handle|deal\s+with)\b/i,
    /\bwhat\s+is\s+(the|my)\s+best\s+(next\s+)?(move|action|step)\b/i,
    // Short/casual queries
    /^(what\s+now|now\s+what|next\??|ideas\??|suggestions\??|help\s+me)$/i,
    /\bwhat\s+(can|should)\s+(I|we)\s+do\b/i,
    /\b(help|assist)\s+(me\s+)?(with\s+)?(this|the)\b/i,
    /\bwhat\s+actions?\s+(should|can|do)\b/i,
    /\b(advise|advice)\s+(me|on|for)\b/i,
    /\bwhat\s+next\b/i,
    /\bnext\s+steps?\b/i,
  ],

  // NAVIGATION
  NAVIGATE_TO_PAGE: [
    /\b(go to|take me to|show me|open|navigate to)\s+(the\s+)?(\w+)\s+(page|view|screen)\b/i,
    /\b(open|show)\s+(the\s+)?(dashboard|leads|contacts|accounts|opportunities|activities|calendar|settings|workflows|reports)\b/i
  ],

  // REPORTS
  REPORT_DASHBOARD: [
    /\b(show|get|display)\s+(the\s+)?(dashboard|main\s+dashboard)\b/i
  ],
  
  REPORT_SALES: [
    /\b(show|get|generate)\s+(the\s+)?sales\s+report\b/i
  ],
  
  REPORT_PIPELINE: [
    /\b(show|get|display)\s+(the\s+)?pipeline\s+report\b/i
  ],

  // WEB RESEARCH
  WEB_SEARCH: [
    /\b(search|look up|find)\s+(on\s+the\s+)?(web|internet)\b/i,
    /\b(web|internet|google)\s+search\s+(for|about)\b/i
  ],
  
  WEB_LOOKUP_COMPANY: [
    /\b(look up|find|research)\s+(the\s+)?company\s+info(rmation)?\b/i,
    /\b(what\s+do\s+you\s+know\s+about)\s+(the\s+)?company\b/i
  ],

  // WORKFLOWS
  WORKFLOW_LIST_TEMPLATES: [
    /\b(list|show)\s+(all\s+)?(the\s+)?workflow\s+templates\b/i
  ],

  // TELEPHONY
  TELEPHONY_INITIATE_CALL: [
    /\b(make|initiate|start)\s+(an?\s+)?call\b/i
  ],
  
  TELEPHONY_CALL_CONTACT: [
    /\b(call|phone)\s+(the\s+)?contact\b/i
  ]
};

/**
 * Classify user message into intent code
 * @param {string} message - User's chat message
 * @returns {string|null} Intent code (e.g., 'LEAD_CREATE') or null if no match
 */
export function classifyIntent(message) {
  if (!message || typeof message !== 'string') {
    return null;
  }

  const normalizedMessage = message.trim();

  // Priority 1: Check for next actions first (highest priority)
  for (const pattern of INTENT_PATTERNS.AI_SUGGEST_NEXT_ACTIONS) {
    if (pattern.test(normalizedMessage)) {
      return 'AI_SUGGEST_NEXT_ACTIONS';
    }
  }

  // Priority 2: Check all other intents
  for (const [intentCode, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intentCode === 'AI_SUGGEST_NEXT_ACTIONS') continue; // Already checked

    for (const pattern of patterns) {
      if (pattern.test(normalizedMessage)) {
        return intentCode;
      }
    }
  }

  // No intent matched - let AI decide with full tool array
  return null;
}

/**
 * Extract entity mentions from message for context
 * Helps route to correct entity-specific tools
 * @param {string} message - User's chat message
 * @returns {Object} Entity mentions with types
 */
export function extractEntityMentions(message) {
  const entities = {
    lead: null,
    account: null,
    contact: null,
    opportunity: null,
    activity: null
  };

  // Simple extraction - can be enhanced with NER
  if (/\blead\b/i.test(message)) entities.lead = true;
  if (/\b(account|company)\b/i.test(message)) entities.account = true;
  if (/\bcontact\b/i.test(message)) entities.contact = true;
  if (/\b(opportunity|deal)\b/i.test(message)) entities.opportunity = true;
  if (/\b(activity|task|meeting)\b/i.test(message)) entities.activity = true;

  return entities;
}

/**
 * Get confidence score for intent classification
 * @param {string} message - User's chat message
 * @param {string} intentCode - Classified intent
 * @returns {number} Confidence score 0-1
 */
export function getIntentConfidence(message, intentCode) {
  if (!intentCode || !INTENT_PATTERNS[intentCode]) {
    return 0;
  }

  const patterns = INTENT_PATTERNS[intentCode];
  let maxMatchLength = 0;

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[0].length > maxMatchLength) {
      maxMatchLength = match[0].length;
    }
  }

  // Confidence based on match coverage
  const coverage = maxMatchLength / message.length;
  return Math.min(coverage * 2, 1); // Scale up to 1.0
}
