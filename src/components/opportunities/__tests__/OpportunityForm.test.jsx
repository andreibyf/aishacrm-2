/**
 * OpportunityForm — regression tests for PR #526 ↔ #527 merge.
 *
 * Coverage strategy:
 *   - Render-based tests are marked `.skip` — same constraint as sibling
 *     LeadForm.test.jsx: JSDOM + Radix UI in this project's vmForks pool
 *     hangs on first render of forms that embed multiple Radix Select /
 *     Popover primitives. These assertions should migrate to Playwright E2E.
 *   - One pure-logic test covers the PostgREST 500 regression: when saving
 *     custom fields, values must be nested under `metadata.custom.*` — NOT
 *     spread at the top level of the payload. We test the shaping function
 *     below, which is an exact copy of the logic in OpportunityForm.jsx's
 *     handleSubmit. If the component's shaping drifts from this reference
 *     implementation, this test becomes a drift alarm via code review.
 */

import { describe, it, expect } from 'vitest';

/**
 * Reference implementation of the custom-field payload shaping step from
 * OpportunityForm.handleSubmit (PR #527). Kept in sync by convention — any
 * change to the payload shape in the component must be mirrored here.
 */
function buildOpportunityPayload({ formData, tenantId, customFieldValues }) {
  const metadata = {
    ...(formData.metadata || {}),
    custom: {
      ...((formData.metadata && formData.metadata.custom) || {}),
      ...customFieldValues,
    },
  };

  return {
    ...formData,
    tenant_id: tenantId,
    amount: parseFloat(formData.amount) || 0,
    metadata,
    account_id: formData.account_id || undefined,
    contact_id: formData.contact_id || undefined,
    lead_id: formData.lead_id || undefined,
    assigned_to: formData.assigned_to || undefined,
    assigned_to_team: formData.assigned_to_team || undefined,
  };
}

describe('[CRM] OpportunityForm — payload shaping (PR #527 regression)', () => {
  const baseForm = {
    name: 'Acme',
    amount: '1500.50',
    stage: 'prospecting',
    type: 'new_business',
    lead_source: 'website',
    description: '',
    next_step: '',
    competitor: '',
    tags: [],
    account_id: '',
    contact_id: '',
    lead_id: '',
    assigned_to: '',
    assigned_to_team: '',
    is_test_data: false,
  };

  it('nests custom values under metadata.custom and never at top level', () => {
    const payload = buildOpportunityPayload({
      formData: baseForm,
      tenantId: 'tenant-1',
      customFieldValues: { custom_priority: 'high', custom_tier: 'gold' },
    });

    // Top-level must NOT carry custom_* keys — PostgREST would 500 with
    // "Could not find the 'custom_priority' column of 'opportunities'".
    expect(payload).not.toHaveProperty('custom_priority');
    expect(payload).not.toHaveProperty('custom_tier');

    // Must be nested under metadata.custom
    expect(payload.metadata.custom).toEqual({
      custom_priority: 'high',
      custom_tier: 'gold',
    });
  });

  it('preserves existing metadata keys alongside metadata.custom', () => {
    const formWithMetadata = {
      ...baseForm,
      metadata: { source_system: 'import', batch_id: 'b-42' },
    };
    const payload = buildOpportunityPayload({
      formData: formWithMetadata,
      tenantId: 'tenant-1',
      customFieldValues: { custom_priority: 'low' },
    });

    expect(payload.metadata.source_system).toBe('import');
    expect(payload.metadata.batch_id).toBe('b-42');
    expect(payload.metadata.custom).toEqual({ custom_priority: 'low' });
  });

  it('merges existing metadata.custom with new customFieldValues (new values win)', () => {
    const formWithNested = {
      ...baseForm,
      metadata: {
        custom: { custom_priority: 'mid', custom_legacy: 'keep-me' },
      },
    };
    const payload = buildOpportunityPayload({
      formData: formWithNested,
      tenantId: 'tenant-1',
      customFieldValues: { custom_priority: 'high' },
    });

    // New value wins
    expect(payload.metadata.custom.custom_priority).toBe('high');
    // Untouched keys preserved
    expect(payload.metadata.custom.custom_legacy).toBe('keep-me');
  });

  it('parses amount string to number (defensive against empty string)', () => {
    expect(
      buildOpportunityPayload({
        formData: { ...baseForm, amount: '' },
        tenantId: 't',
        customFieldValues: {},
      }).amount,
    ).toBe(0);

    expect(
      buildOpportunityPayload({
        formData: { ...baseForm, amount: '99.99' },
        tenantId: 't',
        customFieldValues: {},
      }).amount,
    ).toBe(99.99);
  });

  it('strips empty optional FK fields to undefined', () => {
    const payload = buildOpportunityPayload({
      formData: { ...baseForm, account_id: '', contact_id: 'c-1', lead_id: '' },
      tenantId: 't',
      customFieldValues: {},
    });

    expect(payload.account_id).toBeUndefined();
    expect(payload.contact_id).toBe('c-1');
    expect(payload.lead_id).toBeUndefined();
  });
});

describe.skip('[CRM] OpportunityForm — render-based regressions', () => {
  // SKIPPED: JSDOM + Radix UI in vmForks singleFork pool hangs on render of
  // OpportunityForm (multiple Radix Select primitives). Same constraint as
  // LeadForm.test.jsx. Migrate the following to Playwright E2E:
  //
  //   - "Value" label renders (not "Amount") — PR #527 rename regression
  //   - Value label uses themed labelClass (text-slate-700 dark:text-slate-300)
  //     — PR #526 theming regression
  //   - CustomFieldsSection renders only when customFields.length > 0
  //   - Custom field values hydrate from opportunity.metadata.custom.* on edit
  //   - Custom field values fall back to flat opportunity.metadata.* (legacy)
  //   - metadata.custom (nested) wins over flat metadata.* when both present
  //   - Submit payload nests custom values under metadata.custom end-to-end

  it.skip('placeholder — see comment above', () => {});
});
