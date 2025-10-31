import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  BookOpen, 
  LayoutDashboard, 
  Users, 
  Target, 
  Building2, 
  CheckSquare,
  FileText,
  TrendingUp,
  Sparkles,
  Shield,
  Eye,
  EyeOff
} from "lucide-react";

export default function UserGuide() {
  const [activeModule, setActiveModule] = useState('introduction');

  const modules = [
    { id: 'introduction', name: 'Introduction', icon: BookOpen },
    { id: 'roles', name: 'Roles & Permissions', icon: Shield },
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'contacts', name: 'Contacts', icon: Users },
    { id: 'leads', name: 'Leads', icon: Target },
    { id: 'accounts', name: 'Accounts', icon: Building2 },
    { id: 'opportunities', name: 'Opportunities', icon: TrendingUp },
    { id: 'activities', name: 'Activities', icon: CheckSquare },
    { id: 'reports', name: 'Reports', icon: FileText },
    { id: 'ai', name: 'AI Features', icon: Sparkles }
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <Alert className="mb-6 bg-blue-900/30 border-blue-700/50">
        <BookOpen className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          Welcome to the Ai-SHA CRM User Guide. This guide will help you understand and use all features of the CRM effectively.
        </AlertDescription>
      </Alert>

      <Tabs value={activeModule} onValueChange={setActiveModule} className="space-y-6">
        <TabsList className="bg-slate-800 border border-slate-700 p-1 flex-wrap h-auto gap-1">
          {modules.map(module => (
            <TabsTrigger
              key={module.id}
              value={module.id}
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-slate-300 flex items-center gap-2"
            >
              <module.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{module.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Introduction */}
        <TabsContent value="introduction">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-400" />
                Getting Started with Ai-SHA CRM
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-slate max-w-none space-y-4 text-slate-300">
              <p>
                Ai-SHA CRM is a comprehensive customer relationship management platform designed to help you manage leads, contacts, accounts, opportunities, and activities efficiently.
              </p>
              
              <h3 className="text-slate-100 text-lg font-semibold">What You Can Do</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>Track and nurture leads through your sales pipeline</li>
                <li>Manage contact information and communication history</li>
                <li>Organize accounts (companies) and their associated contacts</li>
                <li>Monitor sales opportunities and forecast revenue</li>
                <li>Schedule and log activities (calls, meetings, tasks)</li>
                <li>Generate reports and insights with AI assistance</li>
                <li>Collaborate with your team on deals and accounts</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Navigation</h3>
              <p>
                Use the sidebar menu to access different sections of the CRM. The modules you can see depend on your role and permissions (see the "Roles & Permissions" tab).
              </p>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mt-4">
                <p className="text-sm text-slate-400">
                  <strong className="text-slate-200">Tip:</strong> Use the search bar at the top to quickly find contacts, leads, or accounts. Press <code className="bg-slate-700 px-1.5 py-0.5 rounded">Ctrl+K</code> or <code className="bg-slate-700 px-1.5 py-0.5 rounded">Cmd+K</code> to open the command palette for quick navigation.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles & Permissions */}
        <TabsContent value="roles">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-400" />
                Understanding Roles and Permissions
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-slate max-w-none space-y-4 text-slate-300">
              <p>
                Your access to CRM data depends on two things: your Base44 platform role and your CRM employee role.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose">
                <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
                  <h4 className="text-blue-300 font-semibold flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4" />
                    Platform Role
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <strong className="text-blue-200">Admin:</strong>
                      <p className="text-slate-400 mt-1">System administrators. Full access to all data, settings, and tenants.</p>
                    </div>
                    <div className="mt-3">
                      <strong className="text-blue-200">User:</strong>
                      <p className="text-slate-400 mt-1">Standard login role. Your CRM access is determined by your employee role (see right).</p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4">
                  <h4 className="text-green-300 font-semibold flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4" />
                    Employee Role
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <strong className="text-green-200">Manager:</strong>
                      <p className="text-slate-400 mt-1 flex items-start gap-1">
                        <Eye className="w-3 h-3 mt-0.5 flex-shrink-0 text-green-400" />
                        Can see <strong>all</strong> CRM data within your client/tenant. Full visibility of team activity.
                      </p>
                    </div>
                    <div className="mt-3">
                      <strong className="text-green-200">Employee:</strong>
                      <p className="text-slate-400 mt-1 flex items-start gap-1">
                        <EyeOff className="w-3 h-3 mt-0.5 flex-shrink-0 text-orange-400" />
                        Can only see records you created or that are assigned to you. Individual view.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">What This Means For You</h3>
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-3">
                <div>
                  <h4 className="text-green-400 font-medium flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    If you're a Manager:
                  </h4>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-slate-400 ml-4">
                    <li>You'll see all leads, contacts, accounts, and opportunities for your organization</li>
                    <li>You can view and edit records created by any team member</li>
                    <li>Dashboard stats show team-wide performance</li>
                    <li>You can reassign records to other team members</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="text-orange-400 font-medium flex items-center gap-2">
                    <EyeOff className="w-4 h-4" />
                    If you're an Employee:
                  </h4>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-slate-400 ml-4">
                    <li>You'll only see leads, contacts, and accounts assigned to you</li>
                    <li>You can create new records (they'll be auto-assigned to you)</li>
                    <li>Dashboard stats reflect only your personal activity</li>
                    <li>You cannot see or edit other team members' records</li>
                  </ul>
                </div>
              </div>

              <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 mt-4">
                <p className="text-blue-300 text-sm">
                  <strong>Not sure what role you have?</strong> Check your profile settings or ask your system administrator.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dashboard */}
        <TabsContent value="dashboard">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-cyan-400" />
                Using the Dashboard
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-slate max-w-none space-y-4 text-slate-300">
              <p>
                The Dashboard provides an at-a-glance view of your CRM performance. The data you see depends on your role:
              </p>
              
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Managers:</strong> See team-wide metrics and pipeline health</li>
                <li><strong>Employees:</strong> See your personal performance and assigned tasks</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold">Key Metrics</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Total Contacts:</strong> Number of active contacts in your CRM</li>
                <li><strong>New Leads (30d):</strong> Leads created in the last 30 days</li>
                <li><strong>Active Opportunities:</strong> Open deals in your pipeline</li>
                <li><strong>Pipeline Value:</strong> Total estimated revenue from open opportunities</li>
                <li><strong>Activities Logged (30d):</strong> Calls, meetings, and tasks completed recently</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Widgets</h3>
              <p>
                Click <strong>"Customize Dashboard"</strong> to show or hide widgets:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Sales Pipeline:</strong> Opportunities by stage with values</li>
                <li><strong>Lead Sources:</strong> Where your leads are coming from</li>
                <li><strong>Top Accounts:</strong> Your highest-revenue clients</li>
                <li><strong>Lead Age Report:</strong> Leads that need follow-up attention</li>
                <li><strong>Recent Activities:</strong> Latest team interactions</li>
              </ul>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mt-4">
                <p className="text-sm text-slate-400">
                  <strong className="text-slate-200">Pro Tip:</strong> Use the timeframe filters (Week, Month, Quarter, Year) at the top to adjust the data range shown.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts */}
        <TabsContent value="contacts">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                Managing Contacts
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-slate max-w-none space-y-4 text-slate-300">
              <p>
                Contacts represent individual people you interact with. They can be associated with Accounts (companies).
              </p>

              <h3 className="text-slate-100 text-lg font-semibold">Creating a Contact</h3>
              <ol className="list-decimal list-inside space-y-1">
                <li>Navigate to <strong>Contacts</strong> in the sidebar</li>
                <li>Click <strong>"Add Contact"</strong></li>
                <li>Fill in required fields (First Name, Last Name)</li>
                <li>Optionally add email, phone, company, job title, and notes</li>
                <li>Assign to a team member (or leave assigned to yourself)</li>
                <li>Click <strong>"Save"</strong></li>
              </ol>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">What You Can See</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Managers:</strong> All contacts for your organization</li>
                <li><strong>Employees:</strong> Only contacts you created or that are assigned to you</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Contact Actions</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Edit:</strong> Update contact information</li>
                <li><strong>View Details:</strong> See full contact profile, notes, and activity history</li>
                <li><strong>Log Activity:</strong> Record calls, meetings, or emails with this contact</li>
                <li><strong>Convert to Lead:</strong> Promote contact to an active lead for qualification</li>
                <li><strong>Link to Account:</strong> Associate with a company record</li>
              </ul>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mt-4">
                <p className="text-sm text-slate-400">
                  <strong className="text-slate-200">Best Practice:</strong> Always fill in as much detail as possible when creating contacts. Rich data helps AI features provide better insights and recommendations.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads */}
        <TabsContent value="leads">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Target className="w-5 h-5 text-yellow-400" />
                Working with Leads
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-slate max-w-none space-y-4 text-slate-300">
              <p>
                Leads are potential customers who haven't been qualified yet. They move through stages: New → Contacted → Qualified → Converted (or Lost).
              </p>

              <h3 className="text-slate-100 text-lg font-semibold">Lead Lifecycle</h3>
              <ol className="list-decimal list-inside space-y-1">
                <li><strong>New:</strong> Just entered your system</li>
                <li><strong>Contacted:</strong> You've reached out (call, email, meeting)</li>
                <li><strong>Qualified:</strong> They meet your buying criteria and are interested</li>
                <li><strong>Converted:</strong> Turned into a Contact, Account, or Opportunity</li>
                <li><strong>Lost:</strong> Not a fit or not interested</li>
              </ol>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">What You Can See</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Managers:</strong> All leads for your organization</li>
                <li><strong>Employees:</strong> Only leads assigned to you</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Converting Leads</h3>
              <p>
                When a lead is qualified and ready to become a customer:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open the lead detail panel</li>
                <li>Click <strong>"Convert Lead"</strong></li>
                <li>Choose what to create:
                  <ul className="list-disc list-inside ml-6 mt-1">
                    <li>Contact (always created)</li>
                    <li>Account (if they're from a company)</li>
                    <li>Opportunity (if there's a potential deal)</li>
                  </ul>
                </li>
                <li>Review and confirm the conversion</li>
              </ol>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mt-4">
                <p className="text-sm text-slate-400">
                  <strong className="text-slate-200">Tip:</strong> Use the Lead Age Report widget on your dashboard to identify leads that need immediate follow-up attention.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Accounts */}
        <TabsContent value="accounts">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-400" />
                Managing Accounts
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-slate max-w-none space-y-4 text-slate-300">
              <p>
                Accounts represent companies or organizations. Multiple Contacts can be associated with a single Account.
              </p>

              <h3 className="text-slate-100 text-lg font-semibold">Creating an Account</h3>
              <ol className="list-decimal list-inside space-y-1">
                <li>Navigate to <strong>Accounts</strong> in the sidebar</li>
                <li>Click <strong>"Add Account"</strong></li>
                <li>Fill in company details (Name, Industry, Website, Phone)</li>
                <li>Add revenue and employee count for better segmentation</li>
                <li>Click <strong>"Save"</strong></li>
              </ol>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">What You Can See</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Managers:</strong> All accounts for your organization</li>
                <li><strong>Employees:</strong> Only accounts you created or are assigned to you</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Account Relationships</h3>
              <p>
                When viewing an Account:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>See all associated Contacts working at that company</li>
                <li>View related Opportunities (active deals)</li>
                <li>Track Activities and interactions with the account</li>
                <li>Monitor account health and engagement</li>
              </ul>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mt-4">
                <p className="text-sm text-slate-400">
                  <strong className="text-slate-200">Best Practice:</strong> When creating Contacts, always link them to their Account. This gives you a complete view of your relationship with each company.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opportunities */}
        <TabsContent value="opportunities">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                Tracking Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-slate max-w-none space-y-4 text-slate-300">
              <p>
                Opportunities represent potential deals with a specific dollar value and close date. They move through your sales pipeline.
              </p>

              <h3 className="text-slate-100 text-lg font-semibold">Pipeline Stages</h3>
              <ol className="list-decimal list-inside space-y-1">
                <li><strong>Prospecting:</strong> Initial contact and discovery</li>
                <li><strong>Qualification:</strong> Confirming fit and budget</li>
                <li><strong>Proposal:</strong> Presenting your solution</li>
                <li><strong>Negotiation:</strong> Discussing terms and pricing</li>
                <li><strong>Closed Won:</strong> Deal is won! 🎉</li>
                <li><strong>Closed Lost:</strong> Deal didn't happen</li>
              </ol>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">What You Can See</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Managers:</strong> All opportunities for your organization</li>
                <li><strong>Employees:</strong> Only opportunities you created or are assigned to you</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Key Opportunity Fields</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Name:</strong> Deal title (e.g., "ACME Corp - Website Redesign")</li>
                <li><strong>Amount:</strong> Expected revenue in USD</li>
                <li><strong>Close Date:</strong> When you expect to close the deal</li>
                <li><strong>Probability:</strong> Likelihood of winning (0-100%)</li>
                <li><strong>Account:</strong> Which company this deal is with</li>
                <li><strong>Contact:</strong> Primary decision-maker</li>
              </ul>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mt-4">
                <p className="text-sm text-slate-400">
                  <strong className="text-slate-200">Tip:</strong> Use the Kanban board view (click the board icon) to drag and drop opportunities between stages for quick updates.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activities */}
        <TabsContent value="activities">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-orange-400" />
                Logging Activities
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-slate max-w-none space-y-4 text-slate-300">
              <p>
                Activities track your interactions and tasks. Types include Calls, Emails, Meetings, Tasks, and Notes.
              </p>

              <h3 className="text-slate-100 text-lg font-semibold">Creating an Activity</h3>
              <ol className="list-decimal list-inside space-y-1">
                <li>Navigate to <strong>Activities</strong> in the sidebar</li>
                <li>Click <strong>"Add Activity"</strong></li>
                <li>Choose activity type and fill in details</li>
                <li>Link to a Contact, Lead, Account, or Opportunity</li>
                <li>Set due date and priority</li>
                <li>Click <strong>"Save"</strong></li>
              </ol>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Activity Types</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Call:</strong> Phone conversations with prospects or customers</li>
                <li><strong>Email:</strong> Email communications (can be automated)</li>
                <li><strong>Meeting:</strong> In-person or virtual meetings</li>
                <li><strong>Task:</strong> To-dos and action items</li>
                <li><strong>Note:</strong> General observations or reminders</li>
                <li><strong>Demo:</strong> Product demonstrations</li>
                <li><strong>Proposal:</strong> Sending proposals or quotes</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Activity Statuses</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Scheduled:</strong> Planned for the future</li>
                <li><strong>In Progress:</strong> Currently working on it</li>
                <li><strong>Completed:</strong> Done</li>
                <li><strong>Overdue:</strong> Passed the due date</li>
                <li><strong>Cancelled:</strong> No longer needed</li>
              </ul>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mt-4">
                <p className="text-sm text-slate-400">
                  <strong className="text-slate-200">Best Practice:</strong> Log activities immediately after completing them. This keeps your CRM data fresh and provides accurate reporting.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports */}
        <TabsContent value="reports">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Generating Reports
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-slate max-w-none space-y-4 text-slate-300">
              <p>
                The Reports section provides detailed analytics and insights into your sales performance, pipeline health, and team productivity.
              </p>

              <h3 className="text-slate-100 text-lg font-semibold">Available Reports</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Sales Analytics:</strong> Revenue trends, win rates, and pipeline value</li>
                <li><strong>Lead Analytics:</strong> Lead conversion rates and sources</li>
                <li><strong>Productivity Analytics:</strong> Activity volume and completion rates</li>
                <li><strong>Forecasting:</strong> Predicted revenue based on pipeline</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">What You Can See</h3>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Managers:</strong> Team-wide reports and individual performance comparisons</li>
                <li><strong>Employees:</strong> Personal performance reports only</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Exporting Reports</h3>
              <p>
                Most reports can be exported:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>CSV:</strong> For Excel or Google Sheets analysis</li>
                <li><strong>PDF:</strong> For printing or sharing with stakeholders</li>
              </ul>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mt-4">
                <p className="text-sm text-slate-400">
                  <strong className="text-slate-200">Tip:</strong> Use date range filters to analyze specific time periods (month, quarter, year). This helps identify trends and seasonal patterns.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Features */}
        <TabsContent value="ai">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                AI-Powered Features
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-invert prose-slate max-w-none space-y-4 text-slate-300">
              <p>
                Ai-SHA CRM includes several AI-powered features to help you work smarter and faster.
              </p>

              <h3 className="text-slate-100 text-lg font-semibold">AI Assistant (Avatar)</h3>
              <p>
                Click the AI avatar in the bottom-right corner to:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Ask questions about your CRM data</li>
                <li>Get summaries of contacts, leads, or opportunities</li>
                <li>Research companies or contacts using web search</li>
                <li>Draft emails to prospects</li>
                <li>Navigate the CRM with voice commands</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Lead Scoring</h3>
              <p>
                The AI automatically scores leads (0-100) based on:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Company size and industry</li>
                <li>Engagement history (opens, clicks, replies)</li>
                <li>Job title and decision-making authority</li>
                <li>Lead source quality</li>
              </ul>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">AI Email Composer</h3>
              <p>
                When creating an activity of type "Email":
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Describe what you want to say</li>
                <li>Click <strong>"Generate with AI"</strong></li>
                <li>Review and edit the drafted email</li>
                <li>Send or save as an activity</li>
              </ol>

              <h3 className="text-slate-100 text-lg font-semibold mt-6">Document Processing</h3>
              <p>
                Upload business cards or documents, and AI will:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Extract contact information</li>
                <li>Create Contact and Account records automatically</li>
                <li>Parse receipts for cash flow tracking</li>
              </ul>

              <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 mt-4">
                <p className="text-yellow-300 text-sm">
                  <strong>AI Limitations:</strong> AI features are powerful but not perfect. Always review AI-generated content before sending to customers, and verify extracted data for accuracy.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}