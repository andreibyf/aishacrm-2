import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Trash2, Activity, TrendingUp, TrendingDown, Database } from 'lucide-react';
import { BACKEND_URL } from '@/api/entities';

export default function TenantResolveCacheMonitor() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${BACKEND_URL}/api/tenantresolve/system?stats=true`);
      if (!response.ok) throw new Error('Failed to fetch metrics');
      const data = await response.json();
      setMetrics(data.cache);
    } catch (err) {
      setError(err.message);
      if (import.meta.env.DEV) {
        console.error('Error fetching cache metrics:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const resetCache = async () => {
    try {
      setResetting(true);
      const response = await fetch(`${BACKEND_URL}/api/tenantresolve/reset`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to reset cache');
      await fetchMetrics();
      alert('Cache cleared successfully!');
    } catch (err) {
      alert('Failed to reset cache: ' + err.message);
      if (import.meta.env.DEV) {
        console.error('Error resetting cache:', err);
      }
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMetrics]);

  const getHitRatioColor = (ratio) => {
    if (ratio >= 0.7) return 'text-green-400';
    if (ratio >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getHitRatioIcon = (ratio) => {
    if (ratio >= 0.7) return <TrendingUp className="w-4 h-4" />;
    return <TrendingDown className="w-4 h-4" />;
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatPercent = (ratio) => {
    return (ratio * 100).toFixed(1) + '%';
  };

  if (loading && !metrics) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <span className="ml-3 text-slate-300">Loading cache metrics...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="pt-6">
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
            <p className="text-red-300">Failed to load cache metrics: {error}</p>
            <Button
              onClick={fetchMetrics}
              variant="outline"
              className="mt-3 bg-red-900/30 border-red-700 text-red-300 hover:bg-red-900/50"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            Tenant Resolution Cache
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Real-time performance metrics for tenant identity resolution
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={fetchMetrics}
            disabled={loading}
            variant="outline"
            size="sm"
            className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh
          </Button>
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            className={autoRefresh ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600'}
          >
            <Activity className="w-4 h-4 mr-2" />
            {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
          </Button>
          <Button
            onClick={resetCache}
            disabled={resetting}
            variant="destructive"
            size="sm"
            className="bg-red-600 hover:bg-red-700"
          >
            {resetting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Clear Cache
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cache Size */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400">Cache Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-100">
                {formatNumber(metrics?.size || 0)}
              </span>
              <span className="text-sm text-slate-400">entries</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Current number of cached resolutions
            </p>
          </CardContent>
        </Card>

        {/* Cache Hits */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400">Cache Hits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-green-400">
                {formatNumber(metrics?.hits || 0)}
              </span>
              <Badge variant="outline" className="border-green-700 text-green-400">
                +{metrics?.hits || 0}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Successful cache lookups
            </p>
          </CardContent>
        </Card>

        {/* Cache Misses */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400">Cache Misses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-orange-400">
                {formatNumber(metrics?.misses || 0)}
              </span>
              <Badge variant="outline" className="border-orange-700 text-orange-400">
                +{metrics?.misses || 0}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Database lookups required
            </p>
          </CardContent>
        </Card>

        {/* Hit Ratio */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400">Hit Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${getHitRatioColor(metrics?.hitRatio || 0)}`}>
                {formatPercent(metrics?.hitRatio || 0)}
              </span>
              <span className={getHitRatioColor(metrics?.hitRatio || 0)}>
                {getHitRatioIcon(metrics?.hitRatio || 0)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Cache effectiveness (target: 70%+)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Configuration Info */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-400">Cache Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Time-to-Live (TTL)</p>
              <p className="text-lg font-semibold text-slate-200">
                {((metrics?.ttlMs || 0) / 1000).toFixed(0)}s
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Cache entries expire after {((metrics?.ttlMs || 0) / 1000).toFixed(0)} seconds
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Total Requests</p>
              <p className="text-lg font-semibold text-slate-200">
                {formatNumber((metrics?.hits || 0) + (metrics?.misses || 0))}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Combined hits and misses since last reset
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Insights */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-400">Performance Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {metrics?.hitRatio >= 0.7 ? (
            <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
              <p className="text-sm text-green-300">
                ✅ <strong>Excellent cache performance!</strong> Your hit ratio is above 70%, indicating optimal cache utilization.
              </p>
            </div>
          ) : metrics?.hitRatio >= 0.5 ? (
            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
              <p className="text-sm text-yellow-300">
                ⚠️ <strong>Moderate cache performance.</strong> Consider increasing the TTL if tenant data changes infrequently.
              </p>
            </div>
          ) : (
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
              <p className="text-sm text-red-300">
                ⛔ <strong>Low cache efficiency.</strong> Review your tenant resolution patterns and consider increasing cache TTL.
              </p>
            </div>
          )}

          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3">
            <p className="text-sm text-blue-300">
              <strong>Tip:</strong> High cache misses may indicate:
            </p>
            <ul className="text-xs text-blue-300 mt-2 space-y-1 ml-4 list-disc">
              <li>Short TTL configuration (currently {((metrics?.ttlMs || 0) / 1000).toFixed(0)}s)</li>
              <li>Varied tenant identifier formats in requests</li>
              <li>Recent tenant schema changes requiring cache refresh</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Prometheus Integration */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-400">Prometheus Metrics</CardTitle>
          <CardDescription className="text-slate-500">
            Scrape-ready endpoint for monitoring infrastructure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 font-mono text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Endpoint:</span>
              <code className="text-blue-400">{BACKEND_URL}/api/tenantresolve/metrics</code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Format:</span>
              <span className="text-slate-300">text/plain (Prometheus exposition)</span>
            </div>
          </div>
          <Button
            onClick={() => window.open(`${BACKEND_URL}/api/tenantresolve/metrics`, '_blank')}
            variant="outline"
            size="sm"
            className="mt-3 bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
          >
            View Raw Metrics
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
