import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Users,
  TrendingUp,
  Target,
  Calendar,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Lightbulb,
  Award,
  Building2,
  Phone,
  Mail,
  FileText,
  Star
} from "lucide-react";

export default function WorkflowGuide() {
  const [activeRole, setActiveRole] = useState("employee");

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-700/30 rounded-lg p-6">
        <h2 className="text-2xl font-bold text-slate-100 mb-2 flex items-center gap-2">
          <Users className="w-7 h-7 text-blue-400" />
          CRM Workflow Guide
        </h2>
        <p className="text-slate-300">
          Master your CRM workflow with role-specific guides and real-world case studies
        </p>
      </div>

      <Tabs value={activeRole} onValueChange={setActiveRole} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-slate-800 border border-slate-700">
          <TabsTrigger value="employee" className="data-[state=active]:bg-blue-600">
            <Users className="w-4 h-4 mr-2" />
            Employee
          </TabsTrigger>
          <TabsTrigger value="manager" className="data-[state=active]:bg-purple-600">
            <Award className="w-4 h-4 mr-2" />
            Manager
          </TabsTrigger>
          <TabsTrigger value="cases" className="data-[state=active]:bg-green-600">
            <Lightbulb className="w-4 h-4 mr-2" />
            Case Studies
          </TabsTrigger>
        </TabsList>

        {/* Employee Workflow */}
        <TabsContent value="employee" className="space-y-6 mt-6">
          <Card className="bg-slate-800 border-slate-700 transition-all hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Star className="w-5 h-5 text-blue-400" />
                Employee Daily Workflow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Morning Routine */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                  <Badge className="bg-blue-600">Morning</Badge>
                  Start Your Day (8:00 AM - 9:00 AM)
                </h3>
                <div className="ml-4 space-y-3">
                  <WorkflowStep
                    number="1"
                    title="Review Dashboard"
                    description="Check your dashboard for overnight updates, new assignments, and key metrics"
                    icon={<TrendingUp className="w-4 h-4" />}
                  />
                  <WorkflowStep
                    number="2"
                    title="Check Activities"
                    description="Review today's scheduled calls, meetings, and tasks. Prioritize overdue items"
                    icon={<Calendar className="w-4 h-4" />}
                  />
                  <WorkflowStep
                    number="3"
                    title="Review New Leads"
                    description="Check 'My Leads' for new assignments. Contact new leads within 24 hours"
                    icon={<Star className="w-4 h-4" />}
                  />
                </div>
              </div>

              {/* Mid-Morning */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                  <Badge className="bg-purple-600">Mid-Morning</Badge>
                  Lead Outreach (9:00 AM - 12:00 PM)
                </h3>
                <div className="ml-4 space-y-3">
                  <WorkflowStep
                    number="4"
                    title="Call New Leads"
                    description="Make initial contact with 'New' leads. Use AI calling if available"
                    icon={<Phone className="w-4 h-4" />}
                    bestPractice="Script: 'Hi [Name], this is [Your Name] from [Company]. I saw you were interested in [service]. Do you have 2 minutes?'"
                  />
                  <WorkflowStep
                    number="5"
                    title="Update Lead Status"
                    description="Mark leads as 'Contacted' after reaching them. Add notes about the conversation"
                    icon={<FileText className="w-4 h-4" />}
                  />
                  <WorkflowStep
                    number="6"
                    title="Qualify Leads"
                    description="Ask BANT questions: Budget, Authority, Need, Timeline. Mark as 'Qualified' or 'Unqualified'"
                    icon={<CheckCircle className="w-4 h-4" />}
                    bestPractice="If qualified, immediately convert to Contact and create an Opportunity"
                  />
                </div>
              </div>

              {/* Afternoon */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                  <Badge className="bg-green-600">Afternoon</Badge>
                  Follow-ups & Pipeline (1:00 PM - 5:00 PM)
                </h3>
                <div className="ml-4 space-y-3">
                  <WorkflowStep
                    number="7"
                    title="Work Opportunities"
                    description="Review your opportunities. Move deals forward through stages"
                    icon={<Target className="w-4 h-4" />}
                  />
                  <WorkflowStep
                    number="8"
                    title="Send Follow-up Emails"
                    description="Use AI Email Composer for personalized follow-ups to qualified leads"
                    icon={<Mail className="w-4 h-4" />}
                  />
                  <WorkflowStep
                    number="9"
                    title="Update Activities"
                    description="Mark completed activities as done. Schedule next steps for each opportunity"
                    icon={<Calendar className="w-4 h-4" />}
                  />
                </div>
              </div>

              {/* End of Day */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                  <Badge className="bg-slate-600">End of Day</Badge>
                  Wrap-up (5:00 PM - 5:30 PM)
                </h3>
                <div className="ml-4 space-y-3">
                  <WorkflowStep
                    number="10"
                    title="Plan Tomorrow"
                    description="Schedule activities for tomorrow. Prioritize high-value opportunities"
                    icon={<Calendar className="w-4 h-4" />}
                  />
                  <WorkflowStep
                    number="11"
                    title="Update Records"
                    description="Ensure all contacts, leads, and opportunities are up-to-date"
                    icon={<FileText className="w-4 h-4" />}
                  />
                </div>
              </div>

              <Alert className="bg-blue-900/20 border-blue-700/50 text-blue-300">
                <Lightbulb className="w-4 h-4" />
                <AlertDescription>
                  <strong>Success Tip:</strong> Aim for 50+ calls/day and convert 10-15% of new leads to qualified status. 
                  Quality conversations beat quantity!
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Employee Tools Guide */}
          <Card className="bg-slate-800 border-slate-700 transition-all hover:border-purple-500 hover:shadow-xl hover:shadow-purple-500/10">
            <CardHeader>
              <CardTitle className="text-slate-100">Employee Tools & Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToolCard
                title="AI Lead Scoring"
                description="Focus on high-scoring leads (70+) first. Low scores may need nurturing."
                icon={<Target className="w-5 h-5 text-blue-400" />}
              />
              <ToolCard
                title="AI Email Composer"
                description="Generate personalized emails instantly. Edit for your voice, send via your email."
                icon={<Mail className="w-5 h-5 text-purple-400" />}
              />
              <ToolCard
                title="AI Calling & Transcription"
                description="Make calls through CRM. Auto-transcription captures conversation details."
                icon={<Phone className="w-5 h-5 text-green-400" />}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manager Workflow */}
        <TabsContent value="manager" className="space-y-6 mt-6">
          <Card className="bg-slate-800 border-slate-700 transition-all hover:border-purple-500 hover:shadow-xl hover:shadow-purple-500/10">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-400" />
                Manager Strategic Workflow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Daily Management */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                  <Badge className="bg-purple-600">Daily</Badge>
                  Team Management
                </h3>
                <div className="ml-4 space-y-3">
                  <WorkflowStep
                    number="1"
                    title="Review Team Dashboard"
                    description="Check team performance metrics. Switch to 'All Leads' view to see entire pipeline"
                    icon={<TrendingUp className="w-4 h-4" />}
                    bestPractice="Look for: stalled deals, overdue activities, conversion rates by rep"
                  />
                  <WorkflowStep
                    number="2"
                    title="Monitor Lead Distribution"
                    description="Ensure leads are evenly distributed. Reassign if needed for optimal performance"
                    icon={<Users className="w-4 h-4" />}
                  />
                  <WorkflowStep
                    number="3"
                    title="Coach Your Team"
                    description="Review call recordings, emails, and outcomes. Provide feedback"
                    icon={<Award className="w-4 h-4" />}
                  />
                </div>
              </div>

              {/* Weekly Strategy */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                  <Badge className="bg-blue-600">Weekly</Badge>
                  Pipeline Review
                </h3>
                <div className="ml-4 space-y-3">
                  <WorkflowStep
                    number="4"
                    title="Pipeline Health Check"
                    description="Review opportunities by stage. Identify bottlenecks and stuck deals"
                    icon={<Target className="w-4 h-4" />}
                    bestPractice="Healthy pipeline: 3-5x your quota in qualified opportunities"
                  />
                  <WorkflowStep
                    number="5"
                    title="Win/Loss Analysis"
                    description="Review closed_won and closed_lost deals. What patterns emerge?"
                    icon={<TrendingUp className="w-4 h-4" />}
                  />
                  <WorkflowStep
                    number="6"
                    title="Forecast Next Month"
                    description="Project revenue based on pipeline and historical close rates"
                    icon={<Calendar className="w-4 h-4" />}
                  />
                </div>
              </div>

              {/* Monthly Planning */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                  <Badge className="bg-green-600">Monthly</Badge>
                  Strategic Planning
                </h3>
                <div className="ml-4 space-y-3">
                  <WorkflowStep
                    number="7"
                    title="Review Reports"
                    description="Analyze Monthly Performance report. Compare to goals"
                    icon={<FileText className="w-4 h-4" />}
                  />
                  <WorkflowStep
                    number="8"
                    title="Adjust Strategies"
                    description="Based on data, adjust lead sources, team structure, or processes"
                    icon={<TrendingUp className="w-4 h-4" />}
                  />
                  <WorkflowStep
                    number="9"
                    title="Set Next Month Goals"
                    description="Set team and individual targets. Communicate clearly"
                    icon={<Target className="w-4 h-4" />}
                  />
                </div>
              </div>

              <Alert className="bg-purple-900/20 border-purple-700/50 text-purple-300">
                <Award className="w-4 h-4" />
                <AlertDescription>
                  <strong>Manager Best Practice:</strong> Use bulk actions to reassign leads, update stages, and manage large datasets efficiently. 
                  Regularly coach your team using actual call/email data from the CRM.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Manager Tools */}
          <Card className="bg-slate-800 border-slate-700 transition-all hover:border-orange-500 hover:shadow-xl hover:shadow-orange-500/10">
            <CardHeader>
              <CardTitle className="text-slate-100">Manager-Specific Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToolCard
                title="All Leads View"
                description="See entire team's pipeline. Filter and sort to find issues quickly."
                icon={<Users className="w-5 h-5 text-purple-400" />}
              />
              <ToolCard
                title="Bulk Actions"
                description="Update multiple records at once. Reassign leads, change stages, export data."
                icon={<CheckCircle className="w-5 h-5 text-green-400" />}
              />
              <ToolCard
                title="Reports Dashboard"
                description="Deep analytics: conversion rates, sales cycle length, team performance."
                icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
              />
              <ToolCard
                title="AI Campaigns"
                description="Launch automated outreach campaigns across your lead database."
                icon={<Target className="w-5 h-5 text-yellow-400" />}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Case Studies */}
        <TabsContent value="cases" className="space-y-6 mt-6">
          <CaseStudy
            title="Solar Installation Company: From 20 to 100 Deals/Month"
            industry="Green Energy & Solar"
            challenge="Small team overwhelmed by manual lead follow-up. Losing qualified leads to competitors."
            solution="Implemented AI calling for initial outreach + structured BizDev Sources workflow"
            results={[
              "300% increase in contacted leads (from 50/week to 200/week)",
              "Lead-to-opportunity conversion improved from 8% to 22%",
              "Sales cycle reduced from 45 days to 28 days",
              "5x ROI within first quarter"
            ]}
            workflow={[
              "Import BizDev Sources from trade shows and directories",
              "AI calls all new sources within 48 hours",
              "Qualified leads promoted to Accounts and Opportunities",
              "Employees focus on closing deals, not cold calling"
            ]}
          />

          <CaseStudy
            title="Commercial Roofing: Streamlined Large Project Management"
            industry="Construction & Roofing"
            challenge="Losing track of large opportunities ($50K+). Poor handoff between sales and ops."
            solution="Implemented Opportunity stages with Activities tracking + Manager oversight"
            results={[
              "Won 12 major contracts (avg $75K) in 6 months",
              "No more missed follow-ups or forgotten quotes",
              "Client satisfaction up 40% due to organized communication",
              "Manager visibility into entire pipeline"
            ]}
            workflow={[
              "Manager creates Opportunities from qualified BizDev sources",
              "Each opportunity gets detailed Activities: site visit, quote, follow-ups",
              "Weekly pipeline review with team using Kanban board",
              "Close-won opportunities automatically create Account + initial follow-up activity"
            ]}
          />

          <CaseStudy
            title="HVAC Service: Seasonal Campaign Success"
            industry="HVAC & Maintenance"
            challenge="Slow season (winter) = idle sales team. Need proactive outreach."
            solution="Launched AI Campaign targeting 500 past customers for spring maintenance"
            results={[
              "45% response rate to AI calls",
              "120 appointments booked automatically",
              "$180K in pre-season revenue secured",
              "Sales team focused on closing, not calling"
            ]}
            workflow={[
              "Filter Contacts: customers with last service > 1 year ago",
              "Create AI Campaign: 'Spring Maintenance Special'",
              "AI calls contacts, qualifies interest, books appointments",
              "Sales team follows up with quotes and closes deals"
            ]}
          />

          <Card className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border-green-700/30">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-400" />
                Key Takeaways from Case Studies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-slate-300">
              <div className="flex gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-200">Automate the Grunt Work:</strong> Use AI for initial outreach and qualification. 
                  Your team should focus on building relationships and closing deals.
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-200">Structured Workflow Wins:</strong> BizDev Sources → Leads → Contacts → Opportunities. 
                  Follow this flow and you won't lose prospects.
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-200">Manager Oversight is Critical:</strong> Use 'All Leads' view and bulk actions. 
                  A good manager can 3x team performance with proper CRM usage.
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-200">Track Everything:</strong> Activities, notes, call recordings. 
                  Data-driven decisions beat gut feelings.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper Components
function WorkflowStep({ number, title, description, icon, bestPractice }) {
  return (
    <div className="flex gap-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600/50 transition-all hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
          {number}
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <h4 className="font-semibold text-slate-200">{title}</h4>
        </div>
        <p className="text-sm text-slate-300 mb-2">{description}</p>
        {bestPractice && (
          <div className="flex gap-2 mt-2 p-2 bg-yellow-900/20 border border-yellow-700/30 rounded">
            <Lightbulb className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-200">{bestPractice}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCard({ title, description, icon }) {
  return (
    <div className="flex gap-3 p-3 bg-slate-700/30 rounded-lg border border-slate-600/50 transition-all hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/20">
      <div className="flex-shrink-0 mt-1">{icon}</div>
      <div>
        <h4 className="font-semibold text-slate-200 mb-1">{title}</h4>
        <p className="text-sm text-slate-300">{description}</p>
      </div>
    </div>
  );
}

function CaseStudy({ title, industry, challenge, solution, results, workflow }) {
  return (
    <Card className="bg-slate-800 border-slate-700 transition-all hover:border-green-500 hover:shadow-xl hover:shadow-green-500/10">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-slate-100 mb-2">{title}</CardTitle>
            <Badge className="bg-blue-600">{industry}</Badge>
          </div>
          <Building2 className="w-8 h-8 text-blue-400" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold text-red-300 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            The Challenge
          </h4>
          <p className="text-sm text-slate-300">{challenge}</p>
        </div>

        <div>
          <h4 className="font-semibold text-blue-300 mb-2 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            The Solution
          </h4>
          <p className="text-sm text-slate-300">{solution}</p>
        </div>

        <div>
          <h4 className="font-semibold text-green-300 mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            The Results
          </h4>
          <ul className="space-y-2">
            {results.map((result, idx) => (
              <li key={idx} className="flex gap-2 text-sm text-slate-300">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                {result}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-purple-300 mb-2 flex items-center gap-2">
            <ArrowRight className="w-4 h-4" />
            Their Workflow
          </h4>
          <ol className="space-y-2">
            {workflow.map((step, idx) => (
              <li key={idx} className="flex gap-2 text-sm text-slate-300">
                <span className="font-bold text-purple-400">{idx + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}