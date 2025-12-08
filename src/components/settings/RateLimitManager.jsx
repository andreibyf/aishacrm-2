import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Shield, AlertTriangle, CheckCircle2, Ban, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BACKEND_URL } from '@/api/entities';

export default function RateLimitManager() {
  const [loading, setLoading] = useState(true);
  const [blockedIPs, setBlockedIPs] = useState([]);
  const [status, setStatus] = useState(null);
  const [clearingIP, setClearingIP] = useState(null);
  const [manualIP, setManualIP] = useState('');
  const [stats, setStats] = useState(null);

  const loadSecurityData = async () => {
    try {
      setLoading(true);
      
      // Fetch current security status
      const statusResp = await fetch(`${BACKEND_URL}/api/security/status`, {
        credentials: 'include'
      });
      
      if (!statusResp.ok) throw new Error('Failed to load security status');
      const statusData = await statusResp.json();
      setStatus(statusData.data);
      
      // Fetch statistics
      const statsResp = await fetch(`${BACKEND_URL}/api/security/statistics`, {
        credentials: 'include'
      });
      
      if (statsResp.ok) {
        const statsData = await statsResp.json();
        setStats(statsData.data);
      }
      
      // Extract blocked IPs from status
      if (statusData.data?.blocked_ips) {
        const ips = Object.entries(statusData.data.blocked_ips).map(([ip, data]) => ({
          ip_address: ip,
          ...data,
          expires_at: data.expires ? new Date(data.expires) : null
        }));
        setBlockedIPs(ips);
      }
    } catch (error) {
      console.error('Error loading security data:', error);
      toast.error('Failed to load security data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecurityData();
    const interval = setInterval(loadSecurityData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleUnblockIP = async (ipAddress) => {
    try {
      setClearingIP(ipAddress);
      const resp = await fetch(`${BACKEND_URL}/api/security/unblock-ip`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ip: ipAddress })
      });

      if (!resp.ok) {
        const error = await resp.json();
        throw new Error(error.message || 'Failed to unblock IP');
      }

      toast.success(`IP ${ipAddress} unblocked successfully`);
      await loadSecurityData();
    } catch (error) {
      console.error('Error unblocking IP:', error);
      toast.error(error.message || 'Failed to unblock IP');
    } finally {
      setClearingIP(null);
    }
  };

  const handleClearAllTracking = async () => {
    if (!confirm('Clear all rate limit tracking data? This will reset all counters but not unblock permanently blocked IPs.')) {
      return;
    }

    try {
      const resp = await fetch(`${BACKEND_URL}/api/security/clear-tracking`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!resp.ok) {
        const error = await resp.json();
        throw new Error(error.message || 'Failed to clear tracking');
      }

      toast.success('All tracking data cleared');
      await loadSecurityData();
    } catch (error) {
      console.error('Error clearing tracking:', error);
      toast.error(error.message || 'Failed to clear tracking data');
    }
  };

  const handleManualUnblock = async (e) => {
    e.preventDefault();
    if (!manualIP.trim()) {
      toast.error('Please enter an IP address');
      return;
    }
    await handleUnblockIP(manualIP.trim());
    setManualIP('');
  };

  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatExpiresIn = (expiresAt) => {
    if (!expiresAt) return 'Never';
    const ms = expiresAt - Date.now();
    if (ms <= 0) return 'Expired';
    return formatDuration(ms);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading security data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Requests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_requests?.toLocaleString() || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Rate Limit Hits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.rate_limit_hits || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Blocked IPs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{blockedIPs.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Active Violations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.security_violations || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Manual Unblock Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Manual IP Unblock
          </CardTitle>
          <CardDescription>
            Unblock a specific IP address that may have been rate limited or blocked by intrusion detection
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleManualUnblock} className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="manual-ip" className="sr-only">IP Address</Label>
              <Input
                id="manual-ip"
                type="text"
                placeholder="Enter IP address (e.g., 192.168.1.100)"
                value={manualIP}
                onChange={(e) => setManualIP(e.target.value)}
                pattern="^(\d{1,3}\.){3}\d{1,3}$"
              />
            </div>
            <Button type="submit" disabled={!manualIP.trim() || clearingIP}>
              {clearingIP ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Unblocking...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Unblock
                </>
              )}
            </Button>
          </form>
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAllTracking}
              className="text-orange-600 hover:text-orange-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Clear All Tracking Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Blocked IPs List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5" />
            Currently Blocked IPs ({blockedIPs.length})
          </CardTitle>
          <CardDescription>
            IPs currently blocked due to rate limiting or security violations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {blockedIPs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
              <p>No IPs currently blocked</p>
            </div>
          ) : (
            <div className="space-y-3">
              {blockedIPs.map((block) => (
                <div
                  key={block.ip_address}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <code className="text-sm font-mono font-semibold">{block.ip_address}</code>
                      {block.severity && (
                        <Badge variant={
                          block.severity === 'critical' ? 'destructive' : 
                          block.severity === 'high' ? 'destructive' : 
                          'secondary'
                        }>
                          {block.severity}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {block.reason && <div>Reason: {block.reason}</div>}
                      {block.expires_at && (
                        <div>Expires in: {formatExpiresIn(block.expires_at)}</div>
                      )}
                      {block.blocked_at && (
                        <div>Blocked: {new Date(block.blocked_at).toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnblockIP(block.ip_address)}
                    disabled={clearingIP === block.ip_address}
                  >
                    {clearingIP === block.ip_address ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Unblocking...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Unblock
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rate Limit Configuration Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            Rate Limit Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Requests per Window:</span>
              <span className="font-mono">{status?.config?.max_requests_per_window || 300}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Window Duration:</span>
              <span className="font-mono">{formatDuration(status?.config?.window_ms || 60000)}</span>
            </div>
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>Note:</strong> In-memory rate limits reset automatically after the window duration
                or when the backend restarts. For immediate effect, restart the backend service.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
