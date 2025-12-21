import { describe, it, expect, beforeEach } from 'vitest';
import { addHistoryEntry, getRecentHistory, getSuggestions, __resetSuggestionHistoryForTests } from '../suggestionEngine';

describe('suggestionEngine', () => {
  beforeEach(() => {
    __resetSuggestionHistoryForTests();
  });

  it('returns entity-specific context suggestions for leads routes', () => {
    const context = { tenantId: 't1', routeName: 'leads:list', entity: 'leads' };
    const suggestions = getSuggestions({ context, history: [] });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].command.toLowerCase()).toContain('lead');
    expect(suggestions.every((s) => s.source === 'context' || s.source === 'playbook' || s.source === 'history')).toBe(true);
  });

  it('ranks history commands higher for matching entities', () => {
    const now = new Date().toISOString();
    addHistoryEntry({ intent: 'query', entity: 'opportunities', rawText: 'Show my high-value deals', timestamp: now, origin: 'text' });
    addHistoryEntry({ intent: 'analyze', entity: 'general', rawText: 'Summarize my pipeline', timestamp: new Date(Date.now() - 1000).toISOString(), origin: 'voice' });

    const context = { tenantId: 't1', routeName: 'opportunities:list', entity: 'opportunities' };
    const history = getRecentHistory();
    const suggestions = getSuggestions({ context, history });

    expect(suggestions[0].source).toBe('history');
    expect(suggestions[0].command).toBe('Show my high-value deals');
    expect(suggestions[0].confidence).toBeGreaterThan(suggestions[suggestions.length - 1].confidence);
  });

  it('provides safe generic suggestions when context is ambiguous', () => {
    const context = { tenantId: 't1', entity: 'general' };
    const suggestions = getSuggestions({ context, history: [] });
    expect(suggestions.some((s) => s.command.toLowerCase().includes('pipeline'))).toBe(true);
    expect(suggestions.some((s) => s.command.toLowerCase().includes('tasks'))).toBe(true);
  });
});
