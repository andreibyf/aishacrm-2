/**
 * Tests for isCareWorkflowTriggersEnabled gate helper
 * 
 * PR8: Workflow Webhook Trigger Integration
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { isCareWorkflowTriggersEnabled } = require('./isCareWorkflowTriggersEnabled');

describe('isCareWorkflowTriggersEnabled', () => {
  let originalEnv;

  before(() => {
    originalEnv = process.env.CARE_WORKFLOW_TRIGGERS_ENABLED;
  });

  after(() => {
    if (originalEnv !== undefined) {
      process.env.CARE_WORKFLOW_TRIGGERS_ENABLED = originalEnv;
    } else {
      delete process.env.CARE_WORKFLOW_TRIGGERS_ENABLED;
    }
  });

  it('should return false by default when env var not set', () => {
    delete process.env.CARE_WORKFLOW_TRIGGERS_ENABLED;
    assert.strictEqual(isCareWorkflowTriggersEnabled(), false);
  });

  it('should return false when env var is empty string', () => {
    process.env.CARE_WORKFLOW_TRIGGERS_ENABLED = '';
    assert.strictEqual(isCareWorkflowTriggersEnabled(), false);
  });

  it('should return true when env var is "true"', () => {
    process.env.CARE_WORKFLOW_TRIGGERS_ENABLED = 'true';
    assert.strictEqual(isCareWorkflowTriggersEnabled(), true);
  });

  it('should return true when env var is "1"', () => {
    process.env.CARE_WORKFLOW_TRIGGERS_ENABLED = '1';
    assert.strictEqual(isCareWorkflowTriggersEnabled(), true);
  });

  it('should return true when env var is "yes"', () => {
    process.env.CARE_WORKFLOW_TRIGGERS_ENABLED = 'yes';
    assert.strictEqual(isCareWorkflowTriggersEnabled(), true);
  });

  it('should return true when env var is "TRUE" (case insensitive)', () => {
    process.env.CARE_WORKFLOW_TRIGGERS_ENABLED = 'TRUE';
    assert.strictEqual(isCareWorkflowTriggersEnabled(), true);
  });

  it('should return false when env var is "false"', () => {
    process.env.CARE_WORKFLOW_TRIGGERS_ENABLED = 'false';
    assert.strictEqual(isCareWorkflowTriggersEnabled(), false);
  });

  it('should return false when env var is "0"', () => {
    process.env.CARE_WORKFLOW_TRIGGERS_ENABLED = '0';
    assert.strictEqual(isCareWorkflowTriggersEnabled(), false);
  });

  it('should handle whitespace correctly', () => {
    process.env.CARE_WORKFLOW_TRIGGERS_ENABLED = '  true  ';
    assert.strictEqual(isCareWorkflowTriggersEnabled(), true);
  });
});
