/**
 * Customer C.A.R.E. v1 – Call Signal Adapter Tests
 * 
 * PR5: Shadow wiring for call flows
 * 
 * Tests for signal derivation from call context.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { signalsFromCall, buildEscalationText } from '../careCallSignalAdapter.js';

describe('careCallSignalAdapter', () => {
  describe('signalsFromCall', () => {
    it('should derive has_bidirectional=true for answered inbound call', () => {
      const callContext = {
        direction: 'inbound',
        outcome: 'answered',
        duration: 120,
        sentiment: 'neutral'
      };

      const signals = signalsFromCall(callContext);

      assert.strictEqual(signals.has_bidirectional, true);
      assert.strictEqual(signals.meta.direction, 'inbound');
      assert.strictEqual(signals.meta.outcome, 'answered');
    });

    it('should derive has_bidirectional=true for answered outbound call', () => {
      const callContext = {
        direction: 'outbound',
        outcome: 'answered',
        duration: 180,
        sentiment: 'positive'
      };

      const signals = signalsFromCall(callContext);

      assert.strictEqual(signals.has_bidirectional, true);
    });

    it('should derive negative_sentiment=true when sentiment is negative', () => {
      const callContext = {
        direction: 'inbound',
        outcome: 'answered',
        sentiment: 'negative',
        duration: 90
      };

      const signals = signalsFromCall(callContext);

      assert.strictEqual(signals.negative_sentiment, true);
      assert.strictEqual(signals.meta.sentiment, 'negative');
    });

    it('should derive recent_message=true for inbound calls', () => {
      const callContext = {
        direction: 'inbound',
        outcome: 'answered',
        duration: 60
      };

      const signals = signalsFromCall(callContext);

      assert.strictEqual(signals.recent_message, true);
    });

    it('should derive high_engagement=true for answered call with action items', () => {
      const callContext = {
        direction: 'outbound',
        outcome: 'answered',
        duration: 300,
        actionItems: ['Follow up with proposal', 'Schedule demo'],
        sentiment: 'positive'
      };

      const signals = signalsFromCall(callContext);

      assert.strictEqual(signals.high_engagement, true);
      assert.strictEqual(signals.meta.action_item_count, 2);
    });

    it('should mark outcome_suggests_rejection for no-answer', () => {
      const callContext = {
        direction: 'outbound',
        outcome: 'no-answer',
        duration: 0
      };

      const signals = signalsFromCall(callContext);

      assert.strictEqual(signals.meta.outcome_suggests_rejection, true);
      assert.strictEqual(signals.has_bidirectional, false);
    });

    it('should mark outcome_suggests_rejection for voicemail', () => {
      const callContext = {
        direction: 'outbound',
        outcome: 'voicemail',
        duration: 0
      };

      const signals = signalsFromCall(callContext);

      assert.strictEqual(signals.meta.outcome_suggests_rejection, true);
    });

    it('should calculate engagement_score based on signals', () => {
      const callContext = {
        direction: 'inbound',
        outcome: 'answered',
        duration: 240,
        sentiment: 'positive',
        actionItems: ['Send contract', 'Book meeting'],
        summary: 'Customer very interested in premium plan. Asked about pricing and contract terms. Looking to upgrade next month.'
      };

      const signals = signalsFromCall(callContext);

      assert.strictEqual(signals.has_bidirectional, true);
      assert.strictEqual(signals.high_engagement, true);
      // Engagement: 2 (bidirectional) + 2 (high_engagement) + 2 (actionItems) + 1 (summary>100)
      assert.strictEqual(signals.meta.engagement_score, 7);
    });

    it('should include transcript/summary presence in metadata', () => {
      const callContext = {
        direction: 'inbound',
        outcome: 'answered',
        duration: 90,
        transcript: 'Full transcript here...',
        summary: 'Customer called about billing issue'
      };

      const signals = signalsFromCall(callContext);

      assert.strictEqual(signals.meta.has_transcript, true);
      assert.strictEqual(signals.meta.has_summary, true);
    });

    it('should handle minimal call context without errors', () => {
      const callContext = {
        direction: 'outbound'
      };

      const signals = signalsFromCall(callContext);

      assert.strictEqual(signals.has_bidirectional, false);
      assert.strictEqual(signals.negative_sentiment, false);
      assert.strictEqual(signals.meta.direction, 'outbound');
      assert.strictEqual(signals.meta.outcome, 'unknown');
    });
  });

  describe('buildEscalationText', () => {
    it('should prefer summary over transcript', () => {
      const summary = 'Customer upset about billing';
      const transcript = 'Long transcript with many details...';

      const text = buildEscalationText(summary, transcript);

      assert.strictEqual(text, summary);
    });

    it('should use transcript if no summary provided', () => {
      const transcript = 'Customer mentioned pricing concerns.';

      const text = buildEscalationText('', transcript);

      assert.strictEqual(text, transcript);
    });

    it('should truncate transcript if exceeds maxLength', () => {
      const longTranscript = 'x'.repeat(6000);

      const text = buildEscalationText('', longTranscript, 5000);

      assert.strictEqual(text.length, 5000);
      assert.strictEqual(text.endsWith('...'), true);
    });

    it('should return empty string if both summary and transcript are empty', () => {
      const text = buildEscalationText('', '');

      assert.strictEqual(text, '');
    });

    it('should trim whitespace from summary', () => {
      const summary = '  Customer happy with service  ';

      const text = buildEscalationText(summary, '');

      assert.strictEqual(text, 'Customer happy with service');
    });
  });
});
