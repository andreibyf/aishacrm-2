import { useState, useEffect } from 'react';
import { ArrowRight, UserPlus, UserMinus, RefreshCw, ChevronUp } from 'lucide-react';

/**
 * AssignmentHistory — visual breadcrumb trail of lead assignment changes.
 * Shows who assigned/reassigned/unassigned and when, in chronological order.
 */
export default function AssignmentHistory({ entityId, entityType = 'lead', tenantId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityId || !tenantId) return;

    const fetchHistory = async () => {
      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';

        // Map entity types to their API route prefixes
        const routeMap = {
          lead: '/api/v2/leads',
          contact: '/api/v2/contacts',
          account: '/api/v2/accounts',
          opportunity: '/api/v2/opportunities',
          activity: '/api/v2/activities',
          bizdev_source: '/api/bizdevsources',
        };
        const routePrefix = routeMap[entityType] || routeMap.lead;

        const res = await fetch(
          `${BACKEND_URL}${routePrefix}/${entityId}/assignment-history?tenant_id=${tenantId}`,
          { credentials: 'include' },
        );
        if (res.ok) {
          const json = await res.json();
          setHistory(json.data || []);
        }
      } catch (err) {
        console.warn('Failed to load assignment history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [entityId, entityType, tenantId]);

  if (loading) {
    return <div className="text-xs text-slate-500 py-2">Loading history...</div>;
  }

  if (history.length === 0) {
    return <div className="text-xs text-slate-500 py-2 italic">No assignment changes yet</div>;
  }

  const actionConfig = {
    assign: { icon: UserPlus, color: 'text-green-400', label: 'Assigned' },
    unassign: { icon: UserMinus, color: 'text-amber-400', label: 'Unassigned' },
    reassign: { icon: RefreshCw, color: 'text-blue-400', label: 'Reassigned' },
    escalate: { icon: ChevronUp, color: 'text-purple-400', label: 'Escalated' },
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-0">
      {history.map((entry, idx) => {
        const config = actionConfig[entry.action] || actionConfig.assign;
        const Icon = config.icon;
        const isLast = idx === history.length - 1;

        return (
          <div key={entry.id} className="flex items-start gap-2 relative">
            {/* Timeline line */}
            {!isLast && <div className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-700" />}

            {/* Icon dot */}
            <div
              className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center ${config.color}`}
            >
              <Icon className="w-3 h-3" />
            </div>

            {/* Content */}
            <div className="flex-1 pb-3 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                {entry.action === 'reassign' && entry.assigned_from_name && (
                  <>
                    <span className="text-xs text-slate-500">from</span>
                    <span className="text-xs text-slate-300">{entry.assigned_from_name}</span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                  </>
                )}
                {entry.assigned_to_name ? (
                  <>
                    {entry.action !== 'reassign' && (
                      <span className="text-xs text-slate-500">to</span>
                    )}
                    <span className="text-xs text-slate-300 font-medium">
                      {entry.assigned_to_name}
                    </span>
                  </>
                ) : entry.action === 'unassign' ? (
                  <span className="text-xs text-slate-500 italic">returned to pool</span>
                ) : null}
              </div>
              <div className="text-[10px] text-slate-600 mt-0.5">
                {entry.assigned_by_name && <span>by {entry.assigned_by_name} · </span>}
                {formatTime(entry.created_at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
