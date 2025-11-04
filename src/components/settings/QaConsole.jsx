import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, TestTube2 } from "lucide-react";
import { getBackendUrl } from "@/api/backendUrl";

const SUITES = [
  { id: "metrics", label: "Metrics Smoke", description: "Verify /api/metrics/performance endpoint and basic charts" },
  { id: "rls", label: "RLS Enforcement", description: "Ensure Supabase RLS blocks cross-tenant access" },
  { id: "rate-limit", label: "Rate Limiter", description: "Hit the rate limiter and assert 429 behavior" },
  { id: "notifications", label: "Notifications", description: "Create and fetch notifications end-to-end" },
  { id: "tenant", label: "Tenant Switching", description: "Validate admin tenant switch and scoped data" },
  { id: "crud", label: "CRUD Regression", description: "Core create/read/update/delete flows" },
  { id: "all", label: "Run All Suites", description: "Trigger full Playwright run (long)" },
];

export default function QaConsole() {
  const [busySuite, setBusySuite] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [runHistory, setRunHistory] = useState(null); // { runs: [], total, latest }
  const pollTimerRef = useRef(null);

  const BACKEND_URL = getBackendUrl();

  const runSuite = async (suiteId) => {
    setBusySuite(suiteId);
    setResult(null);
    setError(null);
    setRunHistory(null);
    try {
      const dispatchedAt = new Date().toISOString();
      const res = await fetch(`${BACKEND_URL}/api/testing/run-playwright`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suite: suiteId, ref: "main" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({
          message: json?.message || `Dispatch failed (${res.status})`,
          details: json?.details || null,
          status: res.status,
        });
      } else {
        const data = json?.data || { message: "Dispatched" };
        setResult(data);
        // Start polling for runs after dispatch
        startPolling({ createdAfter: data.dispatched_at || dispatchedAt });
      }
    } catch (e) {
      setError({ message: e?.message || String(e) });
    } finally {
      setBusySuite(null);
    }
  };

  const startPolling = ({ createdAfter }) => {
    clearPolling();
    const poll = async () => {
      try {
        const url = new URL(`${BACKEND_URL}/api/testing/workflow-status`);
        url.searchParams.set("ref", "main");
        url.searchParams.set("per_page", "5");
        if (createdAfter) url.searchParams.set("created_after", createdAfter);
        const res = await fetch(url.toString());
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.data) {
          setRunHistory(json.data);
          // Stop polling if latest run is completed
          if (json.data.latest?.status === "completed") {
            clearPolling();
          }
        } else {
          console.warn("Workflow status poll failed:", json?.message || res.statusText);
        }
      } catch (e) {
        console.warn("Workflow status poll error:", e?.message || e);
      }
    };
    // immediate check, then interval
    poll();
    pollTimerRef.current = setInterval(poll, 5000);
  };

  const clearPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => clearPolling, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case "completed":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-600 text-slate-200">Completed</span>;
      case "in_progress":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-600 text-white flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Running
        </span>;
      case "queued":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-600 text-white">Queued</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-600 text-gray-200">{status || "Unknown"}</span>;
    }
  };

  const getConclusionBadge = (conclusion) => {
    if (!conclusion) return null;
    switch (conclusion) {
      case "success":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-600 text-white flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Success
        </span>;
      case "failure":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Failed
        </span>;
      case "cancelled":
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-600 text-white">Cancelled</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-600 text-gray-200">{conclusion}</span>;
    }
  };

  const formatTimestamp = (iso) => {
    if (!iso) return "n/a";
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHrs = Math.floor(diffMins / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return d.toLocaleDateString();
    } catch {
      return "n/a";
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <TestTube2 className="w-5 h-5 text-blue-400" />
            QA Console (CI-triggered E2E)
          </CardTitle>
          <CardDescription className="text-slate-400">
            Triggers GitHub Actions to run Playwright suites via the backend endpoint. Requires configured GITHUB_TOKEN and e2e.yml in the repository.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SUITES.map((s) => (
              <Card key={s.id} className="bg-slate-700/50 border-slate-600">
                <CardHeader>
                  <CardTitle className="text-slate-100 text-base">{s.label}</CardTitle>
                  <CardDescription className="text-slate-400 text-sm">{s.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => runSuite(s.id)}
                    disabled={!!busySuite}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {busySuite === s.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Dispatching…
                      </>
                    ) : (
                      <>Run {s.label}</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Result / Error */}
          {result && (
            <div className="mt-6 p-4 rounded-lg bg-emerald-900/20 border border-emerald-700/50">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-emerald-300 font-medium">Workflow dispatched</div>
                  <div className="text-slate-300 text-sm mt-1">
                    {result.repo} • {result.workflow} • ref {result.ref}
                  </div>
                  {result.html_url && (
                    <Button
                      onClick={() => window.open(result.html_url, "_blank")}
                      variant="outline"
                      className="mt-3 bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View workflow runs
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Live Run Status */}
          {runHistory && runHistory.runs && runHistory.runs.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-slate-700/40 border border-slate-600/60">
              <div className="flex items-start gap-3 mb-4">
                <TestTube2 className="w-5 h-5 text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-slate-200 font-medium">Recent Runs</div>
                  <div className="text-slate-400 text-sm">Last {runHistory.total} workflow run{runHistory.total !== 1 ? "s" : ""}</div>
                </div>
              </div>
              
              <div className="space-y-2">
                {runHistory.runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60 border border-slate-600/40 hover:border-slate-500/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(run.status)}
                          {run.status === "completed" && getConclusionBadge(run.conclusion)}
                        </div>
                        <div className="text-slate-400 text-xs">
                          Run #{run.run_number} • {formatTimestamp(run.created_at)}
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => window.open(run.html_url, "_blank")}
                      variant="outline"
                      size="sm"
                      className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      View
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 rounded-lg bg-red-900/20 border border-red-700/50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-red-300 font-medium">Dispatch failed</div>
                  <div className="text-slate-300 text-sm mt-1 break-words">
                    {error.message}
                  </div>
                  {error.status && (
                    <div className="text-slate-400 text-xs mt-1">HTTP {error.status}</div>
                  )}
                  {error.details && (
                    <pre className="text-slate-300 text-xs mt-2 whitespace-pre-wrap max-h-48 overflow-auto">
                      {error.details}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
