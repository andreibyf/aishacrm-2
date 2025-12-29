import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, Server, Activity, Database, List } from 'lucide-react';

/**
 * MCP Admin UI
 * 
 * Displays comprehensive MCP server status including:
 * - Health check
 * - Memory status
 * - Queue statistics
 * - Registered adapters
 */
export default function McpAdmin() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';
      const response = await fetch(`${backendUrl}/api/mcp/admin/status`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // Try to get error message from JSON response, fallback to text
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } else {
            const text = await response.text();
            errorMessage = text.slice(0, 100) || errorMessage;
          }
        } catch (parseErr) {
          console.warn('[McpAdmin] Could not parse error response:', parseErr);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setStatus(data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[McpAdmin] Fetch error:', err);
      setError(err.message || 'Failed to fetch MCP status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const getHealthBadge = (healthStatus) => {
    if (!healthStatus) return <Badge variant="outline">Unknown</Badge>;
    
    const isHealthy = healthStatus.status === 'ok' || healthStatus.status === 'healthy';
    return (
      <Badge variant={isHealthy ? 'success' : 'destructive'}>
        {isHealthy ? 'Healthy' : 'Unhealthy'}
      </Badge>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="w-8 h-8 text-blue-500" />
            MCP Server Administration
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor MCP server health, memory, queue, and registered adapters
          </p>
        </div>
        <Button onClick={fetchStatus} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {lastRefresh && (
        <div className="text-sm text-muted-foreground">
          Last updated: {formatTimestamp(lastRefresh)}
        </div>
      )}

      {status && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Connection Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5" />
                Connection
              </CardTitle>
              <CardDescription>MCP server connection details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <span className="font-semibold">Base URL:</span>{' '}
                  <code className="text-sm bg-muted px-2 py-1 rounded">
                    {status.mcpBaseUrl || 'Not available'}
                  </code>
                </div>
                <div>
                  <span className="font-semibold">Timestamp:</span>{' '}
                  {formatTimestamp(status.ts)}
                </div>
                <div>
                  <span className="font-semibold">Status:</span>{' '}
                  {status.status === 'ok' ? (
                    <Badge variant="success">Connected</Badge>
                  ) : (
                    <Badge variant="destructive">Error</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Health Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Health Status
              </CardTitle>
              <CardDescription>MCP server health check</CardDescription>
            </CardHeader>
            <CardContent>
              {status.health ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getHealthBadge(status.health)}
                  </div>
                  <pre className="mt-4 text-xs bg-muted p-3 rounded overflow-auto max-h-48">
                    {JSON.stringify(status.health, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-muted-foreground">No health data available</p>
              )}
            </CardContent>
          </Card>

          {/* Memory Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Memory Status
              </CardTitle>
              <CardDescription>Memory usage and statistics</CardDescription>
            </CardHeader>
            <CardContent>
              {status.memory ? (
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                  {JSON.stringify(status.memory, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">No memory data available</p>
              )}
            </CardContent>
          </Card>

          {/* Queue Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Queue Statistics
              </CardTitle>
              <CardDescription>Queue processing metrics</CardDescription>
            </CardHeader>
            <CardContent>
              {status.queue && status.queue.status !== 'error' ? (
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">
                  {JSON.stringify(status.queue, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">
                  {status.queue?.status === 'error' 
                    ? 'Queue stats unavailable' 
                    : 'No queue data available'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Registered Adapters */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <List className="w-5 h-5" />
                Registered Adapters
              </CardTitle>
              <CardDescription>
                MCP adapters available for tool execution
                {status.adapters?.role && ` (Role: ${status.adapters.role})`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status.adapters?.adapters && status.adapters.adapters.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {status.adapters.adapters.map((adapter) => (
                      <Badge key={adapter} variant="secondary">
                        {adapter}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    Total: {status.adapters.adapters.length} adapter(s)
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">No adapters reported.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {loading && !status && (
        <div className="flex items-center justify-center p-12">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
