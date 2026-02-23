import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useUser } from '@/components/shared/useUser.js';
import { useTenant } from '@/components/shared/tenantContext';
import { AICampaign, BACKEND_URL } from '@/api/entities';

// [2026-02-23 Claude] — AiCampaigns overhaul: aligned with DB schema
export default function CampaignMonitor() {
  const { user } = useUser();
  const { selectedTenantId } = useTenant();
  const tenant_id = user?.tenant_id || selectedTenantId;
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState([]);

  const load = useCallback(async () => {
    if (!tenant_id) return;
    setLoading(true);
    try {
      const list = await AICampaign.filter({ tenant_id });
      const arr = Array.isArray(list) ? list : [];
      setCampaigns(arr);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tenant_id]);

  useEffect(() => {
    load();
  }, [load]);

  const startCampaign = async (id) => {
    if (!tenant_id) return;
    try {
      await fetch(`${BACKEND_URL}/api/aicampaigns/${id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tenant_id }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  const rows = campaigns.filter((c) =>
    ['draft', 'scheduled', 'running', 'paused'].includes((c.status || '').toLowerCase()),
  );

  const pauseCampaign = async (id) => {
    if (!tenant_id) return;
    try {
      await fetch(`${BACKEND_URL}/api/aicampaigns/${id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tenant_id }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  const resumeCampaign = async (id) => {
    if (!tenant_id) return;
    try {
      await fetch(`${BACKEND_URL}/api/aicampaigns/${id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tenant_id }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="bg-slate-900 text-slate-300 p-4 rounded-md border border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">Campaign Monitor</h3>
        <Button
          variant="outline"
          onClick={load}
          disabled={loading}
          className="bg-slate-800 border-slate-700 text-slate-200"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <Separator className="bg-slate-700 mb-3" />

      {rows.length === 0 ? (
        <div className="text-sm text-slate-500">No active campaigns yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-2 rounded border border-slate-800 bg-slate-800/40"
            >
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="border-slate-600 text-slate-300 capitalize">
                  {c.status}
                </Badge>
                <div className="font-medium text-slate-200">{c.name}</div>
                <div className="text-xs text-slate-500">
                  {(c.campaign_type || c.metadata?.campaign_type || 'email').replace('_', ' ')}
                </div>
                <div className="text-xs text-slate-500">
                  {Array.isArray(c.target_contacts) ? `${c.target_contacts.length} recipients` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.status === 'draft' && (
                  <Button
                    size="sm"
                    onClick={() => startCampaign(c.id)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Start
                  </Button>
                )}
                {(c.status === 'scheduled' || c.status === 'running') && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => pauseCampaign(c.id)}
                    className="bg-slate-800 border-slate-700 text-slate-200"
                  >
                    Pause
                  </Button>
                )}
                {c.status === 'paused' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resumeCampaign(c.id)}
                    className="bg-slate-800 border-slate-700 text-slate-200"
                  >
                    Resume
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
