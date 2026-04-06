import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStatusLabelMap,
  resolveStatusId,
  normalizeToolArgs,
} from '../../lib/statusCardLabelResolver.js';

describe('statusCardLabelResolver', () => {
  it('builds label maps for string and object card formats', () => {
    const dictionary = {
      statusCards: {
        entities: {
          leads: ['new', 'warm'],
          opportunities: [{ id: 'qualified', label: 'Qualified' }],
        },
      },
    };

    const map = buildStatusLabelMap(dictionary);

    assert.equal(map.leads.new, 'new');
    assert.equal(map.leads.warm, 'warm');
    assert.equal(map.opportunities.qualified, 'qualified');
    assert.equal(map.opportunities['qualified'], 'qualified');
  });

  it('resolves status IDs case-insensitively', () => {
    const statusLabelMap = {
      leads: { warm: 'warm', contacted: 'contacted' },
    };

    assert.equal(
      resolveStatusId({ statusLabelMap, entityType: 'leads', status: ' Warm ' }),
      'warm',
    );
    assert.equal(resolveStatusId({ statusLabelMap, entityType: 'leads', status: 'x' }), null);
  });

  it('normalizes tool args for leads and opportunities', () => {
    const statusLabelMap = {
      leads: { warm: 'warm' },
      opportunities: { qualified: 'qualified' },
    };

    const leadArgs = { status: 'Warm' };
    normalizeToolArgs({ toolName: 'search_leads', args: leadArgs, statusLabelMap });
    assert.equal(leadArgs.status, 'warm');

    const oppArgs = { stage: 'Qualified' };
    normalizeToolArgs({
      toolName: 'list_opportunities_by_stage',
      args: oppArgs,
      statusLabelMap,
    });
    assert.equal(oppArgs.stage, 'qualified');
  });
});
