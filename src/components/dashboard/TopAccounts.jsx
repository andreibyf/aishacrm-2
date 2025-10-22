import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, TrendingUp, DollarSign } from "lucide-react";
import { createPageUrl } from "@/utils";

export default function TopAccounts({ tenantFilter, showTestData }) {
  const [accounts, setAccounts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const loadTopAccounts = async () => {
      try {
        const { Account } = await import("@/api/entities");
        
        let filter = { ...tenantFilter };
        if (!showTestData) {
          filter.is_test_data = { $ne: true };
        }
        
        const accountsData = await Account.filter(filter);
        
        const sortedAccounts = (accountsData || [])
          .filter(a => a.annual_revenue)
          .sort((a, b) => (b.annual_revenue || 0) - (a.annual_revenue || 0))
          .slice(0, 5);
        
        setAccounts(sortedAccounts);
      } catch (error) {
        console.error("Failed to load top accounts:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTopAccounts();
  }, [tenantFilter, showTestData]);

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
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-slate-100 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-400" />
          Top Accounts by Revenue
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
                    {account.industry && (
                      <p className="text-slate-500 text-xs">{account.industry}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-400" />
                  <span className="text-slate-300 font-semibold">
                    {formatCurrency(account.annual_revenue)}
                  </span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No accounts with revenue data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}