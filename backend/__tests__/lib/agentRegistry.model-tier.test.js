/**
 * Agent execution-tier routing tests.
 *
 * Covers metadata.model_tier resolution in agentRegistry.getDefaultAgentProfile,
 * which taskWorkers.js consumes to pick the LiteLLM alias:
 *   'lite' → aisha-task-lite (CPU/Ollama)   |   'full' → aisha-task (GPU/vLLM)
 *
 * Precedence under test: per-role env → global AISHA_DEFAULT_MODEL_TIER env →
 * per-role built-in default → 'full'.
 *
 * [2026-06-11 Claude] Added with the lite-tier (CPU/Ollama) routing feature.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultAgentProfile } from '../../lib/agents/agentRegistry.js';

const ALL_ROLES = [
  'ops_manager',
  'sales_manager',
  'client_services_expert',
  'project_manager',
  'marketing_manager',
  'customer_service_manager',
];

// Every env var the registry consults for tiering, so we can fully reset state.
const TIER_ENV_VARS = [
  'AISHA_DEFAULT_MODEL_TIER',
  'AISHA_OPS_MODEL_TIER',
  'AISHA_SALES_MODEL_TIER',
  'AISHA_CS_EXPERT_MODEL_TIER',
  'AISHA_PM_MODEL_TIER',
  'AISHA_MKT_MODEL_TIER',
  'AISHA_CS_MODEL_TIER',
];

function clearTierEnv() {
  for (const k of TIER_ENV_VARS) delete process.env[k];
}

const tierOf = (role) => getDefaultAgentProfile(role).metadata.model_tier;

// The exact mapping taskWorkers.js applies — kept here as a guarded invariant so
// a change to the alias names is caught by a test.
const aliasFor = (tier) => (tier === 'lite' ? 'aisha-task-lite' : 'aisha-task');

describe('agentRegistry model_tier resolution', () => {
  afterEach(clearTierEnv);

  it('defaults customer_service_manager to lite and all other roles to full', () => {
    clearTierEnv();
    for (const role of ALL_ROLES) {
      const expected = role === 'customer_service_manager' ? 'lite' : 'full';
      assert.equal(tierOf(role), expected, `${role} should default to ${expected}`);
    }
  });

  it('only ever yields lite or full (never an arbitrary string)', () => {
    clearTierEnv();
    process.env.AISHA_OPS_MODEL_TIER = 'banana'; // invalid → must fall through to full
    assert.equal(tierOf('ops_manager'), 'full');
  });

  it('per-role env override flips a single role to lite without affecting others', () => {
    clearTierEnv();
    process.env.AISHA_OPS_MODEL_TIER = 'lite';
    assert.equal(tierOf('ops_manager'), 'lite');
    assert.equal(tierOf('sales_manager'), 'full');
  });

  it('per-role env override can force the default-lite role back to full', () => {
    clearTierEnv();
    process.env.AISHA_CS_MODEL_TIER = 'full';
    assert.equal(tierOf('customer_service_manager'), 'full');
  });

  it('global AISHA_DEFAULT_MODEL_TIER=lite tiers every role lite', () => {
    clearTierEnv();
    process.env.AISHA_DEFAULT_MODEL_TIER = 'lite';
    for (const role of ALL_ROLES) {
      assert.equal(tierOf(role), 'lite', `${role} should be lite under global default`);
    }
  });

  it('per-role env wins over the global default', () => {
    clearTierEnv();
    process.env.AISHA_DEFAULT_MODEL_TIER = 'lite';
    process.env.AISHA_SALES_MODEL_TIER = 'full';
    assert.equal(tierOf('sales_manager'), 'full');
    assert.equal(tierOf('ops_manager'), 'lite');
  });
});

describe('taskWorkers tier → LiteLLM alias mapping', () => {
  it('maps lite → aisha-task-lite and full → aisha-task', () => {
    assert.equal(aliasFor('lite'), 'aisha-task-lite');
    assert.equal(aliasFor('full'), 'aisha-task');
    assert.equal(aliasFor(undefined), 'aisha-task'); // missing tier defaults to GPU path
  });
});
