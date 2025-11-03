import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, TestTube2 } from "lucide-react";

const SUITES = [
  { id: "metrics", label: "Metrics Smoke", description: "Verify /api/metrics/performance endpoint and basic charts" },
  { id: "rls-enforcement", label: "RLS Enforcement", description: "Ensure Supabase RLS blocks cross-tenant access" },
  { id: "rate-limit", label: "Rate Limiter", description: "Hit the rate limiter and assert 429 behavior" },
  { id: "notifications", label: "Notifications", description: "Create and fetch notifications end-to-end" },
  { id: "tenant-switching", label: "Tenant Switching", description: "Validate admin tenant switch and scoped data" },
  { id: "crud", label: "CRUD Regression", description: "Core create/read/update/delete flows" },
  { id: "all", label: "Run All Suites", description: "Trigger full Playwright run (long)" },
];

export default function QaConsole() {
  const [busySuite, setBusySuite] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [runStatus, setRunStatus] = useState(null); // { status, conclusion, html_url, id }
  const pollTimerRef = useRef(null);

  const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || "http://localhost:3001";

  const runSuite = async (suiteId) => {
    setBusySuite(suiteId);
    setResult(null);
    setError(null);
    setRunStatus(null);
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
        // Start polling for the latest run after dispatch
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
        if (createdAfter) url.searchParams.set("created_after", createdAfter);
        const res = await fetch(url.toString());
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          setRunStatus(json?.data || null);
          // Stop if completed
          if (json?.data?.status === "completed") {
            clearPolling();
          }
        } else {
          // Non-fatal: keep polling, but surface a soft error
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
          {runStatus && (
            <div className="mt-4 p-4 rounded-lg bg-slate-700/40 border border-slate-600/60">
              <div className="flex items-start gap-3">
                {runStatus.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
                ) : (
                  <Loader2 className="w-5 h-5 text-blue-400 mt-0.5 animate-spin" />
                )}
                <div className="flex-1">
                  <div className="text-slate-200 font-medium">Latest run</div>
                  <div className="text-slate-300 text-sm mt-1">
                    Status: <span className="font-mono">{runStatus.status || 'unknown'}</span>
                    {runStatus.status === 'completed' && (
                      <>
                        {" • "}Conclusion: <span className="font-mono">{runStatus.conclusion || 'n/a'}</span>
                      </>
                    )}
                  </div>
                  {runStatus.html_url && (
                    <Button
                      onClick={() => window.open(runStatus.html_url, "_blank")}
                      variant="outline"
                      className="mt-3 bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open specific run
                    </Button>
                  )}
                </div>
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
