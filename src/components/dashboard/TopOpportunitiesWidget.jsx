import React from 'react';
import { useUser } from '@/components/shared/useUser';
import { useAuthCookiesReady } from '@/components/shared/useAuthCookiesReady';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Target } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { getDashboard } from '@/api/growth';

function scoreBadgeClass(score) {
  if (score >= 85) return 'bg-emerald-800/50 text-emerald-200 border-emerald-600';
  if (score >= 70) return 'bg-cyan-800/50 text-cyan-200 border-cyan-600';
  return 'bg-slate-700/60 text-slate-200 border-slate-600';
}

export default function TopOpportunitiesWidget({ tenantFilter }) {
  const [opportunities, setOpportunities] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const { loading: userLoading } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();

  React.useEffect(() => {
    // Wait for user + auth cookies readiness (mirrors TopAccounts).
    if (userLoading || !authCookiesReady) {
      setLoading(true);
      return;
    }
    const loadOpportunities = async () => {
      try {
        // Guard: don't fetch without a tenant_id.
        if (!tenantFilter?.tenant_id) {
          setOpportunities([]);
          setLoading(false);
          return;
        }
        const dashboard = await getDashboard(tenantFilter.tenant_id);
        const top = Array.isArray(dashboard?.top_opportunities) ? dashboard.top_opportunities : [];
        // Top 3 by score (API already sorts; slice defensively).
        const sorted = [...top].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
        setOpportunities(sorted);
      } catch (error) {
        console.error('Failed to load top opportunities:', error);
        setOpportunities([]);
      } finally {
        setLoading(false);
      }
    };

    loadOpportunities();
  }, [tenantFilter, userLoading, authCookiesReady]);

  return (
    <Card className="bg-slate-800 border-slate-700 h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-400" />
          Top Opportunities
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-700/50 rounded animate-pulse" />
            ))}
          </div>
        ) : opportunities.length > 0 ? (
          <div className="space-y-4">
            {opportunities.map((opp, index) => (
              <a
                key={opp.id || index}
                href={createPageUrl('Reports') + '?tab=opportunities'}
                className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <span className="text-emerald-400 font-semibold text-sm">{index + 1}</span>
                  </div>
                  <div>
                    <p className="text-slate-200 font-medium group-hover:text-emerald-400 transition-colors">
                      {opp.title}
                    </p>
                    {opp.type && <p className="text-slate-500 text-xs">{opp.type}</p>}
                  </div>
                </div>
                {opp.score !== undefined && opp.score !== null && (
                  <Badge className={scoreBadgeClass(opp.score)}>{opp.score}</Badge>
                )}
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-50 text-emerald-400/70" />
            <p className="mb-3">No opportunities surfaced yet.</p>
            <a
              href={createPageUrl('Reports') + '?tab=insights'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Generate your first insight
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
