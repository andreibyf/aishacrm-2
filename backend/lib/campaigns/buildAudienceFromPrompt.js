/**
 * Phase 1: Parse plain-English audience prompts into normalized filters.
 */

const MAX_PROMPT_LENGTH = 2000;

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

function normalizePrompt(prompt = '') {
  return String(prompt || '').slice(0, MAX_PROMPT_LENGTH).toLowerCase();
}

function tokenizePrompt(text) {
  if (!text) return [];
  return text
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function parseDurationToken(rawNumber, rawUnit) {
  if (!rawNumber || !rawUnit || !/^\d{1,4}$/.test(rawNumber)) return null;

  const amount = Number(rawNumber);
  const unit = rawUnit.toLowerCase();

  if (unit === 'd' || unit === 'day' || unit === 'days') return amount;
  if (unit === 'w' || unit === 'week' || unit === 'weeks') return amount * 7;
  if (unit === 'mo' || unit === 'month' || unit === 'months') return amount * 30;

  return null;
}

function parseInactivityDays(text) {
  if (!text) return null;

  const tokens = tokenizePrompt(text);
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    const combinedMatch = current.match(/^(\d{1,4})(days?|d|weeks?|w|months?|mo)$/);
    if (combinedMatch) {
      return parseDurationToken(combinedMatch[1], combinedMatch[2]);
    }

    const next = tokens[index + 1];
    const spacedMatch = parseDurationToken(current, next);
    if (spacedMatch != null) {
      return spacedMatch;
    }
  }

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
  const text = normalizePrompt(prompt);

  return {
    target_type: parseTargetType(text),
    inactivity_days: parseInactivityDays(text),
    temperature: parseTemperature(text),
    required_channel: parseRequiredChannel(text),
  };
}

export default buildAudienceFromPrompt;
