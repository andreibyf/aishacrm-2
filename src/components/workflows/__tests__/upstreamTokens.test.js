/**
 * upstreamTokens.test.js
 *
 * Tests for the upstream token resolver and ENTITY_SCHEMAS.
 *
 * Coverage:
 *  1. getUpstreamTokens — webhook_trigger uses testPayload keys
 *  2. getUpstreamTokens — find_lead emits prefixed tokens
 *  3. getUpstreamTokens — multi-node graph, correct stepIndex labels
 *  4. getUpstreamTokens — target node itself is excluded
 *  5. getUpstreamTokens — http_request emits last_http_status / last_http_response
 *  6. getUpstreamTokens — returns empty array when no upstream nodes
 *  7. getUpstreamTokens — unknown node type is silently skipped
 *  8. tokenToTemplate — wraps bare key in {{ }}
 *  9. tokenToTemplate — leaves existing {{ }} untouched
 * 10. tokenToTemplate — returns empty string for falsy input
 * 11. ENTITY_SCHEMAS — all five entities have required fields
 */

import { describe, it, expect } from 'vitest';
import { getUpstreamTokens, tokenToTemplate, ENTITY_SCHEMAS } from '../upstreamTokens.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const triggerNode = { id: 'n1', type: 'webhook_trigger' };
const findLeadNode = { id: 'n2', type: 'find_lead' };
const createActivityNode = { id: 'n3', type: 'create_activity' };
const httpNode = { id: 'n4', type: 'http_request' };
const unknownNode = { id: 'n5', type: 'some_future_node_type' };

const linearConnections = [
  { from: 'n1', to: 'n2' },
  { from: 'n2', to: 'n3' },
];

const testPayload = { email: 'test@example.com', first_name: 'Jane', company: 'Acme' };

// ─── getUpstreamTokens ─────────────────────────────────────────────────────

describe('[upstreamTokens] getUpstreamTokens', () => {
  it('returns payload keys as tokens for webhook_trigger', () => {
    // Target = n2, upstream = n1 (webhook_trigger)
    const tokens = getUpstreamTokens('n2', [triggerNode, findLeadNode], linearConnections, testPayload);
    const keys = tokens.map((t) => t.key);
    expect(keys).toContain('email');
    expect(keys).toContain('first_name');
    expect(keys).toContain('company');
  });

  it('returns empty token list for webhook_trigger when no testPayload', () => {
    const tokens = getUpstreamTokens('n2', [triggerNode, findLeadNode], linearConnections, null);
    expect(tokens.filter((t) => t.nodeType === 'webhook_trigger')).toHaveLength(0);
  });

  it('attaches example value from testPayload to webhook tokens', () => {
    const tokens = getUpstreamTokens('n2', [triggerNode, findLeadNode], linearConnections, testPayload);
    const emailToken = tokens.find((t) => t.key === 'email');
    expect(emailToken.example).toBe('test@example.com');
  });

  it('emits prefixed tokens for find_lead (found_lead.field)', () => {
    const tokens = getUpstreamTokens(
      'n3',
      [triggerNode, findLeadNode, createActivityNode],
      linearConnections,
      testPayload,
    );
    const leadTokens = tokens.filter((t) => t.nodeType === 'find_lead');
    expect(leadTokens.length).toBeGreaterThan(0);
    const keys = leadTokens.map((t) => t.key);
    expect(keys).toContain('found_lead.email');
    expect(keys).toContain('found_lead.first_name');
    expect(keys).toContain('found_lead.id');
  });

  it('sets correct stepIndex — trigger is step 1, find_lead is step 2', () => {
    const tokens = getUpstreamTokens(
      'n3',
      [triggerNode, findLeadNode, createActivityNode],
      linearConnections,
      testPayload,
    );
    const triggerTokens = tokens.filter((t) => t.nodeType === 'webhook_trigger');
    const leadTokens = tokens.filter((t) => t.nodeType === 'find_lead');
    expect(triggerTokens[0].stepIndex).toBe(1);
    expect(leadTokens[0].stepIndex).toBe(2);
  });

  it('does not include the target node itself in tokens', () => {
    const tokens = getUpstreamTokens(
      'n3',
      [triggerNode, findLeadNode, createActivityNode],
      linearConnections,
      testPayload,
    );
    const activityTokens = tokens.filter((t) => t.nodeType === 'create_activity');
    expect(activityTokens).toHaveLength(0);
  });

  it('returns empty array when target is the first node (no upstream)', () => {
    const tokens = getUpstreamTokens('n1', [triggerNode], [], testPayload);
    expect(tokens).toHaveLength(0);
  });

  it('emits last_http_status and last_http_response for http_request node', () => {
    const nodes = [triggerNode, httpNode, createActivityNode];
    const conns = [{ from: 'n1', to: 'n4' }, { from: 'n4', to: 'n3' }];
    const tokens = getUpstreamTokens('n3', nodes, conns, testPayload);
    const httpTokens = tokens.filter((t) => t.nodeType === 'http_request');
    const keys = httpTokens.map((t) => t.key);
    expect(keys).toContain('last_http_status');
    expect(keys).toContain('last_http_response');
  });

  it('silently skips unknown node types', () => {
    const nodes = [triggerNode, unknownNode, createActivityNode];
    const conns = [{ from: 'n1', to: 'n5' }, { from: 'n5', to: 'n3' }];
    // Should not throw
    expect(() =>
      getUpstreamTokens('n3', nodes, conns, testPayload),
    ).not.toThrow();
    const tokens = getUpstreamTokens('n3', nodes, conns, testPayload);
    const unknownTokens = tokens.filter((t) => t.nodeType === 'some_future_node_type');
    expect(unknownTokens).toHaveLength(0);
  });
});

// ─── tokenToTemplate ───────────────────────────────────────────────────────

describe('[upstreamTokens] tokenToTemplate', () => {
  it('wraps a bare key in {{ }}', () => {
    expect(tokenToTemplate('email')).toBe('{{email}}');
  });

  it('wraps a dotted key in {{ }}', () => {
    expect(tokenToTemplate('found_lead.email')).toBe('{{found_lead.email}}');
  });

  it('leaves an already-wrapped key untouched', () => {
    expect(tokenToTemplate('{{email}}')).toBe('{{email}}');
  });

  it('returns empty string for null', () => {
    expect(tokenToTemplate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(tokenToTemplate(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(tokenToTemplate('')).toBe('');
  });
});

// ─── ENTITY_SCHEMAS ────────────────────────────────────────────────────────

describe('[upstreamTokens] ENTITY_SCHEMAS', () => {
  const requiredByEntity = {
    lead: ['first_name', 'last_name', 'email', 'phone', 'company'],
    contact: ['first_name', 'last_name', 'email', 'phone'],
    account: ['name', 'industry', 'website'],
    opportunity: ['name', 'amount', 'stage'],
    activity: ['subject', 'body', 'status', 'due_date', 'assigned_to'],
  };

  for (const [entity, required] of Object.entries(requiredByEntity)) {
    it(`ENTITY_SCHEMAS.${entity} contains required fields`, () => {
      const values = ENTITY_SCHEMAS[entity].map((f) => f.value);
      for (const field of required) {
        expect(values).toContain(field);
      }
    });

    it(`ENTITY_SCHEMAS.${entity} entries each have value and label`, () => {
      for (const entry of ENTITY_SCHEMAS[entity]) {
        expect(typeof entry.value).toBe('string');
        expect(entry.value.length).toBeGreaterThan(0);
        expect(typeof entry.label).toBe('string');
        expect(entry.label.length).toBeGreaterThan(0);
      }
    });
  }
});
