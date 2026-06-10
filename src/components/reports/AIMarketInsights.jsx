import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle,
  Clock,
  Globe,
  Lightbulb,
  Loader2,
  Newspaper,
  RefreshCw,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
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

// Economic-indicator value display (e.g. 3.1 + "percent" → "3.1%").
function formatDisplayValue(value, unit) {
  if (value === undefined || value === null) return '';
  const u = String(unit || '').toLowerCase();
  if (u === 'percent' || u === '%') return `${value}%`;
  if (u.includes('index')) return String(value);
  return unit ? `${value} ${unit}` : String(value);
}

const PRIORITY_BADGE = {
  high: 'bg-red-800/50 text-red-200 border-red-600',
  medium: 'bg-yellow-800/50 text-yellow-200 border-yellow-600',
  low: 'bg-blue-800/50 text-blue-200 border-blue-600',
};
const NEWS_IMPACT_BADGE = {
  positive: 'bg-green-800/50 text-green-200 border-green-600',
  negative: 'bg-red-800/50 text-red-200 border-red-600',
  neutral: 'bg-slate-700 text-slate-300 border-slate-600',
};

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
  // The rich Market Intelligence report (Claude) is nested under market_insights;
  // signal counts remain at the top level. The PDF export reads the rich report.
  const marketInsights = report?.market_insights || null;
  const marketInsightsError = report?.market_insights_error || null;

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

      <CardContent
        className="space-y-6"
        data-ai-insights={marketInsights ? JSON.stringify(marketInsights) : null}
      >
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              {report.generated_at && (
                <p className="text-sm text-slate-400">
                  As of {formatTimestamp(report.generated_at)}
                </p>
              )}
              {/* Compact signals-scanned meta; the full opportunity list lives on the Opportunities tab. */}
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-blue-900/30 text-blue-300 border border-blue-700/50">
                  Trends: {report.signal_counts?.trends ?? 0}
                </Badge>
                <Badge className="bg-purple-900/30 text-purple-300 border border-purple-700/50">
                  Autocomplete: {report.signal_counts?.autocomplete ?? 0}
                </Badge>
                <Badge className="bg-green-900/30 text-green-300 border border-green-700/50">
                  <Target className="w-3 h-3 mr-1" />
                  Opportunities: {report.opportunity_count ?? 0}
                </Badge>
              </div>
            </div>

            {marketInsightsError && !marketInsights && (
              <Alert className="bg-amber-900/20 border-amber-700/50">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <AlertDescription className="text-amber-300">
                  The market intelligence report could not be generated this run (
                  {marketInsightsError}
                  ). Opportunities are available on the Opportunities tab.
                </AlertDescription>
              </Alert>
            )}

            {marketInsights && (
              <div className="space-y-6">
                {/* Executive summary */}
                {marketInsights.executive_summary && (
                  <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/30 border border-slate-700 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-yellow-400" />
                      Executive Summary
                    </h3>
                    <p className="text-slate-300 leading-relaxed">
                      {marketInsights.executive_summary}
                    </p>
                  </div>
                )}

                {/* Market overview */}
                {marketInsights.market_overview && (
                  <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 border border-blue-700/50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-blue-300 mb-2 flex items-center gap-2">
                      <Globe className="w-5 h-5" />
                      Market Overview
                    </h3>
                    <p className="text-slate-300 leading-relaxed whitespace-pre-line">
                      {marketInsights.market_overview}
                    </p>
                  </div>
                )}

                {/* SWOT */}
                {marketInsights.swot_analysis && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {marketInsights.swot_analysis.strengths?.length > 0 && (
                      <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 border border-green-700/50 rounded-lg p-4">
                        <h4 className="font-semibold text-green-300 mb-3 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5" />
                          Strengths
                        </h4>
                        <ul className="space-y-2">
                          {marketInsights.swot_analysis.strengths.map((item, idx) => (
                            <li key={idx} className="text-slate-300 text-sm flex items-start gap-2">
                              <span className="text-green-400 mt-0.5">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {marketInsights.swot_analysis.weaknesses?.length > 0 && (
                      <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 border border-red-700/50 rounded-lg p-4">
                        <h4 className="font-semibold text-red-300 mb-3 flex items-center gap-2">
                          <XCircle className="w-5 h-5" />
                          Weaknesses
                        </h4>
                        <ul className="space-y-2">
                          {marketInsights.swot_analysis.weaknesses.map((item, idx) => (
                            <li key={idx} className="text-slate-300 text-sm flex items-start gap-2">
                              <span className="text-red-400 mt-0.5">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {marketInsights.swot_analysis.opportunities?.length > 0 && (
                      <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 border border-cyan-700/50 rounded-lg p-4">
                        <h4 className="font-semibold text-cyan-300 mb-3 flex items-center gap-2">
                          <Target className="w-5 h-5" />
                          Opportunities
                        </h4>
                        <ul className="space-y-2">
                          {marketInsights.swot_analysis.opportunities.map((item, idx) => (
                            <li key={idx} className="text-slate-300 text-sm flex items-start gap-2">
                              <span className="text-cyan-400 mt-0.5">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {marketInsights.swot_analysis.threats?.length > 0 && (
                      <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/20 border border-orange-700/50 rounded-lg p-4">
                        <h4 className="font-semibold text-orange-300 mb-3 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5" />
                          Threats
                        </h4>
                        <ul className="space-y-2">
                          {marketInsights.swot_analysis.threats.map((item, idx) => (
                            <li key={idx} className="text-slate-300 text-sm flex items-start gap-2">
                              <span className="text-orange-400 mt-0.5">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Competitive landscape */}
                {marketInsights.competitive_landscape && (
                  <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-700/50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-purple-300 mb-3 flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      Competitive Landscape
                    </h3>
                    {marketInsights.competitive_landscape.overview && (
                      <p className="text-slate-300 mb-3">
                        {marketInsights.competitive_landscape.overview}
                      </p>
                    )}
                    {marketInsights.competitive_landscape.major_competitors?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-purple-200 mb-2">
                          Major Competitors:
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {marketInsights.competitive_landscape.major_competitors.map(
                            (comp, idx) => (
                              <Badge
                                key={idx}
                                className="bg-purple-800/50 text-purple-200 border-purple-600"
                              >
                                {comp}
                              </Badge>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                    {marketInsights.competitive_landscape.market_dynamics && (
                      <p className="text-slate-300 text-sm mt-3">
                        {marketInsights.competitive_landscape.market_dynamics}
                      </p>
                    )}
                  </div>
                )}

                {/* Industry trends */}
                {marketInsights.industry_trends?.length > 0 && (
                  <div className="bg-gradient-to-br from-indigo-900/30 to-indigo-800/20 border border-indigo-700/50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-indigo-300 mb-3 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Industry Trends
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {marketInsights.industry_trends.map((trend, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-800/50 rounded p-3 border border-slate-700"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="font-medium text-slate-200">{trend.name}</h4>
                            {trend.impact && (
                              <Badge className={PRIORITY_BADGE[trend.impact] || PRIORITY_BADGE.low}>
                                {trend.impact}
                              </Badge>
                            )}
                          </div>
                          {trend.description && (
                            <p className="text-sm text-slate-300">{trend.description}</p>
                          )}
                          {trend.timeframe && (
                            <p className="text-xs text-slate-400 mt-1">{trend.timeframe}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Major news */}
                {marketInsights.major_news?.length > 0 && (
                  <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/30 border border-slate-700 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
                      <Newspaper className="w-5 h-5 text-slate-300" />
                      Major News & Events
                    </h3>
                    <div className="space-y-3">
                      {marketInsights.major_news.map((news, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-800/50 rounded p-3 border border-slate-700"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="font-medium text-slate-200">{news.title}</h4>
                            {news.impact && (
                              <Badge
                                className={
                                  NEWS_IMPACT_BADGE[news.impact] || NEWS_IMPACT_BADGE.neutral
                                }
                              >
                                {news.impact}
                              </Badge>
                            )}
                          </div>
                          {news.date && <p className="text-sm text-slate-400 mb-1">{news.date}</p>}
                          {news.description && (
                            <p className="text-sm text-slate-300">{news.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Economic indicators */}
                {marketInsights.economic_indicators?.length > 0 && (
                  <div className="bg-gradient-to-br from-teal-900/30 to-teal-800/20 border border-teal-700/50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-teal-300 mb-4 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Key Economic Indicators
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {marketInsights.economic_indicators.map((indicator, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-800/50 rounded p-3 border border-slate-700"
                        >
                          <div className="flex items-start justify-between mb-1">
                            <span className="text-sm font-medium text-slate-300">
                              {indicator.name}
                            </span>
                            {indicator.trend === 'up' && (
                              <TrendingUp className="w-4 h-4 text-green-400" />
                            )}
                            {indicator.trend === 'down' && (
                              <TrendingDown className="w-4 h-4 text-red-400" />
                            )}
                            {indicator.trend === 'stable' && (
                              <span className="text-xs text-slate-500">→</span>
                            )}
                          </div>
                          <p className="text-lg font-semibold text-teal-300">
                            {formatDisplayValue(indicator.current_value, indicator.unit)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Strategic recommendations */}
                {marketInsights.recommendations?.length > 0 && (
                  <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 border border-amber-700/50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-amber-300 mb-3 flex items-center gap-2">
                      <Zap className="w-5 h-5" />
                      Strategic Recommendations
                    </h3>
                    <div className="space-y-3">
                      {marketInsights.recommendations.map((rec, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-800/50 rounded p-3 border border-slate-700"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="font-medium text-slate-200">{rec.title}</h4>
                            {rec.priority && (
                              <Badge className={PRIORITY_BADGE[rec.priority] || PRIORITY_BADGE.low}>
                                {rec.priority}
                              </Badge>
                            )}
                          </div>
                          {rec.description && (
                            <p className="text-sm text-slate-300">{rec.description}</p>
                          )}
                          {rec.action_items?.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {rec.action_items.map((item, i) => (
                                <li
                                  key={i}
                                  className="text-xs text-slate-400 flex items-start gap-2"
                                >
                                  <span className="text-amber-400 mt-0.5">›</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {(rec.timeline || rec.expected_impact) && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {rec.timeline && (
                                <Badge className="bg-slate-700 text-slate-300 border-slate-600">
                                  {rec.timeline}
                                </Badge>
                              )}
                              {rec.expected_impact && (
                                <span className="text-xs text-slate-400 italic">
                                  {rec.expected_impact}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
