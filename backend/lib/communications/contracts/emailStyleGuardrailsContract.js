/**
 * Email Style Guardrails Contract
 *
 * Defines and enforces guardrails that keep AI-generated email concise,
 * human-sounding, context-appropriate, and reviewable before send.
 *
 * This contract is PURE and DETERMINISTIC:
 * - No database access
 * - No external API calls
 * - Same inputs always produce same outputs
 *
 * Guardrail dimensions:
 * - Tone:            formal | friendly | casual
 * - Length:           concise ≤150 words | standard ≤300 | detailed ≤500
 * - Personalization:  recipient name present, context references
 * - Robotic patterns: banned phrases that make AI output obvious
 *
 * @module emailStyleGuardrailsContract
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const EMAIL_TONE = Object.freeze({
  FORMAL: 'formal',
  FRIENDLY: 'friendly',
  CASUAL: 'casual',
});

export const EMAIL_LENGTH_TIER = Object.freeze({
  CONCISE: 'concise', // ≤150 words
  STANDARD: 'standard', // ≤300 words
  DETAILED: 'detailed', // ≤500 words
});

export const GUARDRAIL_SEVERITY = Object.freeze({
  ERROR: 'error', // Must fix before send
  WARNING: 'warning', // Strongly recommended to fix
  INFO: 'info', // Informational only
});

// ---------------------------------------------------------------------------
// Length limits (word count)
// ---------------------------------------------------------------------------

export const LENGTH_LIMITS = Object.freeze({
  [EMAIL_LENGTH_TIER.CONCISE]: 150,
  [EMAIL_LENGTH_TIER.STANDARD]: 300,
  [EMAIL_LENGTH_TIER.DETAILED]: 500,
});

// ---------------------------------------------------------------------------
// Robotic / AI-giveaway patterns
// ---------------------------------------------------------------------------

const ROBOTIC_PATTERNS = [
  { pattern: /\bI hope this (?:email |message )?finds you well\b/i, label: 'Cliché opener' },
  { pattern: /\bI trust this (?:email |message )?finds you\b/i, label: 'Cliché opener' },
  {
    pattern: /\bI hope (?:you are|you're) (?:doing |having a )?(?:well|great|good)\b/i,
    label: 'Cliché opener',
  },
  { pattern: /\bfinds you (?:well|in good)\b/i, label: 'Cliché opener' },
  { pattern: /\bAs an AI\b/i, label: 'AI self-reference' },
  { pattern: /\bAs a language model\b/i, label: 'AI self-reference' },
  { pattern: /\bI'm an AI\b/i, label: 'AI self-reference' },
  { pattern: /\bPlease don't hesitate to\b/i, label: 'Robotic filler' },
  { pattern: /\bDo not hesitate to\b/i, label: 'Robotic filler' },
  { pattern: /\bFeel free to reach out\b/i, label: 'Generic filler' },
  { pattern: /\bI wanted to take a moment to\b/i, label: 'Wordy filler' },
  { pattern: /\bI'm writing to inform you that\b/i, label: 'Verbose opener' },
  { pattern: /\bIn today's fast[- ]paced\b/i, label: 'Cliché' },
  { pattern: /\bSynergy\b/i, label: 'Corporate buzzword' },
  { pattern: /\bLeverage\b/i, label: 'Corporate buzzword' },
  { pattern: /\bCircle back\b/i, label: 'Corporate buzzword' },
  { pattern: /\bLet's unpack\b/i, label: 'Corporate buzzword' },
  { pattern: /\bPer my last email\b/i, label: 'Passive-aggressive cliché' },
  { pattern: /\bThank you for your patience\b/i, label: 'Robotic placeholder' },
  { pattern: /\bAt the end of the day\b/i, label: 'Filler cliché' },
  { pattern: /\bMoving forward\b/i, label: 'Corporate filler' },
  { pattern: /\bPlease be advised\b/i, label: 'Legalistic tone' },
  { pattern: /\bKindly be informed\b/i, label: 'Robotic filler' },
  { pattern: /\bThis is to inform you\b/i, label: 'Verbose opener' },
  { pattern: /\bI'm reaching out to\b/i, label: 'Generic opener' },
  { pattern: /\bIn conclusion\b/i, label: 'Essay-style closer' },
  { pattern: /\bTo summarize\b/i, label: 'Essay-style closer' },
];

// ---------------------------------------------------------------------------
// Default guardrails config builder
// ---------------------------------------------------------------------------

/**
 * Build a default guardrails configuration.
 *
 * @param {object} [overrides]
 * @param {string} [overrides.tone]        - One of EMAIL_TONE values
 * @param {string} [overrides.length_tier] - One of EMAIL_LENGTH_TIER values
 * @returns {object} Guardrails configuration
 */
export function buildDefaultGuardrails(overrides = {}) {
  return {
    tone: overrides.tone || EMAIL_TONE.FRIENDLY,
    length_tier: overrides.length_tier || EMAIL_LENGTH_TIER.STANDARD,
    require_recipient_name: overrides.require_recipient_name !== false,
    check_robotic_patterns: overrides.check_robotic_patterns !== false,
    max_exclamation_marks: overrides.max_exclamation_marks ?? 2,
    max_emoji_count: overrides.max_emoji_count ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Validation: guardrails config shape
// ---------------------------------------------------------------------------

/**
 * Validate a guardrails configuration object.
 *
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateGuardrailsConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Guardrails config must be a non-null object'] };
  }

  if (config.tone && !Object.values(EMAIL_TONE).includes(config.tone)) {
    errors.push(`tone must be one of: ${Object.values(EMAIL_TONE).join(', ')}`);
  }

  if (config.length_tier && !Object.values(EMAIL_LENGTH_TIER).includes(config.length_tier)) {
    errors.push(`length_tier must be one of: ${Object.values(EMAIL_LENGTH_TIER).join(', ')}`);
  }

  if (
    config.max_exclamation_marks !== undefined &&
    (!Number.isInteger(config.max_exclamation_marks) || config.max_exclamation_marks < 0)
  ) {
    errors.push('max_exclamation_marks must be a non-negative integer');
  }

  if (
    config.max_emoji_count !== undefined &&
    (!Number.isInteger(config.max_emoji_count) || config.max_emoji_count < 0)
  ) {
    errors.push('max_emoji_count must be a non-negative integer');
  }

  if (
    config.require_recipient_name !== undefined &&
    typeof config.require_recipient_name !== 'boolean'
  ) {
    errors.push('require_recipient_name must be a boolean');
  }

  if (
    config.check_robotic_patterns !== undefined &&
    typeof config.check_robotic_patterns !== 'boolean'
  ) {
    errors.push('check_robotic_patterns must be a boolean');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Core: evaluate draft against guardrails
// ---------------------------------------------------------------------------

/**
 * Count words in a text string.
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Count emoji characters in a text string.
 * Uses a broad Unicode emoji range.
 * @param {string} text
 * @returns {number}
 */
function countEmoji(text) {
  if (!text) return 0;
  // Use grapheme segmentation to count visible emoji as single units.
  // This correctly handles multi-codepoint sequences (ZWJ families, skin tones, flags).
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  let count = 0;
  for (const { segment } of segmenter.segment(text)) {
    // Check if the grapheme cluster contains an emoji codepoint
    if (/\p{Emoji_Presentation}/u.test(segment) || /\p{Extended_Pictographic}/u.test(segment)) {
      count++;
    }
  }
  return count;
}

/**
 * Evaluate an email draft body against the guardrails configuration.
 *
 * Returns a structured result with pass/fail and individual violations.
 * Each violation includes severity, rule name, and a human-readable message.
 *
 * @param {string} draftBody       - The AI-generated email body text
 * @param {object} guardrails      - A guardrails config (from buildDefaultGuardrails)
 * @param {object} [context]       - Optional context for personalization checks
 * @param {string} [context.recipient_name] - Expected recipient name
 * @returns {{ pass: boolean, violations: Array<{ severity: string, rule: string, message: string }>, stats: object }}
 */
export function evaluateDraft(draftBody, guardrails, context = {}) {
  const config = { ...buildDefaultGuardrails(), ...guardrails };
  const violations = [];
  const body = draftBody || '';
  const wordCount = countWords(body);

  // --- Length check ---
  const maxWords = LENGTH_LIMITS[config.length_tier] || LENGTH_LIMITS[EMAIL_LENGTH_TIER.STANDARD];
  if (wordCount > maxWords) {
    violations.push({
      severity: GUARDRAIL_SEVERITY.WARNING,
      rule: 'length_exceeded',
      message: `Draft is ${wordCount} words — exceeds ${config.length_tier} limit of ${maxWords} words`,
    });
  }

  if (wordCount === 0) {
    violations.push({
      severity: GUARDRAIL_SEVERITY.ERROR,
      rule: 'empty_body',
      message: 'Draft body is empty',
    });
  }

  // --- Robotic pattern check ---
  if (config.check_robotic_patterns) {
    for (const { pattern, label } of ROBOTIC_PATTERNS) {
      const match = body.match(pattern);
      if (match) {
        violations.push({
          severity: GUARDRAIL_SEVERITY.WARNING,
          rule: 'robotic_pattern',
          message: `Detected robotic pattern: "${label}"`,
          matched_phrase: match[0],
        });
      }
    }
  }

  // --- Exclamation mark check ---
  const exclamationCount = (body.match(/!/g) || []).length;
  if (exclamationCount > config.max_exclamation_marks) {
    violations.push({
      severity: GUARDRAIL_SEVERITY.INFO,
      rule: 'excessive_exclamation',
      message: `${exclamationCount} exclamation marks — limit is ${config.max_exclamation_marks}`,
    });
  }

  // --- Emoji check ---
  const emojiCount = countEmoji(body);
  if (emojiCount > config.max_emoji_count) {
    violations.push({
      severity: GUARDRAIL_SEVERITY.INFO,
      rule: 'excessive_emoji',
      message: `${emojiCount} emoji found — limit is ${config.max_emoji_count}`,
    });
  }

  // --- Personalization check ---
  if (config.require_recipient_name && context.recipient_name) {
    const namePresent = body.toLowerCase().includes(context.recipient_name.toLowerCase());
    if (!namePresent) {
      violations.push({
        severity: GUARDRAIL_SEVERITY.WARNING,
        rule: 'missing_recipient_name',
        message: `Recipient name "${context.recipient_name}" not found in draft`,
      });
    }
  }

  // --- Tone alignment checks ---
  if (config.tone === EMAIL_TONE.FORMAL) {
    // Formal emails shouldn't have contractions
    if (
      /\b(?:I'm|you're|we're|they're|it's|don't|can't|won't|isn't|aren't|hasn't|haven't|wouldn't|couldn't|shouldn't)\b/i.test(
        body,
      )
    ) {
      violations.push({
        severity: GUARDRAIL_SEVERITY.INFO,
        rule: 'tone_formal_contractions',
        message: 'Formal tone selected but contractions detected',
      });
    }
  }

  if (config.tone === EMAIL_TONE.CASUAL) {
    // Casual emails shouldn't use overly formal constructions
    if (/\b(Pursuant to|Hereinafter|Aforementioned|Be advised)\b/i.test(body)) {
      violations.push({
        severity: GUARDRAIL_SEVERITY.INFO,
        rule: 'tone_casual_too_formal',
        message: 'Casual tone selected but overly formal language detected',
      });
    }
  }

  const hasErrors = violations.some((v) => v.severity === GUARDRAIL_SEVERITY.ERROR);

  return {
    pass: !hasErrors,
    violations,
    stats: {
      word_count: wordCount,
      exclamation_count: exclamationCount,
      emoji_count: emojiCount,
      robotic_pattern_count: violations.filter((v) => v.rule === 'robotic_pattern').length,
    },
  };
}

// ---------------------------------------------------------------------------
// System prompt style directive builder
// ---------------------------------------------------------------------------

/**
 * Build a style directive string to inject into the AI system prompt.
 * This guides the LLM to produce email that conforms to the guardrails.
 *
 * @param {object} guardrails - A guardrails config
 * @param {object} [context]
 * @param {string} [context.recipient_name]
 * @returns {string} Directive block for system prompt injection
 */
export function buildStyleDirective(guardrails, context = {}) {
  const config = { ...buildDefaultGuardrails(), ...guardrails };
  const maxWords = LENGTH_LIMITS[config.length_tier] || LENGTH_LIMITS[EMAIL_LENGTH_TIER.STANDARD];

  const toneDescriptions = {
    [EMAIL_TONE.FORMAL]:
      'Use a formal, professional tone. Avoid contractions. Use complete sentences.',
    [EMAIL_TONE.FRIENDLY]:
      'Use a warm, professional tone. Contractions are fine. Be approachable but not overly casual.',
    [EMAIL_TONE.CASUAL]: 'Use a relaxed, conversational tone. Keep it natural and direct.',
  };

  // Resolve a human-readable first name from whatever we have
  let recipientLabel = context.recipient_name || '';
  // If the "name" looks like an email address, extract a human name from the local part
  if (!recipientLabel || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientLabel)) {
    const local = (recipientLabel || '').split('@')[0] || '';
    // Turn "john.smith" or "john_smith" into "John"
    const parts = local.split(/[._-]+/).filter(Boolean);
    recipientLabel =
      parts.length > 0
        ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
        : 'there';
  }
  const openerPool = [
    `Hi ${recipientLabel},`,
    `Hello ${recipientLabel},`,
    `Hey ${recipientLabel},`,
    `Good to connect, ${recipientLabel}.`,
    `Hi ${recipientLabel}, quick note:`,
    `Hi ${recipientLabel}, just a heads-up:`,
    `${recipientLabel},`,
    `Hi ${recipientLabel}, thanks for getting back to me.`,
    `Hi ${recipientLabel}, appreciate you taking the time.`,
  ];
  const selectedOpener = openerPool[Math.floor(Math.random() * openerPool.length)];

  const lines = [
    '--- EMAIL STYLE GUIDELINES ---',
    'You are drafting this email on behalf of the user (their executive assistant). Write as if you ARE the user — first person, their voice, their authority. Do not refer to yourself as an AI or assistant.',
    `Tone: ${toneDescriptions[config.tone]}`,
    `Length: Keep the email under ${maxWords} words (${config.length_tier} tier).`,
    'Write like a real human — not like an AI or a corporate template.',
    'ABSOLUTELY NEVER start with "I hope this message finds you well" or "I hope this email finds you well" or "I trust this message finds you well" or ANY variation of "finds you well". This is the #1 dead giveaway of AI-generated text and MUST be avoided.',
    '',
    '** OUTPUT RULES **',
    'Return ONLY the email body text — no XML, no tool calls, no narration, no commentary. Just the email content that would appear in the message body.',
    '',
    '** FORMAT RULES **',
    `The salutation MUST be on its own line, like a letter. Start the email with "${selectedOpener}" on line 1, then a blank line, then the body.`,
    'Vary your openers — do not reuse the same one across emails.',
    '',
    '** DATE/TIME RULES **',
    'NEVER invent or suggest specific dates, days of the week, or times unless the user explicitly mentioned them in the prompt. Instead say things like "at your convenience", "when you have a moment", or "sometime soon". If the user said "next Tuesday" in their prompt, you may use it. If they did not, do NOT fabricate one.',
    '',
    '** SIGN-OFF RULES **',
  ];

  if (context.sender_name) {
    lines.push(
      `End the email with a sign-off line followed by the sender's name on the next line: e.g. "Best,\n${context.sender_name}". ALWAYS include the sender's name "${context.sender_name}" after the sign-off. Do NOT use "[Your name]" or omit the name.`,
    );
  } else {
    lines.push(
      'End the email with a brief sign-off like "Best regards" without a name. Do NOT write "[Your name]".',
    );
  }

  lines.push(
    '',
    'Avoid these robotic/AI phrases: "I hope this finds you well", "Please don\'t hesitate to", "Feel free to reach out", "I wanted to take a moment to", "I\'m writing to inform you that", "moving forward", "synergy", "leverage", "circle back", "per my last email", "please be advised".',
    'End with a clear, specific next step — not a generic closing like "Looking forward to hearing from you."',
  );

  if (config.require_recipient_name && context.recipient_name) {
    lines.push(`Address the recipient by name: ${context.recipient_name}.`);
  }

  if (config.max_exclamation_marks <= 1) {
    lines.push('Limit exclamation marks to at most one.');
  }

  lines.push('--- END STYLE GUIDELINES ---');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  EMAIL_TONE,
  EMAIL_LENGTH_TIER,
  GUARDRAIL_SEVERITY,
  LENGTH_LIMITS,
  buildDefaultGuardrails,
  validateGuardrailsConfig,
  evaluateDraft,
  buildStyleDirective,
  countWords,
};
