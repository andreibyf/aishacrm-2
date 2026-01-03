/* eslint-disable no-undef */
// Add the new intent label for scheduling
export type IntentLabel =
  | 'list_records'
  | 'summaries'
  | 'forecast'
  | 'activities'
  | 'tasks'
  | 'schedule_call' // ✅ Added
  | 'generic_question';

// Add detection logic for scheduling intent
const scheduleRegex = /\b(schedule|book|set up|arrange|plan)\b.*\b(call|meeting|demo|intro|appointment)\b/i;
if (scheduleRegex.test(text)) {
  return {
    intent: 'schedule_call',
    confidence: 0.95,
  };
}