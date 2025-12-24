import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import FunnelChart3D from './FunnelChart3D';
import { useEntityLabel } from '@/components/shared/EntityLabelsContext';
import { useUser } from '@/components/shared/useUser';
import { useAuthCookiesReady } from '@/components/shared/useAuthCookiesReady';
import { Loader2 } from 'lucide-react';
import { getDashboardFunnelCounts } from '@/api/fallbackFunctions';

/**
 * Sales Funnel Widget - Displays 3D cone funnel with real counts.
 * Shows: Sources → Leads → Contacts → Accounts
 * 
 * Props (passed from Dashboard):
 *   tenantFilter: object with tenant_id for filtering
 *   showTestData: boolean to include/exclude test data
 */
export default function SalesFunnelWidget({ tenantFilter = {}, showTestData = true }) {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({
    sources: 0,
    leads: 0,
    contacts: 0,
    accounts: 0,
  });
  const loadingRef = useRef(false);

  const { loading: userLoading } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();

  // Get customized entity labels
  const { plural: sourcesLabel } = useEntityLabel('bizdev_sources');
  const { plural: leadsLabel } = useEntityLabel('leads');
  const { plural: contactsLabel } = useEntityLabel('contacts');
  const { plural: accountsLabel } = useEntityLabel('accounts');

  // Load counts from database
  useEffect(() => {
    // Wait for user + auth cookies readiness
    if (userLoading || !authCookiesReady) {
      setLoading(true);
      return;
    }

    // Guard: Don't fetch if no tenant_id is present
    if (!tenantFilter?.tenant_id) {
      setCounts({ sources: 0, leads: 0, contacts: 0, accounts: 0 });
      setLoading(false);
      return;
    }

    // Prevent duplicate simultaneous requests
    if (loadingRef.current) {
      return;
    }

    const loadCounts = async () => {
      loadingRef.current = true;
      setLoading(true);
      try {
        // Use the new pre-computed dashboard funnel counts (90%+ faster)
        const data = await getDashboardFunnelCounts({ 
          tenant_id: tenantFilter.tenant_id,
          include_test_data: showTestData 
        });

        if (data?.funnel) {
          const suffix = showTestData ? 'total' : 'real';
          setCounts({
            sources: data.funnel[`sources_${suffix}`] || 0,
            leads: data.funnel[`leads_${suffix}`] || 0,
            contacts: data.funnel[`contacts_${suffix}`] || 0,
            accounts: data.funnel[`accounts_${suffix}`] || 0,
          });
        }
      } catch (error) {
        console.error('[SalesFunnelWidget] Failed to load counts:', error);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    };

    loadCounts();
  }, [tenantFilter?.tenant_id, showTestData, userLoading, authCookiesReady]);

  // Build funnel data using entity labels
  const funnelData = useMemo(() => [
    { label: sourcesLabel || 'Sources', count: counts.sources },
    { label: leadsLabel || 'Leads', count: counts.leads },
    { label: contactsLabel || 'Contacts', count: counts.contacts },
    { label: accountsLabel || 'Accounts', count: counts.accounts },
  ], [sourcesLabel, leadsLabel, contactsLabel, accountsLabel, counts]);

  const totalRecords = counts.sources + counts.leads + counts.contacts + counts.accounts;

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-slate-100 flex items-center justify-between">
          <span>Sales Funnel</span>
          {!loading && (
            <span className="text-sm font-normal text-slate-400">
              {totalRecords.toLocaleString()} total
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
          </div>
        ) : totalRecords === 0 ? (
          <div className="flex items-center justify-center h-64 text-slate-500">
            No records to display
          </div>
        ) : (
          <div className="flex justify-center">
            <FunnelChart3D 
              data={funnelData} 
              width={480} 
              height={340}
              minRadius={30}
              maxRadius={130}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
