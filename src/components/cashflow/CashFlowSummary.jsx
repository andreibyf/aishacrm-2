import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

export default function CashFlowSummary({ summary }) {
  // Use bracket notation ONLY - never dot notation
  const totalIncome = (summary && summary['totalIncome']) || 0;
  const totalExpenses = (summary && summary['totalExpenses']) || 0;
  const netCashFlow = (summary && summary['netCashFlow']) || 0;
  const projectedIncome = (summary && summary['projectedIncome']) || 0;

  const summaryItems = [
    {
      title: "Total Income",
      value: `$${totalIncome.toLocaleString()}`,
      icon: TrendingUp,
      color: "text-green-400",
      bgColor: "bg-green-900/30"
    },
    {
      title: "Total Expenses", 
      value: `$${totalExpenses.toLocaleString()}`,
      icon: TrendingDown,
      color: "text-red-400",
      bgColor: "bg-red-900/30"
    },
    {
      title: "Net Cash Flow",
      value: `$${netCashFlow.toLocaleString()}`,
      icon: DollarSign,
      color: netCashFlow >= 0 ? "text-green-400" : "text-red-400",
      bgColor: netCashFlow >= 0 ? "bg-green-900/30" : "bg-red-900/30"
    },
    {
      title: "Projected Income",
      value: `$${projectedIncome.toLocaleString()}`,
      icon: BarChart3,
      color: "text-blue-400",
      bgColor: "bg-blue-900/30"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {summaryItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <Card key={index} className="bg-slate-800 border-slate-700 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-400">
                {item.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${item.bgColor}`}>
                <Icon className={`w-5 h-5 ${item.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${item.color}`}>
                {item.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}