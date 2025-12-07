/**
 * Goal Router Integration Tests
 * 
 * Tests the goal-based routing flow for the AI operator.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

// Mock Redis store for testing (not used in pure unit tests)
const _mockRedisStore = new Map();
const _mockRedisClient = {
  get: async (key) => _mockRedisStore.get(key) || null,
  set: async (key, value, _options) => {
    _mockRedisStore.set(key, value);
    return 'OK';
  },
  del: async (key) => {
    _mockRedisStore.delete(key);
    return 1;
  },
  expire: async (key, _seconds) => {
    return _mockRedisStore.has(key) ? 1 : 0;
  },
};

// We need to mock the module before imports
// Since this is a unit test, we'll test components individually

describe('Goal Router - Intent Detection', async () => {
  // Dynamically import after mocks are set up
  const { detectGoalIntent } = await import('../middleware/routerGuard.js');
  
  it('should detect schedule_call intent', () => {
    const result = detectGoalIntent('Schedule a call with John tomorrow');
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.goalType, 'schedule_call');
  });
  
  it('should detect book_meeting intent', () => {
    const result = detectGoalIntent('Book a meeting with the team next Monday');
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.goalType, 'book_meeting');
  });
  
  it('should detect send_email intent', () => {
    const result = detectGoalIntent('Send an email to Sarah about the proposal');
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.goalType, 'send_email');
  });
  
  it('should detect create_reminder intent', () => {
    const result = detectGoalIntent('Remind me to follow up next week');
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.goalType, 'create_reminder');
  });
  
  it('should not detect intent for normal chat', () => {
    const result = detectGoalIntent('What leads do I have?');
    assert.strictEqual(result.detected, false);
    assert.strictEqual(result.goalType, null);
  });
  
  it('should not detect intent for greeting', () => {
    const result = detectGoalIntent('Hello, how are you?');
    assert.strictEqual(result.detected, false);
    assert.strictEqual(result.goalType, null);
  });
});

describe('Goal Router - Response Classification', async () => {
  const { classifyResponse } = await import('../flows/continueGoalFlow.js');
  
  it('should classify "yes" as confirm', () => {
    assert.strictEqual(classifyResponse('yes'), 'confirm');
    assert.strictEqual(classifyResponse('Yes'), 'confirm');
    assert.strictEqual(classifyResponse('yeah'), 'confirm');
    assert.strictEqual(classifyResponse('sure'), 'confirm');
    assert.strictEqual(classifyResponse('ok'), 'confirm');
    assert.strictEqual(classifyResponse('proceed'), 'confirm');
  });
  
  it('should classify "no" as cancel', () => {
    assert.strictEqual(classifyResponse('no'), 'cancel');
    assert.strictEqual(classifyResponse('cancel'), 'cancel');
    assert.strictEqual(classifyResponse('stop'), 'cancel');
    assert.strictEqual(classifyResponse('nevermind'), 'cancel');
  });
  
  it('should classify reschedule requests', () => {
    assert.strictEqual(classifyResponse('reschedule for tomorrow'), 'reschedule');
    assert.strictEqual(classifyResponse('change the time'), 'reschedule');
    assert.strictEqual(classifyResponse('different time please'), 'reschedule');
  });
  
  it('should classify time info as provide_info', () => {
    assert.strictEqual(classifyResponse('tomorrow at 3pm'), 'provide_info');
    assert.strictEqual(classifyResponse('next Monday at 10am'), 'provide_info');
  });
  
  it('should classify unknown input as unclear', () => {
    assert.strictEqual(classifyResponse('what about my leads?'), 'unclear');
    assert.strictEqual(classifyResponse('hello'), 'unclear');
  });
});

describe('Goal Router - DateTime Extraction', async () => {
  const { extractDateTime } = await import('../flows/initializeNewGoalFlow.js');
  
  it('should extract time from "tomorrow at 2pm"', () => {
    const result = extractDateTime('schedule a call tomorrow at 2pm');
    assert.ok(result, 'Should extract datetime');
    assert.strictEqual(result.time, '14:00');
  });
  
  it('should extract time from "at 3:30pm"', () => {
    const result = extractDateTime('meeting at 3:30pm tomorrow');
    assert.ok(result, 'Should extract datetime');
    assert.strictEqual(result.time, '15:30');
  });
  
  it('should handle morning time "at 10am"', () => {
    const result = extractDateTime('call tomorrow at 10am');
    assert.ok(result, 'Should extract datetime');
    assert.strictEqual(result.time, '10:00');
  });
  
  it('should return null for text without date/time', () => {
    const result = extractDateTime('just call John when you can');
    assert.strictEqual(result, null);
  });
});

describe('Goal Router - Lead Name Extraction', async () => {
  const { extractLeadName } = await import('../flows/initializeNewGoalFlow.js');
  
  it('should extract lead name from "with John Smith"', () => {
    const result = extractLeadName('schedule a call with John Smith tomorrow');
    assert.strictEqual(result, 'John Smith');
  });
  
  it('should extract lead name from "call John"', () => {
    const result = extractLeadName('call John tomorrow at 2pm');
    assert.strictEqual(result, 'John');
  });
  
  it('should skip common words like "me" and "tomorrow"', () => {
    // "with me" should not match
    const result = extractLeadName('remind me to call them');
    // Should not extract "me" as a name
    assert.ok(!result || result.toLowerCase() !== 'me');
  });
});

console.log('Goal Router Unit Tests - Run with: node --test backend/__tests__/goalRouter.test.js');
