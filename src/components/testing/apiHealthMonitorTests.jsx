import { assert } from './testUtils';
import apiHealthMonitor from '../../utils/apiHealthMonitor';

export const apiHealthMonitorTests = {
  name: 'API Health Monitor',
  tests: [
    {
      name: 'Should track 404 missing endpoints',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportMissingEndpoint('/api/test-endpoint', { method: 'GET' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalMissingEndpoints, 1);
        assert.equal(report.missingEndpoints.length, 1);
        assert.equal(report.missingEndpoints[0].endpoint, '/api/test-endpoint');
      }
    },
    {
      name: 'Should track multiple missing endpoints',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportMissingEndpoint('/api/endpoint1', { method: 'GET' });
        apiHealthMonitor.reportMissingEndpoint('/api/endpoint2', { method: 'POST' });
        apiHealthMonitor.reportMissingEndpoint('/api/endpoint3', { method: 'PUT' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalMissingEndpoints, 3);
        assert.equal(report.missingEndpoints.length, 3);
      }
    },
    {
      name: 'Should increment count for repeated missing endpoints',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportMissingEndpoint('/api/test', { method: 'GET' });
        apiHealthMonitor.reportMissingEndpoint('/api/test', { method: 'GET' });
        apiHealthMonitor.reportMissingEndpoint('/api/test', { method: 'GET' });
        
        const report = apiHealthMonitor.getHealthReport();
        const endpoint = report.missingEndpoints.find(e => e.endpoint === '/api/test');
        assert.exists(endpoint);
        assert.equal(endpoint.count, 3);
      }
    },
    {
      name: 'Should track server errors (500)',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportServerError('/api/users', 500, { message: 'Internal Server Error' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalServerErrors, 1);
        assert.equal(report.serverErrors.length, 1);
        assert.equal(report.serverErrors[0].endpoint, '/api/users');
      }
    },
    {
      name: 'Should track different server error codes',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportServerError('/api/test1', 500, { message: 'Internal Server Error' });
        apiHealthMonitor.reportServerError('/api/test2', 502, { message: 'Bad Gateway' });
        apiHealthMonitor.reportServerError('/api/test3', 503, { message: 'Service Unavailable' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalServerErrors, 3);
        assert.equal(report.serverErrors.length, 3);
      }
    },
    {
      name: 'Should track auth errors (401/403)',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportAuthError('/api/protected', 403, { message: 'Forbidden' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalAuthErrors, 1);
        assert.equal(report.authErrors.length, 1);
        assert.equal(report.authErrors[0].endpoint, '/api/protected');
      }
    },
    {
      name: 'Should track both 401 and 403 auth errors',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportAuthError('/api/unauthorized', 401, { message: 'Unauthorized' });
        apiHealthMonitor.reportAuthError('/api/forbidden', 403, { message: 'Forbidden' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalAuthErrors, 2);
        assert.equal(report.authErrors.length, 2);
      }
    },
    {
      name: 'Should track rate limit errors (429)',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportRateLimitError('/api/search', { message: 'Too Many Requests' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalRateLimitErrors, 1);
        assert.equal(report.rateLimitErrors.length, 1);
        assert.equal(report.rateLimitErrors[0].endpoint, '/api/search');
      }
    },
    {
      name: 'Should increment rate limit count',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportRateLimitError('/api/search', { message: 'Too Many Requests' });
        apiHealthMonitor.reportRateLimitError('/api/search', { message: 'Too Many Requests' });
        
        const report = apiHealthMonitor.getHealthReport();
        const error = report.rateLimitErrors.find(e => e.endpoint === '/api/search');
        assert.exists(error);
        assert.equal(error.count, 2);
      }
    },
    {
      name: 'Should track timeout errors',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportTimeoutError('/api/slow-endpoint', { message: 'Request timeout' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalTimeoutErrors, 1);
        assert.equal(report.timeoutErrors.length, 1);
        assert.equal(report.timeoutErrors[0].endpoint, '/api/slow-endpoint');
      }
    },
    {
      name: 'Should track multiple timeout errors',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportTimeoutError('/api/slow1', { message: 'timeout' });
        apiHealthMonitor.reportTimeoutError('/api/slow2', { message: 'timeout' });
        apiHealthMonitor.reportTimeoutError('/api/slow3', { message: 'timeout' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalTimeoutErrors, 3);
        assert.equal(report.timeoutErrors.length, 3);
      }
    },
    {
      name: 'Should track network errors',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportNetworkError('/api/unreachable', { error: 'Network Error', details: 'Failed to fetch' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalNetworkErrors, 1);
        assert.equal(report.networkErrors.length, 1);
        assert.equal(report.networkErrors[0].endpoint, '/api/unreachable');
      }
    },
    {
      name: 'Should track different network error types',
      fn: async () => {
        apiHealthMonitor.reset();
        apiHealthMonitor.reportNetworkError('/api/test1', { error: 'Network Error', details: 'Failed to fetch' });
        apiHealthMonitor.reportNetworkError('/api/test2', { error: 'Network Error', details: 'Connection refused' });
        apiHealthMonitor.reportNetworkError('/api/test3', { error: 'Network Error', details: 'DNS lookup failed' });
        
        const report = apiHealthMonitor.getHealthReport();
        assert.equal(report.totalNetworkErrors, 3);
        assert.equal(report.networkErrors.length, 3);
      }
    },
    {
      name: 'Should reset all error counts',
      fn: async () => {
        apiHealthMonitor.reset();
        
        // Add various errors
        apiHealthMonitor.reportMissingEndpoint('/api/test1', { method: 'GET' });
        apiHealthMonitor.reportServerError('/api/test2', 500, { message: 'Error' });
        apiHealthMonitor.reportAuthError('/api/test3', 403, { message: 'Forbidden' });
        apiHealthMonitor.reportRateLimitError('/api/test4', { message: 'Too Many' });
        apiHealthMonitor.reportTimeoutError('/api/test5', { message: 'Timeout' });
        apiHealthMonitor.reportNetworkError('/api/test6', { error: 'Network', details: 'Failed' });
        
        const reportBefore = apiHealthMonitor.getHealthReport();
        assert.equal(reportBefore.totalMissingEndpoints, 1);
        assert.equal(reportBefore.totalServerErrors, 1);
        assert.equal(reportBefore.totalAuthErrors, 1);
        assert.equal(reportBefore.totalRateLimitErrors, 1);
        assert.equal(reportBefore.totalTimeoutErrors, 1);
        assert.equal(reportBefore.totalNetworkErrors, 1);
        
        // Reset
        apiHealthMonitor.reset();
        
        const reportAfter = apiHealthMonitor.getHealthReport();
        assert.equal(reportAfter.totalMissingEndpoints, 0);
        assert.equal(reportAfter.totalServerErrors, 0);
        assert.equal(reportAfter.totalAuthErrors, 0);
        assert.equal(reportAfter.totalRateLimitErrors, 0);
        assert.equal(reportAfter.totalTimeoutErrors, 0);
        assert.equal(reportAfter.totalNetworkErrors, 0);
      }
    },
    {
      name: 'Should generate comprehensive health report',
      fn: async () => {
        apiHealthMonitor.reset();
        
        // Add one of each error type
        apiHealthMonitor.reportMissingEndpoint('/api/missing', { method: 'GET' });
        apiHealthMonitor.reportServerError('/api/server', 500, { message: 'Error' });
        apiHealthMonitor.reportAuthError('/api/auth', 403, { message: 'Forbidden' });
        apiHealthMonitor.reportRateLimitError('/api/rate', { message: 'Too Many' });
        apiHealthMonitor.reportTimeoutError('/api/timeout', { message: 'Timeout' });
        apiHealthMonitor.reportNetworkError('/api/network', { error: 'Network', details: 'Failed' });
        
        const report = apiHealthMonitor.getHealthReport();
        
        // Verify report structure
        assert.exists(report.missingEndpoints);
        assert.exists(report.serverErrors);
        assert.exists(report.authErrors);
        assert.exists(report.rateLimitErrors);
        assert.exists(report.timeoutErrors);
        assert.exists(report.networkErrors);
        assert.exists(report.totalMissingEndpoints);
        assert.exists(report.totalServerErrors);
        assert.exists(report.totalAuthErrors);
        assert.exists(report.totalRateLimitErrors);
        assert.exists(report.totalTimeoutErrors);
        assert.exists(report.totalNetworkErrors);
        assert.exists(report.totalErrors);
        
        // Verify all have content
        assert.equal(report.totalMissingEndpoints, 1);
        assert.equal(report.totalServerErrors, 1);
        assert.equal(report.totalAuthErrors, 1);
        assert.equal(report.totalRateLimitErrors, 1);
        assert.equal(report.totalTimeoutErrors, 1);
        assert.equal(report.totalNetworkErrors, 1);
        assert.equal(report.totalErrors, 6);
      }
    },
    {
      name: 'Should store timestamp with each error',
      fn: async () => {
        apiHealthMonitor.reset();
        
        const before = new Date();
        apiHealthMonitor.reportMissingEndpoint('/api/test', { method: 'GET' });
        const after = new Date();
        
        const report = apiHealthMonitor.getHealthReport();
        const error = report.missingEndpoints.find(e => e.endpoint === '/api/test');
        
        assert.exists(error);
        assert.exists(error.firstSeen);
        const timestamp = new Date(error.firstSeen);
        assert.true(timestamp >= before, 'Timestamp should be >= start time');
        assert.true(timestamp <= after, 'Timestamp should be <= end time');
      }
    },
    {
      name: 'Should update lastSeen on repeated errors',
      fn: async () => {
        apiHealthMonitor.reset();
        
        apiHealthMonitor.reportMissingEndpoint('/api/test', { method: 'GET' });
        const report1 = apiHealthMonitor.getHealthReport();
        const firstSeen = new Date(report1.missingEndpoints.find(e => e.endpoint === '/api/test').lastSeen);
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 10));
        
        apiHealthMonitor.reportMissingEndpoint('/api/test', { method: 'GET' });
        const report2 = apiHealthMonitor.getHealthReport();
        const lastSeen = new Date(report2.missingEndpoints.find(e => e.endpoint === '/api/test').lastSeen);
        
        assert.true(lastSeen >= firstSeen, 'lastSeen should be updated or equal');
      }
    },
    {
      name: 'Should track error details correctly',
      fn: async () => {
        apiHealthMonitor.reset();
        
        apiHealthMonitor.reportServerError(
          '/api/users', 
          500, 
          { message: 'Database connection failed', query: 'SELECT * FROM users' }
        );
        
        const report = apiHealthMonitor.getHealthReport();
        const error = report.serverErrors.find(e => e.endpoint === '/api/users');
        
        assert.exists(error);
        assert.equal(error.endpoint, '/api/users');
        assert.equal(error.context.statusCode, 500);
        assert.equal(error.count, 1);
        assert.exists(error.firstSeen);
        assert.exists(error.lastSeen);
      }
    },
    {
      name: 'Should handle empty health report',
      fn: async () => {
        apiHealthMonitor.reset();
        
        const report = apiHealthMonitor.getHealthReport();
        
        assert.equal(report.totalMissingEndpoints, 0);
        assert.equal(report.totalServerErrors, 0);
        assert.equal(report.totalAuthErrors, 0);
        assert.equal(report.totalRateLimitErrors, 0);
        assert.equal(report.totalTimeoutErrors, 0);
        assert.equal(report.totalNetworkErrors, 0);
        assert.equal(report.totalErrors, 0);
      }
    }
  ]
};
