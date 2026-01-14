import React from "react";
import { useUser } from "@/components/shared/useUser";
import { useAuthCookiesReady } from "@/components/shared/useAuthCookiesReady";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, DollarSign } from "lucide-react";
import { createPageUrl } from "@/utils";
import { formatIndustry } from "@/utils/industryUtils";

export default function TopAccounts({ tenantFilter, showTestData }) {
  const [accounts, setAccounts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const { loading: userLoading } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();

  React.useEffect(() => {
    // Wait for user + auth cookies readiness
    if (userLoading || !authCookiesReady) {
      setLoading(true);
      return;
    }
    const loadTopAccounts = async () => {
      try {
        // Guard: Don't fetch if no tenant_id is present
        if (!tenantFilter?.tenant_id) {
          setAccounts([]);
          setLoading(false);
          return;
        }
        
        const { Account, Opportunity, Contact } = await import("@/api/entities");
        
        let filter = { ...tenantFilter };
        if (!showTestData) {
          filter.is_test_data = false;
        }
        
        // Load all necessary data
        // Won opportunities can have stage: 'won', 'closed_won', or 'closedwon' (legacy)
        const [accountsData, allOpportunities, contactsData] = await Promise.all([
          Account.filter(filter),
          Opportunity.filter(filter), // Get all opportunities, filter won stages locally
          Contact.filter(filter)
        ]);
        
        // Filter for won opportunities - support all stage variants
        const opportunitiesData = (allOpportunities || []).filter(opp => 
          ['won', 'closed_won', 'closedwon'].includes(opp.stage?.toLowerCase())
        );
        
        // Build contact lookup map (contact_id -> account_id)
        const contactToAccountMap = {};
        (contactsData || []).forEach(contact => {
          if (contact.id && contact.account_id) {
            contactToAccountMap[contact.id] = contact.account_id;
          }
        });
        
        // Calculate revenue per account
        const accountRevenue = {};
        const accountDealCount = {};
        
        (opportunitiesData || []).forEach(opp => {
          let targetAccountId = null;
          
          // Attribution logic:
          // 1. Direct account_id on opportunity
          // 2. Rollup through contact -> account relationship
          if (opp.account_id) {
            targetAccountId = opp.account_id;
          } else if (opp.contact_id && contactToAccountMap[opp.contact_id]) {
            targetAccountId = contactToAccountMap[opp.contact_id];
          }
          
          if (targetAccountId) {
            accountRevenue[targetAccountId] = (accountRevenue[targetAccountId] || 0) + (parseFloat(opp.amount) || 0);
            accountDealCount[targetAccountId] = (accountDealCount[targetAccountId] || 0) + 1;
          }
        });
        
        // Enrich accounts with revenue data and sort
        const accountsWithRevenue = (accountsData || [])
          .map(account => ({
            ...account,
            totalRevenue: accountRevenue[account.id] || 0,
            dealCount: accountDealCount[account.id] || 0
          }))
          .filter(a => a.totalRevenue > 0) // Only show accounts with won deals
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
          .slice(0, 5);
        
        setAccounts(accountsWithRevenue);
      } catch (error) {
        console.error("Failed to load top accounts:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTopAccounts();
  }, [tenantFilter, showTestData, userLoading, authCookiesReady]);

  const formatCurrency = (amount) => {
    if (!amount) return "$0";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card className="bg-slate-800 border-slate-700 h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-400" />
          Top Customers by Won Deals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-700/50 rounded animate-pulse" />
            ))}
          </div>
        ) : accounts.length > 0 ? (
          <div className="space-y-4">
            {accounts.map((account, index) => (
              <a
                key={account.id}
                href={createPageUrl("Accounts") + `?accountId=${account.id}`}
                className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <span className="text-blue-400 font-semibold text-sm">{index + 1}</span>
                  </div>
                  <div>
                    <p className="text-slate-200 font-medium group-hover:text-blue-400 transition-colors">
                      {account.name}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {account.dealCount} {account.dealCount === 1 ? 'deal' : 'deals'} won
                      {account.industry && ` • ${formatIndustry(account.industry)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <span className="text-slate-300 font-semibold">
                    {formatCurrency(account.totalRevenue)}
                  </span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No accounts with won deals</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}