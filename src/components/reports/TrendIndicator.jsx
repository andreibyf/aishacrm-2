import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from "@/lib/utils";

export default function TrendIndicator({ percentage, period = "from last month" }) {
  if (percentage === null || typeof percentage === 'undefined' || !isFinite(percentage)) {
    return null; // Don't render if the trend is not available
  }

  const isPositive = percentage > 0;
  const isNegative = percentage < 0;
  const isNeutral = percentage === 0;

  const color = isPositive ? "text-green-600" : isNegative ? "text-red-600" : "text-slate-500";
  const Icon = isPositive ? ArrowUpRight : isNegative ? ArrowDownRight : Minus;

  return (
    <p className={cn("text-xs text-muted-foreground flex items-center", color)}>
      <Icon className="w-4 h-4 mr-1" />
      {isPositive ? '+' : ''}{percentage.toFixed(1)}% {period}
    </p>
  );
}