import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAgentCharter,
  SALES_MANAGER_CHARTER,
  CUSTOMER_SERVICE_CHARTER,
  CHARTER_MAP,
} from '../../lib/agentCharters.js';

describe('agentCharters', () => {
  it('returns empty string for invalid/unknown agent names', () => {
    assert.equal(getAgentCharter(), '');
    assert.equal(getAgentCharter(null), '');
    assert.equal(getAgentCharter(123), '');
    assert.equal(getAgentCharter('Unknown Agent'), '');
  });

  it('returns expected charters for known agent names', () => {
    const sales = getAgentCharter('Sales Manager');
    const service = getAgentCharter('Customer Service Manager');

    assert.equal(sales, SALES_MANAGER_CHARTER.trim());
    assert.equal(service, CUSTOMER_SERVICE_CHARTER.trim());
    assert.match(sales, /Sales Manager Agent/i);
    assert.match(service, /Customer Service Manager Agent/i);
  });

  it('exports frozen charter map values that align with access function', () => {
    assert.equal(typeof CHARTER_MAP, 'object');
    assert.equal(CHARTER_MAP['Sales Manager'], getAgentCharter('Sales Manager'));
    assert.equal(
      CHARTER_MAP['Customer Service Manager'],
      getAgentCharter('Customer Service Manager'),
    );
  });
});
