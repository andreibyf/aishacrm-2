import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { classifyIntent } from './intentClassifier';

describe('intentClassifier', () => {
  beforeAll(() => { (window as any).__DISABLE_GLOBAL_FETCH_STUB = true; });
  afterAll(() => { delete (window as any).__DISABLE_GLOBAL_FETCH_STUB; });
  it('detects list intent for leads with timeframe', () => {
    const result = classifyIntent('Show me all leads due today');
    expect(result.intent).toBe('list_records');
    expect(result.entity).toBe('leads');
    expect(result.filters.timeframe).toBe('today');
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('detects forecast intent for pipeline', () => {
    const result = classifyIntent('Give me a pipeline forecast for this quarter');
    expect(result.intent).toBe('forecast');
    expect(result.entity === 'pipeline' || result.entity === 'leads').toBeTruthy();
    expect(result.filters.timeframe).toBe('this_quarter');
  });

  it('classifies summaries request when summarizing activities', () => {
    const result = classifyIntent('Summaries of activities for my team this week');
    expect(result.intent).toBe('summaries');
    expect(result.entity === 'activities' || result.entity === 'tasks').toBeTruthy();
    expect(result.filters.owner).toBe('team');
    expect(result.filters.timeframe).toBe('this_week');
  });

  it('falls back when ambiguous', () => {
    const result = classifyIntent('hi');
    expect(result.intent).toBe('generic_question');
    expect(result.entity).toBe('general');
    expect(result.confidence).toBeLessThan(0.4);
  });
});
