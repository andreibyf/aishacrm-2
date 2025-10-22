import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TenantIntegration } from "@/api/entities";
import { useTenant } from "../shared/tenantContext";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Calendar, CheckCircle2, Plug, AlertCircle, ExternalLink, Loader2 } from "lucide-react";

export default function CalendarQuickActions() {
  const { selectedTenantId } = useTenant();
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState({
    google: { connected: false, sync_status: "pending", last_sync: null },
    outlook: { connected: false, sync_status: "pending", last_sync: null }
  });
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!selectedTenantId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [g, o] = await Promise.all([
          TenantIntegration.filter({
            tenant_id: selectedTenantId,
            integration_type: "google_calendar",
            is_active: true
          }),
          TenantIntegration.filter({
            tenant_id: selectedTenantId,
            integration_type: "outlook_calendar",
            is_active: true
          })
        ]);

        if (!mounted) return;

        const g0 = g?.[0];
        const o0 = o?.[0];

        setStatus({
          google: {
            connected: !!g0,
            sync_status: g0?.sync_status || "pending",
            last_sync: g0?.last_sync || null
          },
          outlook: {
            connected: !!o0,
            sync_status: o0?.sync_status || "pending",
            last_sync: o0?.last_sync || null
          }
        });
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || "Failed to load integrations");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [selectedTenantId]);

  const StatusBadge = ({ connected, sync_status }) => {
    if (!connected) {
      return <Badge className="bg-slate-700 text-slate-300 border-slate-600">Not Connected</Badge>;
    }
    const map = {
      connected: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
      pending: "bg-amber-900/40 text-amber-300 border-amber-700",
      error: "bg-red-900/40 text-red-300 border-red-700"
    };
    const cls = map[sync_status] || "bg-slate-700 text-slate-300 border-slate-600";
    return <Badge className={`${cls}`}>Connected</Badge>;
  };

  const Tile = ({ provider }) => {
    const isGoogle = provider === "google";
    const s = status[provider];

    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Calendar className="w-4 h-4 text-blue-400" />
            {isGoogle ? "Google Calendar" : "Outlook Calendar"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            {s.connected ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <Plug className="w-5 h-5 text-slate-400" />
            )}
            <div>
              <div className="text-slate-200 text-sm">
                {s.connected ? "Connected" : "Not connected"}
              </div>
              <div className="text-xs text-slate-500">
                {s.connected
                  ? `Status: ${s.sync_status || "connected"}${s.last_sync ? ` • Last sync: ${new Date(s.last_sync).toLocaleString()}` : ""}`
                  : "Connect to sync Activities with your external calendar."}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge connected={s.connected} sync_status={s.sync_status} />
            <Link
              to={createPageUrl(`Integrations?focus=calendar&provider=${provider}`)}
              className="inline-flex"
            >
              <Button variant="outline" className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                {s.connected ? "Manage" : "Connect"}
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!selectedTenantId) {
    return (
      <div className="p-4 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-amber-400" />
        Select a tenant to manage calendar integrations.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 flex items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        Checking calendar integrations...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-slate-700 bg-slate-800 text-slate-300">
        <div className="flex items-center gap-2 mb-1">
          <AlertCircle className="w-5 h-5 text-red-400" />
          Failed to load integration status
        </div>
        <div className="text-sm text-slate-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Tile provider="google" />
      <Tile provider="outlook" />
    </div>
  );
}