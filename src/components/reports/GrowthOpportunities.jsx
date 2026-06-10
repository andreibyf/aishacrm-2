import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Loader2,
  Settings2,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { actionOpportunity, dismissOpportunity, listOpportunities } from '@/api/growth';
import GrowthProfileEditor from './GrowthProfileEditor';

// Opportunity type options surfaced in the type filter. 'all' clears the filter.
const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'geographic', label: 'Geographic' },
  { value: 'service', label: 'Service' },
  { value: 'content', label: 'Content' },
  { value: 'reputation', label: 'Reputation' },
];

const MIN_SCORE_OPTIONS = [
  { value: '0', label: 'Any score' },
  { value: '50', label: '50+' },
  { value: '70', label: '70+' },
  { value: '85', label: '85+' },
];

function scoreBadgeClass(score) {
  if (score >= 85) return 'bg-emerald-800/50 text-emerald-200 border-emerald-600';
  if (score >= 70) return 'bg-cyan-800/50 text-cyan-200 border-cyan-600';
  return 'bg-slate-700/60 text-slate-200 border-slate-600';
}

export default function GrowthOpportunities({ tenant }) {
  const tenantId = tenant?.id || tenant?.tenant_id || null;

  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [minScore, setMinScore] = useState('0');
  const [editorOpen, setEditorOpen] = useState(false);

  const fetchOpportunities = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listOpportunities(tenantId, {});
      setOpportunities(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load opportunities:', err);
      setError(err.message || 'Failed to load opportunities.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  const handleDismiss = useCallback(
    async (opp) => {
      if (!tenantId) return;
      setBusyId(opp.id);
      // Optimistically remove from the local list.
      setOpportunities((prev) => prev.filter((o) => o.id !== opp.id));
      try {
        await dismissOpportunity(tenantId, opp.id, 'not_relevant');
      } catch (err) {
        console.error('Failed to dismiss opportunity:', err);
        // Roll back the optimistic removal on failure.
        setOpportunities((prev) => [...prev, opp].sort((a, b) => (b.score || 0) - (a.score || 0)));
        setError(err.message || 'Failed to dismiss opportunity.');
      } finally {
        setBusyId(null);
      }
    },
    [tenantId],
  );

  const handleAction = useCallback(
    async (opp) => {
      if (!tenantId) return;
      setBusyId(opp.id);
      // Optimistically mark as actioned.
      setOpportunities((prev) =>
        prev.map((o) => (o.id === opp.id ? { ...o, status: 'actioned' } : o)),
      );
      try {
        await actionOpportunity(tenantId, opp.id, {});
      } catch (err) {
        console.error('Failed to action opportunity:', err);
        setOpportunities((prev) =>
          prev.map((o) => (o.id === opp.id ? { ...o, status: opp.status } : o)),
        );
        setError(err.message || 'Failed to action opportunity.');
      } finally {
        setBusyId(null);
      }
    },
    [tenantId],
  );

  if (!tenant) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-300 mb-2">No Tenant Selected</h3>
          <p className="text-slate-400">Please select a tenant to view opportunities.</p>
        </CardContent>
      </Card>
    );
  }

  // Client-side filtering (sort order from the API — score desc — is preserved).
  const minScoreValue = Number(minScore) || 0;
  const visible = opportunities.filter((o) => {
    if (typeFilter !== 'all' && o.type !== typeFilter) return false;
    if ((o.score || 0) < minScoreValue) return false;
    return true;
  });

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-slate-100">
          <span className="flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-400" />
            Growth Opportunities
          </span>
          <Button
            variant="outline"
            onClick={() => setEditorOpen(true)}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
          >
            <Settings2 className="w-4 h-4 mr-2" />
            Edit market scope
          </Button>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger
              aria-label="Filter by type"
              className="w-40 bg-slate-700 border-slate-600 text-slate-200"
            >
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={minScore} onValueChange={setMinScore}>
            <SelectTrigger
              aria-label="Minimum score"
              className="w-36 bg-slate-700 border-slate-600 text-slate-200"
            >
              <SelectValue placeholder="Any score" />
            </SelectTrigger>
            <SelectContent>
              {MIN_SCORE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert className="bg-red-900/20 border-red-700/50">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div
            className="flex items-center justify-center py-16 text-slate-400"
            data-testid="opportunities-loading"
          >
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Target className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>No opportunities yet — generate an insight from the AI Insights tab.</p>
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div className="space-y-3">
            {visible.map((opp) => {
              const isActioned = opp.status === 'actioned';
              const isBusy = busyId === opp.id;
              return (
                <div
                  key={opp.id}
                  data-testid="opportunity-card"
                  className="bg-slate-700/30 rounded-lg p-4 border border-slate-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-slate-100">{opp.title}</h4>
                        {opp.type && (
                          <Badge className="bg-slate-800/60 text-slate-300 border-slate-600">
                            {opp.type}
                          </Badge>
                        )}
                        {isActioned && (
                          <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-700">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Actioned
                          </Badge>
                        )}
                      </div>
                      {opp.reason && <p className="text-sm text-slate-400 mt-2">{opp.reason}</p>}
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-400">
                        {opp.expected_impact && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-emerald-400" />
                            Impact: {opp.expected_impact}
                          </span>
                        )}
                        {opp.difficulty && <span>Difficulty: {opp.difficulty}</span>}
                      </div>
                      {opp.recommended_action && (
                        <p className="text-sm text-slate-300 mt-2">
                          <span className="text-slate-500">Recommended: </span>
                          {opp.recommended_action}
                        </p>
                      )}
                    </div>
                    {opp.score !== undefined && opp.score !== null && (
                      <Badge className={scoreBadgeClass(opp.score)}>{opp.score}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      onClick={() => handleAction(opp)}
                      disabled={isBusy || isActioned}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Action
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleDismiss(opp)}
                      disabled={isBusy}
                      className="bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <GrowthProfileEditor tenant={tenant} open={editorOpen} onClose={() => setEditorOpen(false)} />
    </Card>
  );
}
