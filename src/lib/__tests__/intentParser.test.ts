import { describe, expect, it } from 'vitest';
import { parseIntent } from '../intentParser';

describe('intentParser', () => {
  it('detects query intent with geographic and date filters', () => {
    const result = parseIntent('Show my leads in Florida created this month');
    expect(result.intent).toBe('query');
    expect(result.entity).toBe('leads');
    expect(result.filters.states).toEqual(['Florida']);
    expect(result.filters.dateRange?.label).toBe('this_month');
    expect(result.filters.owner).toBe('me');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('detects create intent for new lead requests', () => {
    const result = parseIntent('Create a new lead for John Smith at Acme');
    expect(result.intent).toBe('create');
    expect(result.entity).toBe('leads');
    expect(result.isAmbiguous).toBe(false);
    expect(result.isPotentiallyDestructive).toBe(false);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('extracts status cues for stalled deals', () => {
    const result = parseIntent('Update the status of my stalled deals');
    expect(result.intent).toBe('update');
    expect(result.entity).toBe('opportunities');
    expect(result.filters.statuses).toContain('stalled');
    expect(result.filters.owner).toBe('me');
  });

  it('flags destructive delete commands without mapping to execution', () => {
    const result = parseIntent('Delete all my leads');
    expect(result.intent).toBe('ambiguous');
    expect(result.isPotentiallyDestructive).toBe(true);
    expect(result.isAmbiguous).toBe(true);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('classifies summarize instructions as analyze intents', () => {
    const result = parseIntent('Summarize my pipeline and next actions');
    expect(result.intent).toBe('analyze');
    expect(result.entity).toBe('opportunities');
    expect(result.isMultiStep).toBe(true);
  });

  it('identifies navigation commands for dashboard and accounts', () => {
    const dashboard = parseIntent('Go to dashboard');
    expect(dashboard.intent).toBe('navigate');
    expect(dashboard.entity).toBe('dashboard');

    const accounts = parseIntent('Open accounts view');
    expect(accounts.intent).toBe('navigate');
    expect(accounts.entity).toBe('accounts');
  });

  it('marks clearly ambiguous inputs with low confidence', () => {
    const result = parseIntent('maybe do something?');
    expect(result.intent).toBe('ambiguous');
    expect(result.isAmbiguous).toBe(true);
    expect(result.confidence).toBeLessThan(0.5);
  });
});
