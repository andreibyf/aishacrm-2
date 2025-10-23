import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { apiHealthMonitor } from '../../utils/apiHealthMonitor';
import { AlertCircle, CheckCircle2, Copy, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

export default function ApiHealthDashboard() {
  const [healthReport, setHealthReport] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshReport = () => {
    setIsRefreshing(true);
    const report = apiHealthMonitor.getHealthReport();
    setHealthReport(report);
    
    // Add visual feedback with a slight delay
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success('Health report refreshed', {
        description: `${report.totalErrors} total issues tracked`,
        duration: 2000
      });
    }, 300);
  };

  const renderErrorList = (errors, title, description, colorClass, showFix = false) => {
    if (errors.length === 0) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {errors.map((error, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 space-y-3 hover:bg-gray-50 transition-colors ${colorClass}`}
              >
                {/* Error Info */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                        {error.endpoint}
                      </code>
                      <Badge variant="destructive">{error.errorInfo.type}</Badge>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>First seen: {new Date(error.firstSeen).toLocaleString()}</div>
                      <div>Last seen: {new Date(error.lastSeen).toLocaleString()}</div>
                      <div>Occurrences: {error.count}</div>
                      {error.errorInfo && (
                        <div className="mt-2 text-sm font-medium text-gray-700">
                          {error.errorInfo.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {showFix && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyFix(error)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Fix
                    </Button>
                  )}
                </div>

                {/* Context */}
                {error.context && Object.keys(error.context).length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                      View Context
                    </summary>
                    <pre className="mt-2 bg-gray-100 p-2 rounded text-xs overflow-auto">
                      {JSON.stringify(error.context, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  useEffect(() => {
    refreshReport();
    
    if (autoRefresh) {
      const interval = setInterval(refreshReport, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const handleCopyFix = (endpoint) => {
    const missingEndpoint = healthReport.missingEndpoints.find(e => e.endpoint === endpoint.endpoint);
    if (missingEndpoint) {
      const suggestion = apiHealthMonitor.analyzeEndpoint(missingEndpoint.endpoint);
      apiHealthMonitor.copyFixToClipboard(suggestion);
    }
  };

  const handleClearAll = () => {
    apiHealthMonitor.reset();
    refreshReport();
    toast.success('All tracked issues cleared');
  };

  const handleToggleReporting = () => {
    const currentState = apiHealthMonitor.reportingEnabled;
    apiHealthMonitor.setReportingEnabled(!currentState);
    toast.info(`User notifications ${!currentState ? 'enabled' : 'disabled'}`);
  };

  if (!healthReport) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Health Monitor</h1>
          <p className="text-gray-600 mt-1">
            Track and auto-fix missing backend endpoints
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshReport}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Now
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearAll}>
            <X className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-red-50 border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-red-700">
              Missing (404)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-900">
              {healthReport.totalMissingEndpoints}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-orange-700">
              Server (5xx)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-900">
              {healthReport.totalServerErrors}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-yellow-700">
              Auth (401/403)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-900">
              {healthReport.totalAuthErrors}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-blue-700">
              Rate Limit (429)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">
              {healthReport.totalRateLimitErrors}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-purple-700">
              Timeouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">
              {healthReport.totalTimeoutErrors}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 border-gray-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-700">
              Network
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {healthReport.totalNetworkErrors}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overall Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">
                {healthReport.totalErrors}
              </span>
              {healthReport.totalErrors === 0 ? (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              ) : (
                <AlertCircle className="h-8 w-8 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Auto-Fix Attempts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{healthReport.totalFixAttempts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              User Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant={apiHealthMonitor.reportingEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={handleToggleReporting}
              className="w-full"
            >
              {apiHealthMonitor.reportingEnabled ? 'Enabled' : 'Disabled'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Status Alert */}
      {healthReport.totalErrors === 0 ? (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            All API endpoints are healthy! No errors detected.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {healthReport.totalErrors} API error{healthReport.totalErrors > 1 ? 's' : ''} detected.
            Review the sections below for details and fix suggestions.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Lists by Type */}
      {renderErrorList(
        healthReport.missingEndpoints,
        'Missing Endpoints (404)',
        'Endpoints that do not exist. Click Copy Fix for auto-generated implementation templates.',
        'border-red-200',
        true
      )}

      {renderErrorList(
        healthReport.serverErrors,
        'Server Errors (5xx)',
        'Backend encountered internal errors. Check server logs for stack traces.',
        'border-orange-200',
        false
      )}

      {renderErrorList(
        healthReport.authErrors,
        'Authentication/Authorization Errors (401/403)',
        'User lacks permissions or authentication is invalid/expired.',
        'border-yellow-200',
        false
      )}

      {renderErrorList(
        healthReport.rateLimitErrors,
        'Rate Limit Errors (429)',
        'Too many requests sent to these endpoints. Implement request throttling.',
        'border-blue-200',
        false
      )}

      {renderErrorList(
        healthReport.timeoutErrors,
        'Timeout Errors',
        'Requests took too long to complete. Check for slow queries or unresponsive services.',
        'border-purple-200',
        false
      )}

      {renderErrorList(
        healthReport.networkErrors,
        'Network Errors',
        'Failed to connect to backend server. Check if backend is running and accessible.',
        'border-gray-200',
        false
      )}

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">🔍 Detection</h4>
            <p className="text-sm text-gray-600">
              The monitor intercepts all API calls and tracks 404 errors. When a missing endpoint
              is detected, it&apos;s automatically logged here with context.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">🔧 Auto-Fix Suggestions</h4>
            <p className="text-sm text-gray-600">
              For each missing endpoint, the monitor analyzes the URL and generates fix instructions
              including database migrations, route files, and server configuration.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">📋 Copy & Implement</h4>
            <p className="text-sm text-gray-600">
              Click &quot;Copy Fix&quot; to get complete implementation instructions. Share with your AI assistant
              or follow the steps manually to implement the missing endpoint.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">🔔 Notifications</h4>
            <p className="text-sm text-gray-600">
              When enabled, the monitor shows toast notifications when missing endpoints are detected.
              Disable notifications if you&apos;re actively testing and expect 404s.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
