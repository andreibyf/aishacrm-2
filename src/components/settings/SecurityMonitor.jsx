import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Eye,
  RefreshCw,
  TrendingUp,
  Users,
  Globe,
  Ban
} from "lucide-react";

export default function SecurityMonitor() {
  const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || "http://localhost:4001";

  const [alerts, setAlerts] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [idrStatus, setIdrStatus] = useState(null);
  const [threatIntel, setThreatIntel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("alerts");

  // Fetch security alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/security/alerts?limit=50`);
      const data = await response.json();

      if (data.status === "success") {
        setAlerts(data.data.alerts);
      }
    } catch (error) {
      console.error("Error fetching security alerts:", error);
    }
  }, [BACKEND_URL]);

  // Fetch statistics
  const fetchStatistics = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/security/statistics?days=7`);
      const data = await response.json();

      if (data.status === "success") {
        setStatistics(data.data.statistics);
      }
    } catch (error) {
      console.error("Error fetching statistics:", error);
    }
  }, [BACKEND_URL]);

  // Fetch IDR status
  const fetchIDRStatus = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/security/status`);
      const data = await response.json();

      if (data.status === "success") {
        setIdrStatus(data.data);
      }
    } catch (error) {
      console.error("Error fetching IDR status:", error);
    }
  }, [BACKEND_URL]);

  // Fetch threat intelligence
  const fetchThreatIntel = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/security/threat-intelligence?days=30`);
      const data = await response.json();

      if (data.status === "success") {
        setThreatIntel(data.data);
      }
    } catch (error) {
      console.error("Error fetching threat intelligence:", error);
    }
  }, [BACKEND_URL]);

  // Block IP
  const blockIP = async (ip, reason) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/security/block-ip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, reason, duration_ms: 3600000 }) // 1 hour
      });

      const data = await response.json();
      if (data.status === "success") {
        alert(`IP ${ip} blocked successfully`);
        fetchIDRStatus();
      }
    } catch (error) {
      console.error("Error blocking IP:", error);
      alert("Failed to block IP");
    }
  };

  // Unblock IP
  const unblockIP = async (ip) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/security/unblock-ip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, reason: "Manual unblock by admin" })
      });

      const data = await response.json();
      if (data.status === "success") {
        alert(`IP ${ip} unblocked successfully`);
        fetchIDRStatus();
      }
    } catch (error) {
      console.error("Error unblocking IP:", error);
      alert("Failed to unblock IP");
    }
  };

  // Refresh all data
  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchAlerts(),
      fetchStatistics(),
      fetchIDRStatus(),
      fetchThreatIntel()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case "critical": return "bg-red-600";
      case "high": return "bg-orange-600";
      case "medium": return "bg-yellow-600";
      case "low": return "bg-blue-600";
      default: return "bg-gray-600";
    }
  };

  const getViolationTypeLabel = (type) => {
    const labels = {
      CROSS_TENANT_ACCESS: "Cross-Tenant Access",
      SQL_INJECTION: "SQL Injection",
      RAPID_TENANT_SWITCHING: "Rapid Tenant Switching",
      BULK_DATA_EXTRACTION: "Bulk Data Extraction",
      EXCESSIVE_FAILURES: "Excessive Failures"
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      <Alert className="bg-red-900/30 border-red-700/50">
        <ShieldAlert className="h-4 w-4 text-red-400" />
        <AlertDescription className="text-red-300">
          Intrusion Detection & Response (IDR) system monitoring - Real-time security alerts and threat intelligence
        </AlertDescription>
      </Alert>

      {/* Dashboard Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Alerts */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Total Alerts (7d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {statistics?.total_alerts || 0}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {statistics?.unique_ips || 0} unique IPs
            </div>
          </CardContent>
        </Card>

        {/* IDR Status */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              IDR Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-green-500" />
              <span className="text-xl font-bold text-green-400">Active</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {idrStatus?.blocked_ips?.length || 0} IPs blocked
            </div>
            {idrStatus?.redis_available === false && (
              <div className="text-xs text-yellow-400 mt-1">
                ⚠ Memory-only mode
              </div>
            )}
          </CardContent>
        </Card>

        {/* Critical Threats */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Critical Threats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-400">
              {statistics?.by_severity?.critical || 0}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Requires immediate action
            </div>
          </CardContent>
        </Card>

        {/* Unique Users */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Users Flagged
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">
              {statistics?.unique_users || 0}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              With security violations
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700">
        <button
          onClick={() => setSelectedTab("alerts")}
          className={`px-4 py-2 font-medium ${
            selectedTab === "alerts"
              ? "border-b-2 border-blue-500 text-blue-400"
              : "text-slate-400 hover:text-slate-300"
          }`}
        >
          Recent Alerts
        </button>
        <button
          onClick={() => setSelectedTab("threats")}
          className={`px-4 py-2 font-medium ${
            selectedTab === "threats"
              ? "border-b-2 border-blue-500 text-blue-400"
              : "text-slate-400 hover:text-slate-300"
          }`}
        >
          Threat Intelligence
        </button>
        <button
          onClick={() => setSelectedTab("blocked")}
          className={`px-4 py-2 font-medium ${
            selectedTab === "blocked"
              ? "border-b-2 border-blue-500 text-blue-400"
              : "text-slate-400 hover:text-slate-300"
          }`}
        >
          Blocked IPs
        </button>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button
          onClick={refreshAll}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Refreshing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </>
          )}
        </Button>
      </div>

      {/* Recent Alerts Tab */}
      {selectedTab === "alerts" && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Recent Security Alerts
            </CardTitle>
            <CardDescription className="text-slate-400">
              Last 50 security violations detected by IDR system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="text-center text-slate-400 py-4">
                  <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  No security alerts - System is secure
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3 bg-slate-900 rounded border border-slate-700"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={getSeverityColor(alert.severity)}>
                            {alert.severity?.toUpperCase()}
                          </Badge>
                          <Badge className="bg-slate-600">
                            {getViolationTypeLabel(alert.violation_type)}
                          </Badge>
                          <span className="text-xs text-slate-400">
                            {new Date(alert.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm text-slate-200 mb-2">
                          {alert.message}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                          <div>
                            <Globe className="w-3 h-3 inline mr-1" />
                            IP: {alert.ip_address}
                          </div>
                          <div>
                            <Users className="w-3 h-3 inline mr-1" />
                            User: {alert.user_email}
                          </div>
                          {alert.attempted_tenant && (
                            <>
                              <div>Attempted: {alert.attempted_tenant}</div>
                              <div>Actual: {alert.actual_tenant}</div>
                            </>
                          )}
                        </div>
                      </div>
                      {alert.ip_address && (
                        <Button
                          onClick={() => blockIP(alert.ip_address, `Security violation: ${alert.violation_type}`)}
                          size="sm"
                          variant="destructive"
                          className="ml-2"
                        >
                          <Ban className="w-3 h-3 mr-1" />
                          Block IP
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Threat Intelligence Tab */}
      {selectedTab === "threats" && threatIntel && (
        <div className="space-y-4">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Top Threatening IPs</CardTitle>
              <CardDescription className="text-slate-400">
                IPs with highest threat scores (last 30 days)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {threatIntel.top_threatening_ips?.slice(0, 10).map((ipData, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 bg-slate-900 rounded"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-mono text-slate-200">
                          {ipData.ip}
                        </span>
                        <Badge className="bg-red-600">
                          Score: {ipData.threat_score}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {ipData.alert_count} alerts • {ipData.violation_types.join(", ")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => blockIP(ipData.ip, "High threat score")}
                        size="sm"
                        variant="destructive"
                      >
                        <Lock className="w-3 h-3 mr-1" />
                        Block
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">Violation Patterns</CardTitle>
              <CardDescription className="text-slate-400">
                Most common security violations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(threatIntel.violation_patterns || {}).map(([type, data]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between p-2 bg-slate-900 rounded"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-200">
                        {getViolationTypeLabel(type)}
                      </div>
                      <div className="text-xs text-slate-400">
                        {data.count} occurrences
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {Object.entries(data.severities || {}).map(([sev, count]) => (
                        <Badge key={sev} className={getSeverityColor(sev)}>
                          {sev}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Blocked IPs Tab */}
      {selectedTab === "blocked" && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Ban className="w-5 h-5" />
              Currently Blocked IPs
            </CardTitle>
            <CardDescription className="text-slate-400">
              IP addresses temporarily blocked by IDR system
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!idrStatus || idrStatus.blocked_ips?.length === 0 ? (
              <div className="text-center text-slate-400 py-4">
                <ShieldCheck className="w-12 h-12 mx-auto mb-2 text-green-500" />
                No IPs currently blocked
              </div>
            ) : (
              <div className="space-y-2">
                {idrStatus.blocked_ips.map((ipData, idx) => {
                  const isExpiring = ipData.expires_in_seconds > 0 && ipData.expires_in_seconds < 300; // Less than 5 minutes
                  const expiresText = ipData.expires_in_seconds > 0
                    ? `Expires in ${Math.floor(ipData.expires_in_seconds / 60)}m ${ipData.expires_in_seconds % 60}s`
                    : 'Permanent';

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3 bg-slate-900 rounded border ${
                        isExpiring ? 'border-yellow-700/50' : 'border-red-700/50'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Lock className="w-4 h-4 text-red-400" />
                          <span className="font-mono text-sm text-slate-200">
                            {typeof ipData === 'string' ? ipData : ipData.ip}
                          </span>
                          {isExpiring && (
                            <Badge className="bg-yellow-600">
                              Expiring Soon
                            </Badge>
                          )}
                        </div>
                        {ipData.blocked_at && ipData.blocked_at !== 'unknown' && (
                          <div className="text-xs text-slate-400">
                            Blocked: {new Date(ipData.blocked_at).toLocaleString()}
                          </div>
                        )}
                        <div className="text-xs text-slate-400">
                          {expiresText}
                        </div>
                      </div>
                      <Button
                        onClick={() => unblockIP(typeof ipData === 'string' ? ipData : ipData.ip)}
                        size="sm"
                        variant="outline"
                        className="ml-2"
                      >
                        <Unlock className="w-3 h-3 mr-1" />
                        Unblock
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {idrStatus && !idrStatus.redis_available && (
              <Alert className="mt-4 bg-yellow-900/30 border-yellow-700/50">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-300">
                  Redis unavailable - Blocked IPs stored in memory only and will reset on backend restart
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}