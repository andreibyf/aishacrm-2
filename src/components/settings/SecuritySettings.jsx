import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle2, AlertCircle, Lock, AlertTriangle, Key, Globe, Database, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/components/shared/tenantContext";
import { toast } from "sonner";
import { BACKEND_URL } from '@/api/entities';

export default function SecuritySettings() {
  const { selectedTenantId } = useTenant();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(24);

  const loadSecurityMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const tenantParam = selectedTenantId ? `&tenant_id=${selectedTenantId}` : '';
      const response = await fetch(`${BACKEND_URL}/api/metrics/security?hours=${timeRange}${tenantParam}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch security metrics');
      }
      
      const data = await response.json();
      setMetrics(data.data);
    } catch (error) {
      console.error('Error loading security metrics:', error);
      toast.error('Failed to load security metrics');
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId, timeRange]);

  useEffect(() => {
    loadSecurityMetrics();
  }, [loadSecurityMetrics]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'text-green-400 bg-green-900/30 border-green-700/50';
      case 'warning': return 'text-yellow-400 bg-yellow-900/30 border-yellow-700/50';
      case 'error': return 'text-red-400 bg-red-900/30 border-red-700/50';
      default: return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy': return <CheckCircle2 className="w-5 h-5" />;
      case 'warning': return <AlertTriangle className="w-5 h-5" />;
      case 'error': return <AlertCircle className="w-5 h-5" />;
      default: return <Shield className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <Alert className="bg-red-900/30 border-red-700/50">
        <AlertCircle className="h-4 w-4 text-red-400" />
        <AlertDescription className="text-red-300">
          Failed to load security metrics. Please check if the backend is running.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <Alert className={`flex-1 ${getStatusColor(metrics.overall_status)}`}>
          {getStatusIcon(metrics.overall_status)}
          <AlertDescription>
            Security Status: <strong className="capitalize">{metrics.overall_status}</strong>
            {selectedTenantId && <span className="ml-2 text-xs opacity-75">(Tenant: {selectedTenantId.substring(0, 8)}...)</span>}
          </AlertDescription>
        </Alert>
        <Button onClick={loadSecurityMetrics} variant="outline" className="ml-4 bg-slate-700 border-slate-600">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2">
        <span className="text-sm text-slate-400 flex items-center">Time Range:</span>
        {[1, 24, 168].map(hours => (
          <Button
            key={hours}
            onClick={() => setTimeRange(hours)}
            variant={timeRange === hours ? 'default' : 'outline'}
            size="sm"
            className={timeRange === hours ? 'bg-blue-600' : 'bg-slate-700 border-slate-600'}
          >
            {hours === 1 ? '1h' : hours === 24 ? '24h' : '7d'}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Authentication Security */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Lock className={`w-5 h-5 ${getStatusColor(metrics.authentication.status).split(' ')[0]}`} />
              JWT Authentication
            </CardTitle>
            <CardDescription className="text-slate-400">
              Authentication failures and unauthorized access attempts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-700">
                <div className="text-2xl font-bold text-slate-200">{metrics.authentication.unauthorized_count}</div>
                <div className="text-xs text-slate-400">401 Unauthorized</div>
              </div>
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-700">
                <div className="text-2xl font-bold text-slate-200">{metrics.authentication.forbidden_count}</div>
                <div className="text-xs text-slate-400">403 Forbidden</div>
              </div>
            </div>
            {metrics.authentication.recent_failures?.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-slate-400 mb-2">Recent Failures:</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {metrics.authentication.recent_failures.slice(0, 5).map((failure, idx) => (
                    <div key={idx} className="text-xs p-2 bg-slate-900 rounded border border-slate-700">
                      <code className="text-slate-300">{failure.method} {failure.endpoint}</code>
                      <div className="text-slate-500 mt-1">
                        {failure.user_email || 'Anonymous'} • {new Date(failure.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rate Limiting */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Shield className={`w-5 h-5 ${getStatusColor(metrics.rate_limiting.status).split(' ')[0]}`} />
              Rate Limiting
            </CardTitle>
            <CardDescription className="text-slate-400">
              API rate limit hits and protection status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700">
              <div>
                <div className="text-2xl font-bold text-slate-200">{metrics.rate_limiting.hits}</div>
                <div className="text-xs text-slate-400">Rate Limit Hits (429)</div>
              </div>
              <Badge className={getStatusColor(metrics.rate_limiting.enabled ? 'healthy' : 'error')}>
                {metrics.rate_limiting.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            {metrics.rate_limiting.recent_hits?.length > 0 && (
              <div>
                <div className="text-xs text-slate-400 mb-2">Recent Hits:</div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {metrics.rate_limiting.recent_hits.slice(0, 5).map((hit, idx) => (
                    <div key={idx} className="text-xs p-2 bg-slate-900 rounded border border-slate-700">
                      <code className="text-slate-300">{hit.endpoint}</code>
                      <div className="text-slate-500 mt-1">
                        {hit.user_email || 'Anonymous'} • {new Date(hit.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CORS Configuration */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Globe className={`w-5 h-5 ${getStatusColor(metrics.cors.status).split(' ')[0]}`} />
              CORS Security
            </CardTitle>
            <CardDescription className="text-slate-400">
              Cross-Origin Resource Sharing configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-slate-900 rounded-lg border border-slate-700">
              <div className="text-2xl font-bold text-slate-200">{metrics.cors.error_count}</div>
              <div className="text-xs text-slate-400">CORS Errors</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-2">Allowed Origins:</div>
              <div className="space-y-1">
                {metrics.cors.allowed_origins.map((origin, idx) => (
                  <div key={idx} className="text-xs p-2 bg-slate-900 rounded border border-slate-700">
                    <code className="text-green-400">{origin}</code>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RLS Policies */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Database className="w-5 h-5 text-green-400" />
              Row-Level Security
            </CardTitle>
            <CardDescription className="text-slate-400">
              Supabase RLS policy status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-700">
              <div>
                <div className="text-lg font-bold text-green-400">Active</div>
                <div className="text-xs text-slate-400">RLS Policies Enabled</div>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <Alert className="bg-blue-900/30 border-blue-700/50">
              <Shield className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-300 text-xs">
                {metrics.rls_policies.note}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {/* API Keys Section */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Key className="w-5 h-5 text-purple-400" />
            Active API Keys
          </CardTitle>
          <CardDescription className="text-slate-400">
            Currently active API keys for your tenant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-700">
            <div>
              <div className="text-2xl font-bold text-slate-200">{metrics.api_keys.active_count}</div>
              <div className="text-xs text-slate-400">Active Keys</div>
            </div>
            <Badge className="bg-purple-900/30 text-purple-400 border-purple-700/50">
              {metrics.api_keys.status}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}