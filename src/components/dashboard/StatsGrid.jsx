import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Target, Building2, TrendingUp, DollarSign, Calendar, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function StatsGrid({ stats }) {
  const statCards = [
    {
      title: "Total Contacts",
      value: stats?.totalContacts || 0,
      icon: Users,
      color: "blue",
      ringColor: "ring-blue-500",
      textColor: "text-blue-400",
      description: "All contacts in your CRM"
    },
    {
      title: "New Leads",
      value: stats?.newLeads || 0,
      icon: Target,
      color: "green",
      ringColor: "ring-green-500",
      textColor: "text-green-400",
      description: "New leads in last 30 days"
    },
    {
      title: "Active Opportunities",
      value: stats?.activeOpportunities || 0,
      icon: TrendingUp,
      color: "orange",
      ringColor: "ring-orange-500",
      textColor: "text-orange-400",
      description: "Active sales opportunities"
    },
    {
      title: "Pipeline Value",
      value: stats?.pipelineValue ? `$${(stats.pipelineValue / 1000).toFixed(0)}K` : "$0",
      icon: DollarSign,
      color: "emerald",
      ringColor: "ring-emerald-500",
      textColor: "text-emerald-400",
      description: "Total value of open opportunities"
    },
    {
      title: "Activities Logged",
      value: stats?.activitiesLogged || 0,
      icon: Calendar,
      color: "cyan",
      ringColor: "ring-cyan-500",
      textColor: "text-cyan-400",
      description: "Activities completed in last 30 days"
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {statCards.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className={`relative bg-slate-900/50 backdrop-blur-sm rounded-xl p-4 transition-all hover:bg-slate-800/50 ring-1 ${stat.ringColor}`}
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-slate-400">{stat.title}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-4 h-4 text-slate-500 hover:text-slate-400 transition-colors cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
                    <p>{stat.description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
          </div>
        );
      })}
    </div>
  );
}