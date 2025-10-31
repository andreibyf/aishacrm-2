import { assert } from './testUtils';
import { createError, handleApiError } from '../shared/ErrorLogger';

export const errorLoggerTests = {
  name: 'Error Logger',
  tests: [
    {
      name: 'createError should create error with correct structure',
      fn: async () => {
        const error = createError('TestComponent', 'Test error message', {
          status: 500,
          severity: 'critical',
          actionable: 'Test action'
        });

        assert.equal(error.component, 'TestComponent');
        assert.equal(error.message, 'Test error message');
        assert.equal(error.status, 500);
        assert.equal(error.severity, 'critical');
        assert.equal(error.actionable, 'Test action');
      }
    },
    {
      name: 'createError should default severity to error',
      fn: async () => {
        const error = createError('TestComponent', 'Test error');
        assert.equal(error.severity, 'error');
      }
    },
    {
      name: 'handleApiError should map 403 status correctly',
      fn: async () => {
        const apiError = {
          response: { status: 403 },
          message: 'Forbidden'
        };

        const error = handleApiError('TestComponent', apiError);

        assert.equal(error.component, 'TestComponent');
        assert.equal(error.message, 'Permission denied');
        assert.equal(error.severity, 'warning');
        assert.equal(error.status, 403);
        assert.truthy(error.actionable);
      }
    },
    {
      name: 'handleApiError should map 429 status correctly',
      fn: async () => {
        const apiError = {
          response: { status: 429 }
        };

        const error = handleApiError('TestComponent', apiError);

        assert.equal(error.message, 'Rate limit exceeded');
        assert.equal(error.severity, 'warning');
      }
    },
    {
      name: 'handleApiError should map 500 status correctly',
      fn: async () => {
        const apiError = {
          response: { status: 500 }
        };

        const error = handleApiError('TestComponent', apiError);

        assert.equal(error.message, 'Server error');
        assert.equal(error.severity, 'critical');
      }
    },
    {
      name: 'handleApiError should map 502 status correctly',
      fn: async () => {
        const apiError = {
          response: { status: 502 }
        };

        const error = handleApiError('TestComponent', apiError);

        assert.equal(error.message, 'Backend unavailable');
        assert.equal(error.severity, 'critical');
      }
    },
    {
      name: 'handleApiError should map 504 status correctly',
      fn: async () => {
        const apiError = {
          response: { status: 504 }
        };

        const error = handleApiError('TestComponent', apiError);

        assert.equal(error.message, 'Request timeout');
        assert.equal(error.severity, 'warning');
      }
    },
    {
      name: 'handleApiError should handle unknown status codes',
      fn: async () => {
        const apiError = {
          response: { status: 418 },
          message: 'I am a teapot'
        };

        const error = handleApiError('TestComponent', apiError);

        assert.equal(error.message, 'I am a teapot');
        assert.equal(error.severity, 'error');
      }
    },
    {
      name: 'handleApiError should handle errors without response',
      fn: async () => {
        const apiError = {
          message: 'Network error'
        };

        const error = handleApiError('TestComponent', apiError);

        assert.equal(error.message, 'Network error');
        assert.exists(error.actionable);
      }
    }
  ]
};