import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  TrendingUp,
  Target,
  CheckSquare,
  Trophy,
  Users,
  Building2,
  ArrowDown,
  ArrowRight,
  ArrowLeft,
  Lightbulb,
  BookOpen,
} from "lucide-react";

const WorkflowStage = ({ icon: Icon, title, description, onClick, color = "blue", className = "" }) => {
  // Map color prop to full Tailwind classes (JIT compiler needs complete class names)
  const colorClasses = {
    cyan: {
      bg: "bg-cyan-600/20",
      text: "text-cyan-500",
      hoverBorder: "hover:border-cyan-500",
      hoverShadow: "hover:shadow-cyan-500/20"
    },
    blue: {
      bg: "bg-blue-600/20",
      text: "text-blue-500",
      hoverBorder: "hover:border-blue-500",
      hoverShadow: "hover:shadow-blue-500/20"
    },
    purple: {
      bg: "bg-purple-600/20",
      text: "text-purple-500",
      hoverBorder: "hover:border-purple-500",
      hoverShadow: "hover:shadow-purple-500/20"
    },
    indigo: {
      bg: "bg-indigo-600/20",
      text: "text-indigo-500",
      hoverBorder: "hover:border-indigo-500",
      hoverShadow: "hover:shadow-indigo-500/20"
    },
    emerald: {
      bg: "bg-emerald-600/20",
      text: "text-emerald-500",
      hoverBorder: "hover:border-emerald-500",
      hoverShadow: "hover:shadow-emerald-500/20"
    },
    teal: {
      bg: "bg-teal-600/20",
      text: "text-teal-500",
      hoverBorder: "hover:border-teal-500",
      hoverShadow: "hover:shadow-teal-500/20"
    }
  };

  const colors = colorClasses[color] || colorClasses.blue;

  return (
    <Card
      className={`bg-slate-800 border-slate-700 ${colors.hoverBorder} hover:shadow-lg ${colors.hoverShadow} transition-all duration-300 cursor-pointer ${className}`}
      onClick={onClick}
    >
      <CardContent className="p-6 text-center">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-lg ${colors.bg} mb-4`}>
          <Icon className={`w-8 h-8 ${colors.text}`} />
        </div>
        <h3 className="text-xl font-bold text-slate-100 mb-2">{title}</h3>
        <p className="text-sm text-slate-400">{description}</p>
      </CardContent>
    </Card>
  );
};

const WorkflowArrow = ({ direction = "down", className = "" }) => {
  const ArrowIcon = direction === "down" ? ArrowDown : direction === "right" ? ArrowRight : ArrowLeft;
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <ArrowIcon className="w-8 h-8 text-slate-500 animate-pulse" />
    </div>
  );
};

const DecisionDiamond = ({ title, onClick, color = "green" }) => {
  // Map color prop to full Tailwind classes
  const colorClasses = {
    green: {
      bg: "bg-green-600/20",
      border: "border-green-500",
      hoverBorder: "hover:border-green-400",
      hoverShadow: "hover:shadow-green-500/30",
      text: "text-green-500"
    },
    yellow: {
      bg: "bg-yellow-600/20",
      border: "border-yellow-500",
      hoverBorder: "hover:border-yellow-400",
      hoverShadow: "hover:shadow-yellow-500/30",
      text: "text-yellow-500"
    }
  };

  const colors = colorClasses[color] || colorClasses.green;

  return (
    <div className="flex items-center justify-center">
      <div
        className={`relative w-32 h-32 ${colors.bg} border-2 ${colors.border} ${colors.hoverBorder} hover:shadow-lg ${colors.hoverShadow} transition-all duration-300 cursor-pointer`}
        style={{ transform: "rotate(45deg)" }}
        onClick={onClick}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: "rotate(-45deg)" }}
        >
          <div className="text-center">
            <Trophy className={`w-8 h-8 ${colors.text} mx-auto mb-1`} />
            <span className="text-sm font-bold text-slate-100">{title}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function WorkflowGuide() {
  const navigate = useNavigate();

  const stages = [
    {
      icon: Database,
      title: "BizDev Sources",
      description: "Import and manage potential business leads from external sources",
      page: "BizDevSources",
      color: "cyan",
    },
    {
      icon: TrendingUp,
      title: "Leads",
      description: "Qualify and nurture prospects through the sales funnel",
      page: "Leads",
      color: "blue",
    },
    {
      icon: Target,
      title: "Opportunities",
      description: "Track active deals and move them through sales stages",
      page: "Opportunities",
      color: "purple",
    },
    {
      icon: CheckSquare,
      title: "Activities",
      description: "Schedule and complete tasks, calls, meetings, and follow-ups",
      page: "Activities",
      color: "indigo",
    },
  ];

  const finalStages = [
    {
      icon: Users,
      title: "Contacts",
      description: "Manage individual customer relationships and communication",
      page: "Contacts",
      color: "emerald",
    },
    {
      icon: Building2,
      title: "Accounts",
      description: "Track company-level relationships and organizational details",
      page: "Accounts",
      color: "teal",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
            <Lightbulb className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-slate-100">CRM Workflow Guide</h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Follow this visual guide to understand how data flows through your CRM.
            Click on any stage to navigate directly to that section.
          </p>
        </div>

        {/* Workflow Visual */}
        <div className="space-y-6">
          {/* Stage 1: Sources */}
          <div className="flex flex-col items-center">
            <WorkflowStage
              icon={stages[0].icon}
              title={stages[0].title}
              description={stages[0].description}
              onClick={() => navigate(createPageUrl(stages[0].page))}
              color={stages[0].color}
              className="w-full max-w-md"
            />
            <WorkflowArrow direction="down" className="my-4" />
          </div>

          {/* Stage 2: Leads */}
          <div className="flex flex-col items-center">
            <WorkflowStage
              icon={stages[1].icon}
              title={stages[1].title}
              description={stages[1].description}
              onClick={() => navigate(createPageUrl(stages[1].page))}
              color={stages[1].color}
              className="w-full max-w-md"
            />
            <WorkflowArrow direction="down" className="my-4" />
          </div>

          {/* Stage 3: Opportunities */}
          <div className="flex flex-col items-center">
            <WorkflowStage
              icon={stages[2].icon}
              title={stages[2].title}
              description={stages[2].description}
              onClick={() => navigate(createPageUrl(stages[2].page))}
              color={stages[2].color}
              className="w-full max-w-md"
            />
            <WorkflowArrow direction="down" className="my-4" />
          </div>

          {/* Stage 4: Activities */}
          <div className="flex flex-col items-center">
            <WorkflowStage
              icon={stages[3].icon}
              title={stages[3].title}
              description={stages[3].description}
              onClick={() => navigate(createPageUrl(stages[3].page))}
              color={stages[3].color}
              className="w-full max-w-md"
            />
            <WorkflowArrow direction="down" className="my-4" />
          </div>

          {/* Decision: Won */}
          <div className="flex flex-col items-center my-8">
            <DecisionDiamond
              title="Won"
              onClick={() => navigate(createPageUrl("Opportunities") + "?filter=closed_won")}
              color="green"
            />
            <div className="mt-8 text-center">
              <p className="text-sm text-slate-400">Deal Closed Successfully! 🎉</p>
            </div>
          </div>

          {/* Final Stages: Contacts & Accounts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            {finalStages.map((stage, index) => (
              <WorkflowStage
                key={index}
                icon={stage.icon}
                title={stage.title}
                description={stage.description}
                onClick={() => navigate(createPageUrl(stage.page))}
                color={stage.color}
              />
            ))}
          </div>

          {/* Bidirectional Arrow between Contacts and Accounts */}
          <div className="flex items-center justify-center gap-4 my-4">
            <ArrowLeft className="w-6 h-6 text-slate-500" />
            <span className="text-sm text-slate-400">Contacts & Accounts are interconnected</span>
            <ArrowRight className="w-6 h-6 text-slate-500" />
          </div>
        </div>

        {/* Additional Info Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-12">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-500" />
                Key Workflow Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="text-slate-300 space-y-2 text-sm">
              <p>• <strong>Sources:</strong> Import bulk data from directories, trade shows, or marketing campaigns</p>
              <p>• <strong>Leads:</strong> Qualify prospects and track their journey through your sales funnel</p>
              <p>• <strong>Opportunities:</strong> Convert qualified leads into active deals with revenue potential</p>
              <p>• <strong>Activities:</strong> Schedule follow-ups, calls, and meetings to move deals forward</p>
              <p>• <strong>Contacts & Accounts:</strong> Maintain relationships after deals are won</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-500" />
                Role-Based Workflows
              </CardTitle>
            </CardHeader>
            <CardContent className="text-slate-300 space-y-3 text-sm">
              <div>
                <Badge className="bg-purple-600 text-white mb-2">Manager Role</Badge>
                <p className="text-slate-400">Full visibility across all stages. Focus on pipeline review, team performance, and strategic decisions.</p>
              </div>
              <div>
                <Badge className="bg-blue-600 text-white mb-2">Employee Role</Badge>
                <p className="text-slate-400">Focus on assigned leads and opportunities. Execute activities and update progress daily.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Button
            onClick={() => navigate(createPageUrl("Documentation"))}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
          >
            <BookOpen className="w-4 h-4 mr-2" />
            View Full Documentation
          </Button>
        </div>
      </div>
    </div>
  );
}