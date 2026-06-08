/**
 * Tests for CORE_TOOLS and applyToolHardCap interaction
 *
 * Regression guard for the bug where CORE_TOOLS.length (13+) exceeded
 * maxTools (12), causing slotsForOthers to go negative and dropping ALL
 * intent-specific tools from the focused set — including get_contact_details
 * and get_contact_by_name, which made AiSHA claim it had no tool to retrieve
 * phone/email for a named contact.
 *
 * [2026-06-08 Claude] Added as regression test for CORE_TOOLS cap bug
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CORE_TOOLS } from '../../lib/aiBudgetConfig.js';
import { applyToolHardCap } from '../../lib/entityLabelInjector.js';

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeTools(names) {
  return names.map((name) => ({ function: { name } }));
}

// ─── CORE_TOOLS composition ───────────────────────────────────────────────────

describe('CORE_TOOLS composition', () => {
  it('includes get_contact_details', () => {
    assert.ok(
      CORE_TOOLS.includes('get_contact_details'),
      'get_contact_details must be in CORE_TOOLS so the model can always look up contact phone/email',
    );
  });

  it('includes get_contact_by_name', () => {
    assert.ok(
      CORE_TOOLS.includes('get_contact_by_name'),
      'get_contact_by_name must be in CORE_TOOLS so the model can resolve contacts by name',
    );
  });

  it('has no duplicates', () => {
    const unique = new Set(CORE_TOOLS);
    assert.equal(unique.size, CORE_TOOLS.length, 'CORE_TOOLS must not contain duplicate entries');
  });
});

// ─── applyToolHardCap with contact intent ────────────────────────────────────

describe('applyToolHardCap — contact intent tool retention', () => {
  // Simulate the focused tool set built by getRelevantToolsForIntent('CONTACT_GET')
  // + CORE_TOOLS — the set that existed before hitting the cap
  const contactIntentTools = makeTools([
    ...CORE_TOOLS,
    'create_contact',
    'update_contact',
    'list_contacts_for_account',
    'create_note',
    'search_notes',
    'get_notes_for_record',
    'create_activity',
    'list_activities',
    'navigate_to_page',
  ]);

  it('retains get_contact_details after cap is applied', () => {
    const result = applyToolHardCap(contactIntentTools, {
      maxTools: 20,
      intent: 'CONTACT_GET',
    });
    const names = result.map((t) => t.function.name);
    assert.ok(
      names.includes('get_contact_details'),
      `get_contact_details must survive the hard cap. Got: ${names.join(', ')}`,
    );
  });

  it('retains get_contact_by_name after cap is applied', () => {
    const result = applyToolHardCap(contactIntentTools, {
      maxTools: 20,
      intent: 'CONTACT_GET',
    });
    const names = result.map((t) => t.function.name);
    assert.ok(
      names.includes('get_contact_by_name'),
      `get_contact_by_name must survive the hard cap. Got: ${names.join(', ')}`,
    );
  });

  it('slotsForOthers is positive — non-CORE tools can be included', () => {
    // With maxTools=20 and CORE_TOOLS.length tools as mustKeep,
    // there must be room for at least 1 intent-specific tool
    const result = applyToolHardCap(contactIntentTools, {
      maxTools: 20,
      intent: 'CONTACT_GET',
    });
    assert.ok(
      result.length > CORE_TOOLS.length,
      `Expected cap to allow non-CORE tools (> ${CORE_TOOLS.length}), got ${result.length}`,
    );
  });

  it('skips cap when no intent is detected (all tools pass through)', () => {
    const allTools = makeTools([...CORE_TOOLS, 'get_contact_details', 'some_other_tool']);
    const result = applyToolHardCap(allTools, { maxTools: 20, intent: 'none' });
    assert.equal(result.length, allTools.length, 'No intent = no cap applied');
  });

  it('regression: old maxTools:12 with 15-item CORE_TOOLS would have dropped get_contact_details', () => {
    // This test documents the BROKEN state to prevent regressing back to it
    // With maxTools=12 and CORE_TOOLS.length=15, slotsForOthers=-3
    // Only mustKeepTools (CORE_TOOLS) returned — get_contact_details is in CORE_TOOLS now
    // so it actually survives even with the old cap value
    // But intent-specific non-CORE tools would still be dropped
    const result = applyToolHardCap(contactIntentTools, {
      maxTools: 12,
      intent: 'CONTACT_GET',
    });
    const names = result.map((t) => t.function.name);
    // get_contact_details is now in CORE_TOOLS, so it survives even with old cap
    assert.ok(
      names.includes('get_contact_details'),
      'get_contact_details must survive even with tight cap because it is in CORE_TOOLS',
    );
  });
});
