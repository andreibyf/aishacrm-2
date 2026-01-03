/* eslint-disable no-undef */
// Update mode selector to include scheduling intent
const mode =
  classification.intent === 'summaries' ||
  classification.intent === 'forecast' ||
  classification.intent === 'schedule_call' // ✅ Added
    ? 'propose_actions'
    : 'read_only';