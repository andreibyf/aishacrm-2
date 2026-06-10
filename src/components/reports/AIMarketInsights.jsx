import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  Building2,
  Clock,
  Globe,
  Lightbulb,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { getCurrentInsight, requestInsightRun } from '@/api/growth';
import { useUser } from '@/components/shared/useUser.js';

// Insight lifecycle states surfaced in the UI.
// loading  → fetching current insight on mount / refresh
// idle     → no insight exists yet (offer Generate)
// running  → a generation job is in progress (status === 'running')
// complete → a finished report is available (status === 'complete')
// failed   → the last run failed (status === 'failed')

function formatEta(insight) {
  const seconds = insight?.eta_seconds;
  const range = insight?.eta_range;
  if (range && typeof range.low === 'number' && typeof range.high === 'number') {
    const low = Math.max(1, Math.round(range.low / 60));
    const high = Math.max(low, Math.round(range.high / 60));
    if (low === high) return `about ~${low} minute${low === 1 ? '' : 's'}`;
    return `about ~${low}–${high} minutes`;
  }
  if (typeof seconds === 'number' && seconds > 0) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `about ~${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return 'a few minutes';
}

function formatTimestamp(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function AIMarketInsights({ tenant }) {
  const { user } = useUser() || {};
  const isSuperadmin = user?.role === 'superadmin' || user?.is_superadmin === true;

  const tenantId = tenant?.id || tenant?.tenant_id || null;

  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState(null);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [cooldownMessage, setCooldownMessage] = useState(null);

  const fetchCurrent = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const current = await getCurrentInsight(tenantId);
      setInsight(current);
    } catch (err) {
      console.error('Failed to load current insight:', err);
      setError(err.message || 'Failed to load market intelligence.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchCurrent();
  }, [fetchCurrent]);

  const handleGenerate = useCallback(async () => {
    if (!tenantId) return;
    setGenerating(true);
    setError(null);
    setCooldownMessage(null);
    try {
      const result = await requestInsightRun(tenantId);
      if (result.ok) {
        setInsight({
          id: result.data?.id,
          status: 'running',
          eta_seconds: result.data?.eta_seconds,
          eta_range: result.data?.eta_range,
        });
      } else if (result.status === 429) {
        const when = formatTimestamp(result.next_available_at);
        setCooldownMessage(
          when
            ? `Next insight available ${when}`
            : result.message || 'Insight generation is on cooldown.',
        );
      } else {
        setError(result.message || 'Failed to request insight run.');
      }
    } catch (err) {
      console.error('Failed to request insight run:', err);
      setError(err.message || 'Failed to request insight run.');
    } finally {
      setGenerating(false);
    }
  }, [tenantId]);

  if (!tenant) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-300 mb-2">No Tenant Selected</h3>
          <p className="text-slate-400">Please select a tenant to view market intelligence.</p>
        </CardContent>
      </Card>
    );
  }

  const status = insight?.status;
  // Superadmins can always trigger a run (the API enforces the real gate);
  // for everyone else, Generate is the entry point only when there is no
  // active/complete insight blocking a new run.
  const showGenerateButton =
    !loading && (status === undefined || status === 'failed' || isSuperadmin);
  const generateLabel = status === 'failed' ? 'Retry' : 'Generate Insight';

  const report = insight?.report;
  const topOpportunities = Array.isArray(report?.top) ? report.top : [];

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-slate-100">
          <span className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-400" />
            Market Intelligence for {tenant.name}
          </span>
          {showGenerateButton && (
            <Button
              onClick={handleGenerate}
              disabled={generating || !tenantId}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {generateLabel}
                </>
              )}
            </Button>
          )}
        </CardTitle>
        <p className="text-slate-400 mt-2">
          OSINT-powered opportunity intelligence for{' '}
          <span className="font-semibold text-slate-200">{tenant.name}</span>
        </p>
      </CardHeader>

      <CardContent className="space-y-6" data-ai-insights={report ? JSON.stringify(report) : null}>
        {error && (
          <Alert className="bg-red-900/20 border-red-700/50">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">{error}</AlertDescription>
          </Alert>
        )}

        {cooldownMessage && (
          <Alert className="bg-blue-900/20 border-blue-700/50">
            <Clock className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300">{cooldownMessage}</AlertDescription>
          </Alert>
        )}

        {/* loading */}
        {loading && (
          <div
            className="flex items-center justify-center py-16 text-slate-400"
            data-testid="insights-loading"
          >
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        )}

        {/* idle (no insight) */}
        {!loading && status === undefined && (
          <div className="text-center py-12 text-slate-400">
            <Lightbulb className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>
              No market intelligence has been generated yet. Click &quot;Generate Insight&quot; to
              scan current market signals and surface opportunities.
            </p>
          </div>
        )}

        {/* running */}
        {!loading && status === 'running' && (
          <div className="text-center py-12 text-slate-300">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-400" />
            <p className="text-lg font-medium">Running — {formatEta(insight)}</p>
            <p className="text-sm text-slate-400 mt-2">
              You&apos;ll be notified when your market intelligence is ready.
            </p>
            <Button
              variant="outline"
              onClick={fetchCurrent}
              className="mt-4 bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        )}

        {/* failed */}
        {!loading && status === 'failed' && (
          <Alert className="bg-red-900/20 border-red-700/50">
            <XCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">
              {insight?.error || 'The last insight generation failed.'}
            </AlertDescription>
          </Alert>
        )}

        {/* complete */}
        {!loading && status === 'complete' && report && (
          <div className="space-y-6">
            {report.generated_at && (
              <p className="text-sm text-slate-400">As of {formatTimestamp(report.generated_at)}</p>
            )}

            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-blue-300 mb-2 flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Market Summary
              </h3>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-blue-900/30 text-blue-300 border border-blue-700/50">
                  Trends: {report.signal_counts?.trends ?? 0}
                </Badge>
                <Badge className="bg-purple-900/30 text-purple-300 border border-purple-700/50">
                  Autocomplete: {report.signal_counts?.autocomplete ?? 0}
                </Badge>
                <Badge className="bg-green-900/30 text-green-300 border border-green-700/50">
                  <Target className="w-3 h-3 mr-1" />
                  Opportunities: {report.opportunity_count ?? topOpportunities.length}
                </Badge>
              </div>
            </div>

            {topOpportunities.length > 0 && (
              <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 border border-cyan-700/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-cyan-300 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Top Opportunities
                </h3>
                <div className="space-y-2">
                  {topOpportunities.map((opp, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-800/50 rounded p-3 border border-slate-700 flex items-start justify-between gap-2"
                    >
                      <div>
                        <h4 className="font-medium text-slate-200">{opp.title}</h4>
                        {opp.type && <p className="text-xs text-slate-400 mt-1">{opp.type}</p>}
                      </div>
                      {opp.score !== undefined && opp.score !== null && (
                        <Badge className="bg-cyan-800/50 text-cyan-200 border-cyan-600">
                          {opp.score}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
