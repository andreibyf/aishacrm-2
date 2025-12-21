import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BizDevSource, Lead, Contact, Account } from '@/api/entities';
import FunnelChart3D from './FunnelChart3D';
import { useEntityLabel } from '@/components/shared/EntityLabelsContext';
import { useUser } from '@/components/shared/useUser';
import { useAuthCookiesReady } from '@/components/shared/useAuthCookiesReady';
import { Loader2 } from 'lucide-react';

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

    const loadCounts = async () => {
      // Guard: Don't fetch if no tenant_id is present
      if (!tenantFilter?.tenant_id) {
        setCounts({ sources: 0, leads: 0, contacts: 0, accounts: 0 });
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Build filter with test data handling
        const filter = { ...tenantFilter };
        if (!showTestData) {
          filter.is_test_data = false;
        }

        // Fetch counts in parallel
        const [sourcesData, leadsData, contactsData, accountsData] = await Promise.all([
          BizDevSource.filter(filter, 'id', 10000).catch(() => []),
          Lead.filter(filter, 'id', 10000).catch(() => []),
          Contact.filter(filter, 'id', 10000).catch(() => []),
          Account.filter(filter, 'id', 10000).catch(() => []),
        ]);

        setCounts({
          sources: Array.isArray(sourcesData) ? sourcesData.length : 0,
          leads: Array.isArray(leadsData) ? leadsData.length : 0,
          contacts: Array.isArray(contactsData) ? contactsData.length : 0,
          accounts: Array.isArray(accountsData) ? accountsData.length : 0,
        });
      } catch (error) {
        console.error('[SalesFunnelWidget] Failed to load counts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCounts();
  }, [tenantFilter, showTestData, userLoading, authCookiesReady]);

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
