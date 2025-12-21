import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Target, Percent } from "lucide-react";

/**
 * ConversionRates Widget
 * Shows conversion funnel metrics using the formula:
 * conversion_rate = promoted / (active + promoted)
 * 
 * Uses brand colors aligned with AiSHA CRM logo (blue/cyan theme)
 * Uses pre-fetched stats from dashboard bundle - no extra API calls.
 */
export default function ConversionRates({ stats = {} }) {
  // Calculate conversion rates using the correct formula:
  // conversion_rate = promoted / (active + promoted)
  const rates = React.useMemo(() => {
    const totalLeads = stats.totalLeads || 0;
    const openLeads = stats.openLeads || 0;
    
    const totalOpportunities = stats.totalOpportunities || 0;
    const openOpportunities = stats.openOpportunities || 0;
    const wonOpportunities = stats.wonOpportunities || 0;
    
    // Lead to Opportunity rate
    const leadToOppRate = totalLeads > 0 
      ? Math.round((totalOpportunities / totalLeads) * 100) 
      : 0;
    
    // Opportunity Win Rate
    const oppWinRate = totalOpportunities > 0 
      ? Math.round((wonOpportunities / totalOpportunities) * 100) 
      : 0;
    
    // Lead to Won: overall conversion
    const leadToWonRate = totalLeads > 0 
      ? Math.round((wonOpportunities / totalLeads) * 100) 
      : 0;

    return {
      leadToOppRate,
      oppWinRate,
      leadToWonRate,
      totalLeads,
      openLeads,
      totalOpportunities,
      openOpportunities,
      wonOpportunities,
    };
  }, [stats]);

  // Brand colors: Blue (#2563eb) to Cyan (#06b6d4) gradient feel
  // Using Tailwind's blue and cyan palette
  const funnelSteps = [
    {
      label: "Lead → Opportunity",
      description: "Leads that became opportunities",
      rate: rates.leadToOppRate,
      numerator: rates.totalOpportunities,
      denominator: rates.totalLeads,
      // Light blue (first step)
      textColor: "text-blue-400",
      bgColor: "bg-blue-500/20",
      barColor: "bg-blue-500",
    },
    {
      label: "Opportunity → Won",
      description: "Win rate on opportunities",
      rate: rates.oppWinRate,
      numerator: rates.wonOpportunities,
      denominator: rates.totalOpportunities,
      // Cyan (middle step)
      textColor: "text-cyan-400",
      bgColor: "bg-cyan-500/20",
      barColor: "bg-cyan-500",
    },
    {
      label: "Lead → Won",
      description: "Overall sales efficiency",
      rate: rates.leadToWonRate,
      numerator: rates.wonOpportunities,
      denominator: rates.totalLeads,
      // Teal accent (final/highlight step) - brand primary gradient endpoint
      textColor: "text-teal-400",
      bgColor: "bg-teal-500/20",
      barColor: "bg-gradient-to-r from-blue-500 to-cyan-400",
      isHighlight: true,
    },
  ];

  const getRateOpacity = (rate) => {
    if (rate >= 25) return "opacity-100";
    if (rate >= 10) return "opacity-90";
    if (rate > 0) return "opacity-75";
    return "opacity-50";
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-slate-100 flex items-center gap-2 text-lg">
          <Percent className="w-5 h-5 text-cyan-400" />
          Conversion Rates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {funnelSteps.map((step, index) => (
          <div 
            key={index} 
            className={`p-3 rounded-lg transition-all ${
              step.isHighlight 
                ? 'bg-gradient-to-r from-blue-900/30 to-cyan-900/30 border border-cyan-500/30' 
                : 'bg-slate-700/30 hover:bg-slate-700/50'
            }`}
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200">
                  {step.label}
                </span>
              </div>
              <div className={`flex items-center gap-1 ${getRateOpacity(step.rate)}`}>
                <span className={`text-xl font-bold tabular-nums ${step.textColor}`}>
                  {step.rate}
                </span>
                <span className={`text-sm ${step.textColor}`}>%</span>
              </div>
            </div>
            
            {/* Description */}
            <p className="text-xs text-slate-500 mb-2">{step.description}</p>
            
            {/* Ratio display */}
            <div className="flex items-center gap-2 text-xs mb-2">
              <span className={`px-2 py-0.5 rounded ${step.bgColor} ${step.textColor} font-medium`}>
                {step.numerator.toLocaleString()}
              </span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
              <span className="text-slate-400">
                of {step.denominator.toLocaleString()}
              </span>
            </div>
            
            {/* Progress bar */}
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-700 ease-out ${step.barColor}`}
                style={{ width: `${Math.min(step.rate, 100)}%` }}
              />
            </div>
          </div>
        ))}
        
        {/* Summary footer with brand gradient */}
        <div className="pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs">
          <span className="text-slate-500 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-blue-400" />
            Pipeline Status
          </span>
          <span className="text-slate-300 font-medium">
            <span className="text-blue-400">{rates.openOpportunities}</span> active • 
            <span className="text-cyan-400 ml-1">{rates.wonOpportunities}</span> won
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
