import {
  Calendar,
  CheckCircle,
  DollarSign,
  HelpCircle,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEntityLabel } from "@/components/shared/entityLabelsHooks";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function StatsGrid({ stats }) {
  const { plural: contactsLabel } = useEntityLabel('contacts');
  const { plural: leadsLabel } = useEntityLabel('leads');
  const { plural: opportunitiesLabel } = useEntityLabel('opportunities');
  const { plural: activitiesLabel } = useEntityLabel('activities');

  const statCards = [
    {
      title: `Total ${contactsLabel}`,
      value: stats?.totalContacts || 0,
      icon: Users,
      color: "blue",
      ringColor: "ring-blue-500",
      textColor: "text-blue-400",
      description: `All ${contactsLabel.toLowerCase()} in your CRM`,
      href: createPageUrl("Contacts"),
    },
    {
      title: `New ${leadsLabel}`,
      value: stats?.newLeads || 0,
      icon: Target,
      color: "green",
      ringColor: "ring-green-500",
      textColor: "text-green-400",
      description: `New ${leadsLabel.toLowerCase()} in last 30 days`,
      href: createPageUrl("Leads"),
    },
    {
      title: `Active ${opportunitiesLabel}`,
      value: stats?.activeOpportunities || 0,
      icon: TrendingUp,
      color: "orange",
      ringColor: "ring-orange-500",
      textColor: "text-orange-400",
      description: `Active sales ${opportunitiesLabel.toLowerCase()} (not won or lost)`,
      href: createPageUrl("Opportunities"),
    },
    {
      title: `Won ${opportunitiesLabel}`,
      value: stats?.wonOpportunities || 0,
      icon: CheckCircle,
      color: "green",
      ringColor: "ring-green-600",
      textColor: "text-green-500",
      description: `Total closed-won ${opportunitiesLabel.toLowerCase()}`,
      secondaryValue: typeof stats?.wonValue === "number"
        ? `$${(stats.wonValue / 1000).toFixed(0)}K`
        : null,
      href: createPageUrl("Opportunities"),
    },
    {
      title: `Pipeline Value`,
      value: typeof stats?.pipelineValue === "number"
        ? `$${(stats.pipelineValue / 1000).toFixed(0)}K`
        : "$0",
      icon: DollarSign,
      color: "emerald",
      ringColor: "ring-emerald-500",
      textColor: "text-emerald-400",
      description: `Total value of open ${opportunitiesLabel.toLowerCase()}`,
      href: createPageUrl("Opportunities"),
    },
    {
      title: `${activitiesLabel} Logged`,
      value: stats?.activitiesLogged || 0,
      icon: Calendar,
      color: "cyan",
      ringColor: "ring-cyan-500",
      textColor: "text-cyan-400",
      description: `${activitiesLabel} created in last 30 days`,
      href: createPageUrl("Activities"),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {statCards.map((stat, index) => {
        const cardContent = (
          <>
            <div className="flex items-start justify-between mb-3">
              <span className="text-sm font-medium text-slate-400">
                {stat.title}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle
                      className="w-4 h-4 text-slate-500 hover:text-slate-400 transition-colors cursor-help"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    />
                  </TooltipTrigger>
                  <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
                    <p>{stat.description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`text-3xl font-bold ${stat.textColor}`}>
              {stat.value}
            </p>
            {stat.secondaryValue && (
              <p className="text-sm text-slate-400 mt-1">
                {stat.secondaryValue} total
              </p>
            )}
          </>
        );

        return stat.href ? (
          <Link
            key={index}
            to={stat.href}
            className={`relative bg-slate-900/50 backdrop-blur-sm rounded-xl p-4 transition-all hover:bg-slate-800/50 hover:scale-[1.02] ring-1 ${stat.ringColor} block cursor-pointer`}
          >
            {cardContent}
          </Link>
        ) : (
          <div
            key={index}
            className={`relative bg-slate-900/50 backdrop-blur-sm rounded-xl p-4 transition-all hover:bg-slate-800/50 ring-1 ${stat.ringColor}`}
          >
            {cardContent}
          </div>
        );
      })}
    </div>
  );
}
