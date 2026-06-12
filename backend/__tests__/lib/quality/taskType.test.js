/**
 * Tests for the lite-tier task-type detector.
 * [2026-06-11 Claude] Phase 1 of the lite-tier quality pipeline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectTaskType } from '../../../lib/quality/taskType.js';

describe('detectTaskType — intent', () => {
  it('classifies explicit email drafting', () => {
    assert.equal(detectTaskType('Draft an introductory email to Sarah Chen').type, 'email_draft');
    assert.equal(detectTaskType('Write a reply to the customer message').type, 'email_draft');
    assert.equal(detectTaskType('Compose an outreach email').type, 'email_draft');
  });

  it('classifies explicit activity creation', () => {
    assert.equal(detectTaskType('Create an appointment for Tuesday').type, 'activity_create');
    assert.equal(detectTaskType('Schedule a 15-minute call with the lead').type, 'activity_create');
    assert.equal(detectTaskType('Book a meeting with Brightwave').type, 'activity_create');
    assert.equal(detectTaskType('Add a follow-up task').type, 'activity_create');
  });

  it('classifies note/summary tasks', () => {
    assert.equal(detectTaskType('Summarize the call notes').type, 'note_summary');
    assert.equal(detectTaskType('Give me a recap of the meeting').type, 'note_summary');
  });

  it('falls through to generic_text when no explicit verb matches', () => {
    assert.equal(detectTaskType('What is the weather like?').type, 'generic_text');
    assert.equal(detectTaskType('').type, 'generic_text');
    assert.equal(detectTaskType(undefined).type, 'generic_text');
  });
});

describe('detectTaskType — isMultiStep', () => {
  it('flags explicit sequencing connectives', () => {
    assert.equal(
      detectTaskType('Draft an email, then schedule a follow-up call').isMultiStep,
      true,
    );
    assert.equal(detectTaskType('Create a meeting and then notify the team').isMultiStep, true);
    assert.equal(
      detectTaskType('Summarize the notes. After that, email the client').isMultiStep,
      true,
    );
  });

  it('treats parallel actions joined by "and" as a SIMPLE request (not multi-step)', () => {
    // Per Dre: several simple parallel actions are still a simple request — only
    // explicit sequencing makes it multi-step.
    assert.equal(detectTaskType('Create an appointment and add a note').isMultiStep, false);
    assert.equal(detectTaskType('Draft an email and create a meeting').isMultiStep, false);
  });

  it('does not flag a single clean action', () => {
    assert.equal(detectTaskType('Draft an introductory email to Sarah Chen').isMultiStep, false);
    assert.equal(detectTaskType('Schedule a call with the lead').isMultiStep, false);
  });

  it('does not misfire on nouns that look like action verbs', () => {
    // "call" here is the meeting, not the verb.
    assert.equal(detectTaskType('Schedule a call and book a room').isMultiStep, false);
  });
});
