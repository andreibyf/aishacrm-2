/**
 * Unit tests for registry fallback/merge helpers in braidMetrics route.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistryFallback, mergeRegistryToolMetrics } from '../../routes/braidMetrics.js';

const TOOL_GRAPH_FIXTURE = {
  search_accounts: { category: 'ACCOUNTS', policy: 'read' },
  create_lead: { category: 'LEADS', policy: 'write' },
  health_check: {},
};

describe('braidMetrics registry merge helpers', () => {
  it('buildRegistryFallback marks tools as unused with null health scores', () => {
    const tools = buildRegistryFallback(TOOL_GRAPH_FIXTURE);
    assert.equal(tools.length, 3);
    assert.equal(tools[0].name, 'search_accounts');
    assert.equal(tools[0].category, 'ACCOUNTS');
    assert.equal(tools[0].policy, 'read');
    assert.equal(tools[0].healthStatus, 'unused');
    assert.equal(tools[0].healthScore, null);
    assert.equal(tools[0].successRate, null);
  });

  it('defaults category to GENERAL and policy to null when missing', () => {
    const tools = buildRegistryFallback(TOOL_GRAPH_FIXTURE);
    const healthCheck = tools.find((t) => t.name === 'health_check');
    assert.equal(healthCheck.category, 'GENERAL');
    assert.equal(healthCheck.policy, null);
  });

  it('returns registry-only source when audit tools are empty', () => {
    const merged = mergeRegistryToolMetrics([], TOOL_GRAPH_FIXTURE);
    assert.equal(merged.fromRegistry, true);
    assert.equal(merged.auditedTools, 0);
    assert.equal(merged.tools.length, 3);
    assert.ok(merged.tools.every((t) => t._fromRegistry === true));
    assert.ok(merged.tools.every((t) => t.healthStatus === 'unused'));
  });

  it('merges missing registry tools when audit data is partial', () => {
    const merged = mergeRegistryToolMetrics(
      [
        {
          name: 'search_accounts',
          category: 'ACCOUNTS',
          calls: 10,
          healthStatus: 'healthy',
          healthScore: 99,
        },
      ],
      TOOL_GRAPH_FIXTURE,
    );

    assert.equal(merged.fromRegistry, false);
    assert.equal(merged.auditedTools, 1);
    assert.equal(merged.tools.length, 3);
    assert.ok(merged.tools.some((t) => t.name === 'search_accounts' && !t._fromRegistry));
    assert.ok(
      merged.tools.some(
        (t) => t.name === 'create_lead' && t._fromRegistry === true && t.healthStatus === 'unused',
      ),
    );
    assert.ok(
      merged.tools.some(
        (t) => t.name === 'health_check' && t._fromRegistry === true && t.healthStatus === 'unused',
      ),
    );
  });
});
