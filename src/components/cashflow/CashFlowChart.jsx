import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from "date-fns";

function ensurePlain(obj) {
  if (obj && typeof obj === "object" && typeof obj['hasOwnProperty'] !== "function") {
    return JSON.parse(JSON.stringify(obj));
  }
  return obj;
}

export default function CashFlowChart({ transactions }) {
  transactions = Array['isArray'](transactions) ? transactions.map(ensurePlain) : [];
  
  const chartData = useMemo(() => {
    if (!transactions || !Array['isArray'](transactions)) {
      return [];
    }

    const now = new Date();
    const last6Months = eachMonthOfInterval({
      start: subMonths(startOfMonth(now), 5),
      end: endOfMonth(now)
    });

    return last6Months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const monthLabel = format(month, "MMM yyyy");

      let income = 0;
      let expenses = 0;

      transactions.forEach(txn => {
        const plainTxn = ensurePlain(txn);
        const txnDate = new Date(plainTxn['transaction_date']);
        if (txnDate >= monthStart && txnDate <= monthEnd) {
          const amount = Number(plainTxn['amount']) || 0;
          if (plainTxn['transaction_type'] === "income") {
            income += amount;
          } else if (plainTxn['transaction_type'] === "expense") {
            expenses += amount;
          }
        }
      });

      return {
        month: monthLabel,
        income: Math.round(income * 100) / 100,
        expenses: Math.round(expenses * 100) / 100
      };
    });
  }, [transactions]);

  return (
    <Card className="bg-slate-800 border-slate-700 shadow-lg">
      <CardHeader>
        <CardTitle className="text-slate-100">Cash Flow Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis dataKey="month" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1e293b', 
                border: '1px solid #475569',
                borderRadius: '8px',
                color: '#e2e8f0'
              }}
              formatter={(value) => `$${value.toLocaleString()}`}
            />
            <Legend />
            <Bar dataKey="income" fill="#22c55e" name="Income" />
            <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}