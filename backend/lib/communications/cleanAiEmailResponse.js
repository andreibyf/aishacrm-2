/**
 * cleanAiEmailResponse.js
 *
 * Extracts a clean email { subject, body } from raw AI/LLM output.
 *
 * AI models often wrap the actual email inside tool-call XML
 * (<tool_calls>, <function_calls>, <invoke>, <parameter>) and
 * surround it with narration like "I'll draft an email…" or
 * "The email is now in your queue."  This utility strips all of
 * that and returns only the email-ready content.
 */

/**
 * Extract clean email body and (optionally) subject from raw AI output.
 *
 * @param {string} raw          - Raw AI response text
 * @param {string} [fallbackSubject] - Subject to use if none found in AI output
 * @returns {{ body: string, subject: string|null }}
 */
export function cleanAiEmailResponse(raw, fallbackSubject = null) {
  if (!raw || typeof raw !== 'string') {
    return { body: '', subject: fallbackSubject };
  }

  let body = raw;
  let subject = fallbackSubject;

  // ── 1. Extract from tool-call XML if present ─────────────────────
  const hasXml = /<(?:tool_calls?|function_calls|invoke|parameter)\b/i.test(body);
  if (hasXml) {
    // Extract subject from <parameter name="subject">…</parameter>
    const subjectMatch = body.match(/<parameter\s+name="subject">([\s\S]*?)<\/parameter>/i);
    if (subjectMatch?.[1]) {
      subject = subjectMatch[1].trim();
    }

    // Extract body from <parameter name="body">…</parameter>
    const bodyMatch = body.match(/<parameter\s+name="body">([\s\S]*?)<\/parameter>/i);
    if (bodyMatch?.[1]) {
      body = bodyMatch[1].trim();
    } else {
      // No body parameter — remove all angle brackets to strip XML markup
      body = body.replace(/[<>]/g, '').trim();
    }
  }

  // ── 1b. Strip ALL HTML/XML markup completely ─────────────────────
  // Email body should be plain text. Remove ALL angle bracket characters
  // rather than attempting regex-based tag matching (which is incomplete
  // and can be bypassed with malformed or encoded tags).
  body = body.replace(/[<>]/g, '');

  // ── 2. Strip leading AI narration before the greeting ────────────
  const greetingIdx = body.search(
    /^(Hi\b|Hello\b|Hey\b|Dear\b|Good\s(?:morning|afternoon|evening))/m,
  );
  if (greetingIdx > 0) {
    body = body.substring(greetingIdx);
  }

  // ── 3. Strip trailing AI narration after the sign-off ────────────
  const signoffRe =
    /^(Best(?:\s+regards)?|Warm(?:est)?\s+regards|Sincerely|Kind(?:est)?\s+regards|Thanks|Thank\s+you|Cheers|Regards),?\s*$/m;
  const signoffMatch = body.match(signoffRe);
  if (signoffMatch) {
    const idx = body.indexOf(signoffMatch[0]);
    const afterSignoff = body.substring(idx);
    // Keep sign-off line + up to 1 sender-name line
    const lines = afterSignoff.split('\n').filter((l) => l.trim());
    body = body.substring(0, idx) + lines.slice(0, 2).join('\n');
  }

  // ── 4. Collapse excessive blank lines ────────────────────────────
  body = body.replace(/\n{3,}/g, '\n\n').trim();

  return { body, subject };
}

/**
 * Strip CRM context JSON from a body_prompt for display purposes.
 * Removes "Related CRM record: {…}" and similar suffixes.
 *
 * @param {string} prompt - The raw body_prompt
 * @returns {string} Human-readable instruction only
 */
export function stripPromptContext(prompt) {
  if (!prompt || typeof prompt !== 'string') return '';
  // Strip from "Related CRM record:" or "Context:" or JSON blobs onwards
  return prompt
    .replace(/\s*Related CRM record:[\s\S]*$/i, '')
    .replace(/\s*Context:\s*\{[\s\S]*$/i, '')
    .replace(/\s*\{"type":[\s\S]*$/i, '')
    .trim();
}
