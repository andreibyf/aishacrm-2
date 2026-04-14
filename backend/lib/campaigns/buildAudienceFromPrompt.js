/**
 * Phase 1: Parse plain-English audience prompts into normalized filters.
 */

const TARGET_TYPE_PATTERNS = [
  { type: 'lead', regex: /\bleads?\b/ },
  { type: 'source', regex: /\b(source|sources|biz\s*dev|bizdev)\b/ },
  { type: 'opportunity', regex: /\bopportunit(?:y|ies)\b/ },
  { type: 'contact', regex: /\bcontacts?\b/ },
];

const CHANNEL_PATTERNS = [
  { channel: 'phone', regex: /\b(phone|call|calls|calling|sms|text|voice)\b/ },
  { channel: 'email', regex: /\b(email|emails|e-mail|mail)\b/ },
];

function parseInactivityDays(text) {
  if (!text) return null;

  const dayMatch = text.match(/(\d+)\s*(day|days|d)\b/);
  if (dayMatch) return Number(dayMatch[1]);

  const weekMatch = text.match(/(\d+)\s*(week|weeks|w)\b/);
  if (weekMatch) return Number(weekMatch[1]) * 7;

  const monthMatch = text.match(/(\d+)\s*(month|months|mo)\b/);
  if (monthMatch) return Number(monthMatch[1]) * 30;

  return null;
}

function parseTargetType(text) {
  for (const rule of TARGET_TYPE_PATTERNS) {
    if (rule.regex.test(text)) return rule.type;
  }
  return 'contact';
}

function parseTemperature(text) {
  if (/\bcold\b/.test(text)) return 'cold';
  if (/\bwarm\b/.test(text)) return 'warm';
  if (/\bhot\b/.test(text)) return 'hot';
  return null;
}

function parseRequiredChannel(text) {
  for (const rule of CHANNEL_PATTERNS) {
    if (rule.regex.test(text)) return rule.channel;
  }
  return 'email';
}

export function buildAudienceFromPrompt(prompt = '') {
  const text = String(prompt || '').toLowerCase();

  return {
    target_type: parseTargetType(text),
    inactivity_days: parseInactivityDays(text),
    temperature: parseTemperature(text),
    required_channel: parseRequiredChannel(text),
  };
}

export default buildAudienceFromPrompt;
