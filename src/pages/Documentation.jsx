import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Search,
  Book,
  Users,
  Building2,
  Star,
  Target,
  Calendar,
  DollarSign,
  FileText,
  BarChart3,
  Puzzle,
  CreditCard,
  Database,
  Briefcase,
  Brain,
  Wrench,
  Sparkles,
  Info,
  CheckCircle,
  TrendingUp,
  Zap,
  Shield,
  Settings,
  Bot,
  Route
} from "lucide-react";
import { User } from "@/api/entities";
import ReactMarkdown from "react-markdown";

export default function DocumentationPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const documentationSections = [
    {
      id: "overview",
      title: "Overview",
      icon: Book,
      color: "text-purple-400",
      content: `
# Welcome to Ai-SHA CRM

Ai-SHA CRM is a comprehensive customer relationship management system designed to streamline your sales, marketing, and customer service operations.

## Key Features

- **Contact & Account Management**: Centralized customer database
- **Lead Management**: Track and nurture potential customers
- **Sales Pipeline**: Visualize and manage your opportunities
- **Activity Tracking**: Log calls, meetings, emails, and tasks
- **BizDev Sources**: Import and manage business development prospects
- **AI-Powered Insights**: Get intelligent recommendations and market analysis
- **Cash Flow Management**: Track income and expenses
- **Document Processing**: Extract data from business cards and receipts
- **Reports & Analytics**: Comprehensive business intelligence
- **Employee Management**: Manage your team with role-based access

## Getting Started

1. **Complete your profile** in Settings
2. **Import your contacts** using CSV import
3. **Set up your pipeline** by creating opportunities
4. **Start tracking activities** to measure productivity
5. **Review reports** to gain insights into your business
      `
    },
    {
      id: "contacts",
      title: "Contacts",
      icon: Users,
      color: "text-blue-400",
      content: `
# Contact Management

Contacts are individuals you interact with - potential customers, existing clients, partners, or any business relationship.

## Creating Contacts

1. Click **"+ Add Contact"** button
2. Fill in contact details:
   - **Required**: First Name, Last Name
   - **Optional**: Email, Phone, Job Title, Department, Account (Company)
3. Add tags for easy filtering
4. Assign to a team member

## Key Features

### Bulk Actions
- **Import**: Upload CSV files to import multiple contacts
- **Export**: Download contact data as CSV
- **Bulk Delete**: Remove multiple contacts at once
- **Bulk Tag**: Add tags to multiple contacts simultaneously

### Contact Details
- View full contact history and timeline
- Add notes and track interactions
- Link to Account (Company)
- Convert to Lead if needed
- Track engagement score

### Filtering & Search
- Filter by status (Active, Inactive, Prospect, Customer)
- Search by name, email, or company
- Filter by tags
- Filter by assigned user (managers only)

## Best Practices

✓ **Link contacts to accounts** for better organization
✓ **Use tags** to segment your contacts (e.g., "VIP", "Newsletter")
✓ **Keep notes updated** after each interaction
✓ **Assign ownership** for accountability
✓ **Regular cleanup** - mark inactive contacts
      `
    },
    {
      id: "accounts",
      title: "Accounts",
      icon: Building2,
      color: "text-emerald-400",
      content: `
# Account Management

Accounts represent companies or organizations you do business with. They serve as the parent record for contacts and opportunities.

## Creating Accounts

1. Click **"+ Add Account"** button
2. Fill in company details:
   - **Required**: Company Name
   - **Optional**: Website, Phone, Industry, Revenue, Employee Count
3. Add address information
4. Assign to a team member

## Key Features

### Account Types
- **Prospect**: Potential customer
- **Customer**: Active client
- **Partner**: Business partner
- **Competitor**: Competitive intelligence
- **Vendor**: Supplier relationship

### Industry Categories
Over 30 industry options including:
- Technology & Software
- Healthcare & Medical
- Construction & Engineering
- Manufacturing & Industrial
- Financial Services
- And many more...

### Account Hierarchy
- Link multiple contacts to one account
- Associate opportunities with accounts
- Track all activities related to the account

## Best Practices

✓ **One account per company** - avoid duplicates
✓ **Link all contacts** from that company
✓ **Update regularly** - revenue, employee count
✓ **Track competitors** for market intelligence
✓ **Use custom tags** for segmentation
      `
    },
    {
      id: "leads",
      title: "Leads",
      icon: Star,
      color: "text-yellow-400",
      content: `
# Lead Management

Leads are potential customers who haven't been fully qualified yet. Use leads to capture prospects before converting them to contacts and opportunities.

## Lead Lifecycle

1. **New** - Just captured
2. **Contacted** - Initial outreach made
3. **Qualified** - Meets criteria, worth pursuing
4. **Unqualified** - Not a good fit
5. **Converted** - Promoted to Contact + Opportunity
6. **Lost** - No longer interested

## Creating Leads

1. Click **"+ Add Lead"** button
2. Fill in lead details:
   - **Required**: First Name, Last Name
   - **Optional**: Email, Phone, Company, Job Title
3. Select lead source (Website, Referral, Cold Call, etc.)
4. Set priority and status

## Lead Scoring

The system automatically scores leads (0-100) based on:
- Completeness of information
- Engagement level
- Company size and industry
- Source quality

**AI Recommendations** suggest next actions:
- Follow Up
- Nurture
- Qualify
- Disqualify

## Converting Leads

When a lead is qualified, convert to:
- **Contact** - Creates a contact record
- **Account** - Creates or links to company
- **Opportunity** - Creates a sales opportunity

**Conversion preserves:**
- Original lead ID (unique_id)
- Source information
- All activity history
- Tags and notes

## Best Practices

✓ **Qualify quickly** - don't let leads stagnate
✓ **Use lead scoring** to prioritize outreach
✓ **Track lead sources** for ROI analysis
✓ **Add notes** at each touchpoint
✓ **Convert when ready** - don't wait too long
      `
    },
    {
      id: "opportunities",
      title: "Opportunities",
      icon: Target,
      color: "text-orange-400",
      content: `
# Sales Pipeline Management

Opportunities represent potential deals in your sales pipeline. Track them from initial interest through closed-won or closed-lost.

## Sales Stages

1. **Prospecting** - Initial interest identified
2. **Qualification** - Budget, authority, need, timeline confirmed
3. **Proposal** - Solution presented
4. **Negotiation** - Terms and pricing discussed
5. **Closed Won** 🎉 - Deal won!
6. **Closed Lost** - Deal lost

## Creating Opportunities

1. Click **"+ Add Opportunity"** button
2. Fill in opportunity details:
   - **Required**: Name, Amount, Close Date
   - **Recommended**: Account, Contact, Stage, Probability
3. Set probability (0-100%)
4. Add description and next steps

## Kanban Board

**Drag-and-drop interface** for visual pipeline management:
- Move opportunities between stages
- Quick-edit cards
- Color-coded by stage
- Shows total value per stage

## Key Metrics

- **Pipeline Value**: Sum of all open opportunities
- **Win Rate**: Percentage of won deals
- **Average Deal Size**: Mean opportunity value
- **Sales Velocity**: Speed of deals through pipeline

## Best Practices

✓ **Update regularly** - keep stages current
✓ **Set realistic close dates** - avoid over-optimism
✓ **Adjust probability** as deals progress
✓ **Document next steps** for accountability
✓ **Review pipeline weekly** in team meetings
✓ **Clean up old opps** - close or disqualify stale deals
      `
    },
    {
      id: "activities",
      title: "Activities",
      icon: Calendar,
      color: "text-indigo-400",
      content: `
# Activity Tracking

Activities are the actions you take to move deals forward - calls, emails, meetings, tasks, and more.

## Activity Types

- **Call** - Phone conversations
- **Email** - Email correspondence
- **Meeting** - In-person or virtual meetings
- **Task** - To-do items
- **Note** - Quick notes and observations
- **Demo** - Product demonstrations
- **Proposal** - Proposal submissions
- **Scheduled AI Call** - Automated AI-powered calls
- **Scheduled AI Email** - Automated AI-generated emails

## Creating Activities

1. Click **"+ Add Activity"** button
2. Fill in details:
   - **Required**: Type, Subject
   - **Optional**: Description, Due Date, Priority
3. Link to Contact, Account, Lead, or Opportunity
4. Set status (Scheduled, In Progress, Completed)

## Activity Management

### Priority Levels
- **Low** - Nice to have
- **Normal** - Standard priority
- **High** - Important
- **Urgent** - Drop everything

### Status Tracking
- **Scheduled** - Planned for future
- **Overdue** - Past due date
- **In Progress** - Currently working on it
- **Completed** - Finished
- **Cancelled** - No longer needed
- **Failed** - Did not complete successfully

### Calendar Integration
- View activities in calendar format (Month/Week/Day)
- Drag-and-drop to reschedule
- Quick-add from calendar
- Filter by activity type

## AI-Powered Activities

### Scheduled AI Calls
Configure automated calls with:
- Custom AI prompt/script
- Contact phone number
- Call objective (Follow-up, Qualification, etc.)
- Retry settings

### Scheduled AI Emails
Configure automated emails with:
- Subject template
- AI-generated body content
- Personalization variables
- Send schedule

## Best Practices

✓ **Log everything** - even quick calls
✓ **Set due dates** - create accountability
✓ **Use priorities** - focus on what matters
✓ **Link to records** - maintain relationship history
✓ **Complete on time** - or reschedule proactively
✓ **Review daily** - check your activity list each morning
      `
    },
    {
      id: "bizdev",
      title: "BizDev Sources",
      icon: Database,
      color: "text-cyan-400",
      content: `
# Business Development Sources

BizDev Sources help you manage large lists of potential prospects from directories, trade shows, or purchased lists before actively pursuing them.

## What are BizDev Sources?

Think of BizDev Sources as a **staging area** for prospects:
- Import company lists from directories
- Store prospect information before qualification
- Track license status and compliance
- Promote to Accounts when business is won

## Workflow

\`\`\`
BizDev Source → Create Lead → Qualify → Win Deal → Promote to Account
\`\`\`

### Step-by-Step Process

1. **Import Source List**
   - Upload CSV with company data
   - Include company name, contact info, industry
   - Add source identifier (e.g., "Construction Directory Q4 2025")

2. **Create Leads**
   - Generate leads for companies you want to pursue
   - Link leads back to BizDev Source
   - Track which sources generate best leads

3. **Pursue Opportunities**
   - Qualify leads
   - Create opportunities
   - Work deals through pipeline

4. **Promote to Account**
   - When deal is won, promote BizDev Source to Account
   - Creates permanent Account record
   - Preserves all linked leads and history

## Key Features

### Bulk Operations
- **Archive**: Move old sources to archive (preserves data)
- **Delete**: Permanently remove sources
- **Promote**: Convert multiple sources to Accounts

### Filtering
- Filter by status (Active, Promoted, Archived)
- Search by company name
- Filter by industry
- Filter by license status

### License Tracking
Track industry-specific licenses:
- **Active** - License current
- **Suspended** - Temporarily suspended
- **Revoked** - License revoked
- **Expired** - License expired
- **Not Required** - No license needed

## Best Practices

✓ **Use descriptive source names** (e.g., "ABC Directory 2025 Q1")
✓ **Regular cleanup** - archive old sources
✓ **Track conversion rates** - which sources perform best
✓ **Don't promote prematurely** - wait until deal is won
✓ **Use tags** for additional categorization
      `
    },
    {
      id: "cashflow",
      title: "Cash Flow",
      icon: DollarSign,
      color: "text-green-400",
      content: `
# Cash Flow Management

Track your business income and expenses to maintain healthy cash flow and make informed financial decisions.

## Transaction Types

### Income Categories
- **Sales Revenue** - Product/service sales
- **Recurring Revenue** - Subscriptions, retainers
- **Refund** - Money returned to customers

### Expense Categories
- **Operating Expense** - General operations
- **Marketing** - Advertising and promotion
- **Equipment** - Tools and equipment purchases
- **Supplies** - Office and operational supplies
- **Utilities** - Power, water, internet
- **Rent** - Facility rent
- **Payroll** - Employee compensation
- **Professional Services** - Legal, accounting, consulting
- **Travel** - Business travel expenses
- **Meals** - Business meals and entertainment
- **Other** - Miscellaneous expenses

## Creating Transactions

### Manual Entry
1. Click **"+ Add Transaction"**
2. Select Income or Expense
3. Choose category
4. Enter amount and date
5. Add description and vendor/client
6. Optionally link to Account or Opportunity

### Receipt Processing
1. Upload receipt image or PDF
2. AI extracts transaction details
3. Review and confirm
4. Transaction created automatically

### CRM Integration
Some transactions auto-create when:
- Opportunity closed as Won (creates income)
- Invoice paid (creates income)

## Key Features

### Transaction Status
- **Actual** - Already occurred
- **Projected** - Forecasted future transaction
- **Pending** - Awaiting confirmation
- **Cancelled** - Transaction cancelled

### Recurring Transactions
Set up repeating transactions:
- Weekly
- Monthly
- Quarterly
- Annually

### Tax Categories
- **Deductible** - Tax deductible
- **Non-Deductible** - Not deductible
- **Asset** - Capital asset
- **Unknown** - Needs review

### Reports & Charts
- Monthly cash flow trends
- Income vs Expense comparison
- Category breakdowns
- Projections and forecasting

## Best Practices

✓ **Record promptly** - don't wait until month-end
✓ **Use categories consistently** - easier to analyze
✓ **Upload receipts** - for tax compliance
✓ **Set up recurring** - for predictable expenses
✓ **Review monthly** - check for unusual patterns
✓ **Project ahead** - plan for upcoming expenses
      `
    },
    {
      id: "documents",
      title: "Document Processing",
      icon: FileText,
      color: "text-pink-400",
      content: `
# Document Processing & Management

Use AI to extract data from business documents, automate data entry, and manage your files.

## Business Card Processing

### Upload & Extract
1. Take photo of business card or upload image
2. AI extracts contact information:
   - Name
   - Company
   - Job Title
   - Email
   - Phone
   - Address
3. Review extracted data
4. Create Contact and/or Account records

### Supported Formats
- JPG, PNG images
- PDF scans
- Batch upload multiple cards

## Receipt Processing

### For Cash Flow
1. Upload receipt or invoice
2. AI extracts:
   - Merchant name
   - Total amount
   - Transaction date
   - Payment method
   - Line items
3. Review and categorize
4. Creates Cash Flow transaction automatically

### Tax Categories
AI suggests appropriate tax categories:
- Operating expenses
- Meals & entertainment
- Travel
- Equipment
- And more...

## Document Management

### File Storage
- Upload documents (PDF, Word, Excel, images)
- Organize by categories
- Add tags and descriptions
- Full-text search

### Document Types
- **User Guide** - Help documentation
- **API Reference** - Technical docs
- **Tutorial** - How-to guides
- **Policy** - Company policies
- **FAQ** - Frequently asked questions
- **Receipt** - Financial receipts
- **Invoice** - Invoices
- **Other** - Miscellaneous documents

### Search & Discovery
- Full-text search across documents
- Filter by category and tags
- AI-powered content extraction
- Quick document preview

## Best Practices

✓ **Process immediately** - don't let cards pile up
✓ **Review AI extraction** - verify accuracy
✓ **Add notes** - context for later
✓ **Organize files** - use consistent naming
✓ **Tag appropriately** - makes finding easier
      `
    },
    {
      id: "reports",
      title: "Reports & Analytics",
      icon: BarChart3,
      color: "text-purple-400",
      content: `
# Reports & Analytics

Gain insights into your business performance with comprehensive reporting and analytics.

## Available Reports

### 1. Overview Dashboard
- Total contacts, accounts, leads, opportunities
- Pipeline value
- Activities this month
- Trend indicators (↑ ↓ compared to last period)
- Lead sources distribution
- Sales pipeline by stage

### 2. Sales Analytics
- Pipeline analysis by stage
- Win rate and conversion metrics
- Average deal size
- Sales cycle length
- Top performing sales reps
- Closed deals timeline

### 3. Lead Analytics
- Lead generation trends
- Lead source performance
- Conversion rates by source
- Lead scoring distribution
- Time-to-conversion analysis
- Lead aging report

### 4. Productivity Analytics
- Activity completion rates
- Most productive activity types
- Completion patterns by date
- Overdue task tracking
- Team performance metrics
- Individual productivity scores

### 5. Forecasting Dashboard
- Revenue projections
- Pipeline weighted forecasts
- Deal close probability analysis
- Seasonal trends
- Growth trajectory
- Risk analysis

### 6. AI Market Insights
- Industry trends and analysis
- Competitive intelligence
- Market opportunities
- Growth recommendations
- Customer segment analysis
- Strategic suggestions

### 7. Data Quality Report
- Duplicate detection
- Missing critical fields
- Data completeness scores
- Stale records identification
- Cleanup recommendations

## Export Options

### PDF Export
- Professional formatted reports
- Include charts and graphs
- Add company branding
- Suitable for presentations

### CSV Export
- Raw data export
- For further analysis in Excel
- Compatible with BI tools
- Bulk data extraction

## Filtering & Customization

All reports support:
- Date range selection
- User/employee filtering
- Status filtering
- Custom fields
- Tag-based filtering

## Best Practices

✓ **Review weekly** - stay on top of metrics
✓ **Share with team** - transparency builds accountability
✓ **Set benchmarks** - track against goals
✓ **Export regularly** - for board meetings and reviews
✓ **Act on insights** - don't just collect data
      `
    },
    {
      id: "employees",
      title: "Employee Management",
      icon: Briefcase,
      color: "text-amber-400",
      content: `
# Employee Management

Manage your team members, assign CRM access, and control permissions.

## Employee Records

### Creating Employees
1. Navigate to **Employees** page
2. Click **"+ Add Employee"**
3. Fill in employee details:
   - **Required**: First Name, Last Name, Department, Job Title
   - **Optional**: Email, Phone, Manager, Skills
4. Set employment type and status

### Employment Types
- **Full Time** - Regular full-time employee
- **Part Time** - Part-time employee
- **Contractor** - Independent contractor
- **Seasonal** - Seasonal worker

### Departments
- Sales
- Marketing
- Operations
- Field Services
- Construction
- Maintenance
- Administration
- Management
- Technical
- Customer Service
- Other

## CRM Access Management

### Access Tiers

**Tier 3 - Team Lead**
- View team members' data
- Full access to own records
- Cannot access other teams
- Read/write permissions
- Can create and edit records

**Tier 4 - Manager/Administrator**
- View all tenant data
- Full administrative controls
- Manage users and settings
- Access to all modules
- Export capabilities

### Requesting CRM Access

For employees without CRM access:
1. Click **"Request CRM Access"**
2. Select desired tier (Tier 3 or Tier 4)
3. Choose access level (Read or Read/Write)
4. Submit request
5. Admin receives notification
6. Admin reviews and approves/denies

### Inviting to CRM

Admins can invite employees:
1. Select employee record
2. Click **"Invite to CRM"**
3. System sends invitation email
4. Employee completes signup
5. Permissions automatically applied

## Permission Management

### Access Levels
- **Read Only** - View data only
- **Read/Write** - Full CRUD operations

### Employee Roles
- **Manager** - Full tenant visibility
- **Employee** - Own records + assigned records

### Navigation Permissions
Control which modules each user can access:
- Dashboard
- Contacts, Accounts, Leads
- Opportunities, Activities
- Reports, Cash Flow
- And more...

## Best Practices

✓ **Accurate org chart** - set manager relationships
✓ **Regular access reviews** - quarterly permission audits
✓ **Least privilege** - give minimum required access
✓ **Document skills** - track certifications and training
✓ **Update promptly** - reflect role changes immediately
      `
    },
    {
      id: "ai",
      title: "AI Features",
      icon: Brain,
      color: "text-pink-400",
      content: `
# AI-Powered Features

Leverage artificial intelligence to automate tasks, gain insights, and work smarter.

## AI Agent (Avatar)

### Access via:
- **Navigation Menu** - Click AI Agent icon
- **Agent Page** - Full conversational interface
- **WhatsApp Integration** - Connect your WhatsApp

### Capabilities
The AI Agent can:
- **Search Records**: Find contacts, leads, opportunities
- **Create Records**: Add new contacts, leads, activities
- **Update Records**: Modify existing data
- **Analyze Data**: Generate insights and summaries
- **Answer Questions**: About your CRM data
- **Provide Recommendations**: Next best actions
- **Web Research**: Search internet for company info

### Using the Agent

**Voice Commands** (if mic enabled):
- "Show me all high-value opportunities"
- "Create a new contact for John Smith at Acme Corp"
- "What's my pipeline value this month?"

**Text Chat**:
- Type natural language queries
- Get structured responses
- Follow-up questions for clarification

### Agent Context
The agent has access to:
- Your tenant data
- Current user permissions
- Recent activities and notes
- Business context and industry

## AI Campaigns

### Automated Outreach
Create campaigns for:
- **Follow-ups** - Re-engage cold leads
- **Qualification** - Initial discovery calls
- **Appointment Setting** - Schedule meetings
- **Customer Service** - Check-in calls
- **Surveys** - Collect feedback

### Campaign Setup
1. Create campaign with objectives
2. Upload target contact list
3. Write AI prompt/script template
4. Set calling schedule and rules
5. Monitor results and outcomes

### AI Call Features
- Natural conversation flow
- Handles objections
- Collects information
- Schedules callbacks
- Updates CRM automatically

## AI Email Generation

### Smart Email Drafts
AI generates emails based on:
- Context (follow-up, proposal, etc.)
- Contact information
- Previous interactions
- Your writing style

### Use Cases
- Follow-up after meeting
- Proposal presentation
- Case study sharing
- Event invitations
- Re-engagement campaigns

## Lead Scoring

### Automatic Scoring (0-100)
Factors considered:
- Profile completeness
- Company size and industry
- Engagement level
- Lead source quality
- Behavioral signals

### AI Recommendations
- **Follow Up** - Hot lead, contact soon
- **Nurture** - Warm lead, stay in touch
- **Qualify** - Needs more information
- **Disqualify** - Not a good fit

## Market Insights

### Industry Analysis
AI provides:
- Market trends and forecasts
- Competitive landscape
- Growth opportunities
- Risk factors
- Strategic recommendations

### Based on:
- Your industry
- Business model (B2B/B2C)
- Geographic focus
- Current performance data

## Document Intelligence

### Automatic Extraction
From business cards:
- Contact information
- Company details
- Job titles

From receipts:
- Transaction details
- Merchant information
- Line items
- Tax categories

## Best Practices

✓ **Trust but verify** - Review AI suggestions
✓ **Provide context** - Better prompts = better results
✓ **Train over time** - AI learns from corrections
✓ **Start small** - Test campaigns with small groups
✓ **Monitor results** - Track AI performance metrics
      `
    },
    {
      id: "integrations",
      title: "Integrations",
      icon: Puzzle,
      color: "text-blue-400",
      content: `
# Integrations & Automation

Connect Ai-SHA CRM with other tools and automate your workflows.

## Available Integrations

### Cloud Storage
- **Google Drive** - Sync documents
- **OneDrive** - Microsoft cloud storage

### Calendar & Email
- **Google Calendar** - Two-way sync
- **Gmail** - Email integration
- **Outlook Email** - Microsoft email
- **Outlook Calendar** - Microsoft calendar

### Automation
- **Zapier** - Connect 3,000+ apps
- **n8n** - Open-source automation
- **Webhooks** - Custom integrations

### AI Providers
- **OpenAI** - GPT models
- **Anthropic** - Claude models
- **Azure OpenAI** - Enterprise AI

### Payments
- **Stripe** - Payment processing
- **Billing Portal** - Subscription management

### Communications
- **Twilio** - SMS and calling
- **SignalWire** - VoIP softphone
- **ElevenLabs** - AI voice

## Webhook Configuration

### Creating Webhooks
1. Navigate to **Integrations → Webhooks**
2. Click **"Add Webhook"**
3. Select trigger event:
   - contact.created
   - contact.updated
   - lead.created
   - opportunity.updated
   - And more...
4. Enter target URL (your webhook endpoint)
5. Save and activate

### Webhook Events
Trigger webhooks when:
- Records are created, updated, or deleted
- Opportunities change stages
- Activities are completed
- Leads are converted

### Webhook Payload
Includes:
- Event type
- Record data
- Timestamp
- User who triggered event
- Previous values (for updates)

## Email Integration

### Webhook-Based Email
Send automated emails via n8n or Make:
1. Set up webhook in automation tool
2. Configure email template
3. Map CRM data fields
4. Trigger on CRM events

### Email Templates
Save frequently used emails:
- Subject templates
- Body templates
- Variable substitution
- Merge fields

## API Access

### REST API
- Full CRUD operations
- Authentication via API keys
- Rate limiting: 100 req/min
- JSON responses

### Authentication
Generate API keys:
1. **Settings** → **API Keys**
2. Create new key
3. Set permissions and expiry
4. Copy key (shown once)

## Automation Examples

### Lead Nurturing
\`\`\`
New Lead Created
  ↓
Add to Email Sequence (via Zapier)
  ↓
Schedule Follow-up Activity
  ↓
Notify Assigned Sales Rep
\`\`\`

### Opportunity Alerts
\`\`\`
Opportunity Stage Changed
  ↓
Send Slack Notification
  ↓
Update Google Sheet
  ↓
Create Task in Project Management
\`\`\`

### Customer Onboarding
\`\`\`
Opportunity Closed Won
  ↓
Create Account (if needed)
  ↓
Send Welcome Email
  ↓
Create Onboarding Tasks
  ↓
Notify Customer Success Team
\`\`\`

## Best Practices

✓ **Test webhooks** - use test endpoints first
✓ **Handle errors** - implement retry logic
✓ **Secure endpoints** - validate webhook signatures
✓ **Monitor usage** - check API rate limits
✓ **Document integrations** - for team reference
      `
    },
    {
      id: "calendar",
      title: "Calendar",
      icon: Calendar,
      color: "text-teal-400",
      content: `
# Calendar Management

Visualize and manage your activities in calendar format with multiple views and drag-and-drop scheduling.

## Calendar Views

### Month View
- See entire month at a glance
- Activities shown on their due dates
- Color-coded by type
- Click to view details
- Quick-add new activities

### Week View
- Detailed weekly schedule
- Time-based activity placement
- Hourly slots (8 AM - 6 PM)
- Drag to reschedule
- Multi-day activities span

### Day View
- Hour-by-hour breakdown
- Ideal for busy schedules
- Shows duration blocks
- Quick activity creation
- Detailed time slots

### Agenda View
- List format of upcoming activities
- Grouped by date
- Overdue items highlighted
- Easy to scan and prioritize
- Quick status updates

## Calendar Features

### Drag & Drop
- Reschedule activities by dragging
- Move between days or time slots
- Visual feedback during drag
- Auto-saves changes

### Quick Add
- Click any date to create activity
- Pre-filled with selected date
- Quick form for fast entry
- Keyboard shortcuts supported

### Filtering
Filter calendar by:
- Activity type (calls, meetings, tasks)
- Status (scheduled, completed, overdue)
- Priority level
- Assigned user
- Related entity (contact, account, etc.)

### Color Coding
Activities color-coded by:
- **Type**: Different colors for calls, meetings, tasks
- **Status**: Grayed out for completed, red for overdue
- **Priority**: Border thickness indicates priority

## Quick Actions

### From Calendar
- **Click date** - Create activity
- **Click activity** - View/edit details
- **Drag activity** - Reschedule
- **Right-click** - Context menu
- **Double-click** - Quick complete

### Keyboard Shortcuts
- **N** - New activity
- **T** - Today
- **←/→** - Previous/Next period
- **M/W/D** - Month/Week/Day view

## Activity Time Management

### Scheduling
- Set specific times (not just dates)
- Duration in minutes
- All-day activities
- Recurring activities
- Reminder notifications

### Time Zones
- Respects user timezone settings
- Convert times for team members
- Display in 12hr or 24hr format

## Calendar Sync (Coming Soon)

### External Calendar Integration
- **Google Calendar** - Two-way sync
- **Outlook Calendar** - Two-way sync
- **Apple Calendar** - One-way export
- **iCal Feed** - Subscribe to CRM calendar

## Best Practices

✓ **Block time** - Schedule focused work periods
✓ **Set realistic durations** - Don't overbook
✓ **Use recurring** - For regular meetings
✓ **Update promptly** - Mark as complete when done
✓ **Review weekly** - Plan upcoming week on Fridays
✓ **Time blocking** - Group similar activities together
      `
    },
    {
      id: "utilities",
      title: "Utilities & Tools",
      icon: Wrench,
      color: "text-slate-400",
      content: `
# Utilities & Data Tools

Powerful utilities for data management, quality control, and system maintenance.

## Duplicate Detection

### Finding Duplicates

**Contacts**
- Match by: Email, Phone, Name combination
- Fuzzy matching for similar names
- Company name matching
- Address similarity

**Accounts**
- Match by: Company name, Website, Phone
- DBA name variations
- Address matching

**Leads**
- Match by: Email, Phone, Name + Company
- Pre-conversion duplicate check

### Consolidation

**Merge Process**:
1. Review suggested duplicates
2. Select records to merge
3. Choose which record to keep (master)
4. System merges:
   - All activities
   - All notes
   - All opportunities
   - All relationships
5. Duplicate records deleted
6. History preserved

**What Gets Merged**:
- ✓ Activities and tasks
- ✓ Notes and comments
- ✓ Opportunities (reassigned)
- ✓ Tags (combined)
- ✓ Files and documents
- ✓ Custom field data
- ✓ Relationships

## Data Quality

### Quality Metrics
- **Completeness Score** - % of required fields filled
- **Accuracy Score** - Validated data (emails, phones)
- **Consistency Score** - Standardized formats
- **Freshness Score** - Recent activity

### Issues Detected
- Missing critical fields
- Invalid email formats
- Invalid phone numbers
- Orphaned records (broken links)
- Stale records (no activity >180 days)
- Duplicate entries

### Cleanup Actions
- **Bulk Update** - Fix common issues
- **Validation** - Verify emails and phones
- **Standardization** - Format consistency
- **Deletion** - Remove invalid records
- **Archival** - Move old data to archive

## Data Diagnostics

### System Health Checks
- Database integrity
- Referential consistency
- Orphaned record detection
- Denormalization sync status
- Performance metrics

### Access Diagnostics
- User permission verification
- Role-based access testing
- Tenant isolation checks
- Employee scope validation

### Performance Analysis
- API response times
- Query optimization
- Cache hit rates
- Database query patterns

## Import & Export

### Bulk Import
- CSV file support
- Field mapping interface
- Validation before import
- Batch processing (1000 records/batch)
- Error logging
- Duplicate detection during import

### Bulk Export
- Export to CSV
- Filter data before export
- Select specific fields
- Include related records
- Scheduled exports (admins)

## Data Management

### Archiving
**Old Activities**
- Completed activities >365 days
- Move to R2 cloud storage
- Retrieve when needed
- Preserves historical data

**Closed Opportunities**
- Closed Won/Lost >365 days
- Archive to free up space
- Searchable archives
- Easy restoration

### Data Retention
Configure retention policies:
- Activities: 30-365 days
- Opportunities: 30-365 days
- Documents: Custom periods
- Automatic cleanup jobs

### Backups
- Automated daily backups
- Point-in-time recovery
- Download tenant data
- Restore capabilities (admin only)

## Testing Tools (Admins Only)

### Unit Tests
- Entity CRUD operations
- Form validation logic
- Data integrity checks
- Permission system tests
- Integration tests

### Test Data Management
- Create test records
- Mark as test data
- Bulk cleanup test data
- Isolated from production reports

## Best Practices

✓ **Run quality checks monthly** - Stay on top of data hygiene
✓ **Merge duplicates promptly** - Don't let them multiply
✓ **Import carefully** - Validate data before bulk import
✓ **Regular exports** - Backup your data externally
✓ **Archive old data** - Keep system performant
✓ **Test before production** - Use test data for training
      `
    },
    {
      id: "settings",
      title: "Settings & Administration",
      icon: Settings,
      color: "text-gray-400",
      content: `
# Settings & Administration

Configure your CRM instance, manage users, and customize the system to your needs.

## User Settings

### Profile Information
- Full name and display name
- Email address (login)
- Phone number (for softphone)
- Profile picture
- Timezone and date format

### Preferences
- **Timezone** - Your local timezone
- **Date Format** - MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
- **Time Format** - 12hr or 24hr
- **Language** - Interface language (future)

## Tenant Settings (Admins)

### Branding
- **Company Name** - Your business name
- **Logo Upload** - Company logo (header & footer)
- **Primary Color** - Brand color for UI
- **Accent Color** - Secondary brand color
- **Industry** - Your industry (for AI context)
- **Business Model** - B2B, B2C, or Hybrid

### Company Information
- Business address
- Contact information
- Tax ID / Business number
- Website
- Social media links

## User Management (Admins)

### Inviting Users
1. **Settings** → **User Management**
2. Click **"Invite User"**
3. Enter email and name
4. Select role:
   - **Superadmin** - Full system access (app owner)
   - **Admin** - Tenant administrator
   - **Power User** - Advanced features
   - **User** - Standard access
5. Set employee role:
   - **Manager** - Full tenant visibility
   - **Employee** - Own records only
6. Configure navigation permissions
7. Send invitation

### User Roles Explained

**Superadmin** (App Creator)
- Access all tenants
- System-wide settings
- Create tenants
- Global user management

**Admin** (Tenant Owner)
- Full tenant access
- Manage tenant users
- Configure integrations
- Billing and subscriptions

**Power User**
- Full tenant data access
- Create and edit all records
- Export capabilities
- Limited admin functions

**User** (Standard)
- View assigned records
- Create and edit own records
- Limited export
- No admin access

### Employee Roles

**Manager**
- View all tenant records
- Manage team members
- Assign leads and opportunities
- Full reporting access

**Employee**
- View own records
- View records assigned to them
- Limited reporting
- Cannot see other employees' data

### Navigation Permissions
Customize which modules each user can access:
- Check/uncheck modules
- Override defaults
- Per-user customization
- Security through obscurity + RLS

## Module Settings

### Enable/Disable Modules
Turn modules on/off for your tenant:
- Dashboard, Contacts, Accounts
- Leads, Opportunities, Activities
- BizDev Sources, Cash Flow
- Documents, Reports, Integrations
- AI Campaigns, Calendar
- Utilities

**Effect**:
- Hides from navigation
- Blocks page access
- Optimizes performance
- Simplifies interface for specific use cases

## Integration Settings

### API Keys
- Generate API keys for integrations
- Set expiration dates
- Revoke keys
- Monitor usage

### Webhooks
- Configure outgoing webhooks
- Set up event triggers
- Test webhook endpoints
- View webhook logs

### Third-Party Integrations
- Connect Google Workspace
- Connect Microsoft 365
- Configure Stripe
- Set up Zapier/n8n

## Security Settings

### Authentication
- Password requirements
- Two-factor authentication (future)
- Session timeout
- IP whitelist (future)

### Data Security
- Encryption at rest
- Encryption in transit
- Regular backups
- Access logging

### Audit Logging
Track all actions:
- User logins/logouts
- Record changes
- Permission changes
- Setting modifications
- Export activities

## Billing & Subscriptions (Admins)

### Subscription Plans
- View current plan
- Upgrade/downgrade
- Add user licenses
- Payment method management

### Usage Tracking
- API call usage
- Storage used
- User count
- Integration limits

### Invoices
- Download invoices
- Payment history
- Billing address
- Tax information

## Data Management

### Export Options
- Export all tenant data
- Scheduled exports
- Backup downloads
- GDPR compliance exports

### Import Tools
- CSV import
- Data mapping
- Validation rules
- Error handling

### Data Retention
- Set retention policies
- Auto-archive old data
- Purge deleted records
- Compliance settings

## Best Practices

✓ **Regular audits** - Review user access quarterly
✓ **Strong passwords** - Enforce password policy
✓ **Least privilege** - Give minimum required permissions
✓ **Monitor usage** - Check audit logs regularly
✓ **Backup data** - Export data regularly
✓ **Update branding** - Keep logo and colors current
✓ **Test integrations** - Verify webhook functionality
      `
    },
    {
      id: "workflow",
      title: "Workflow Guide",
      icon: Route,
      color: "text-indigo-400",
      content: `
# Workflow Guide

Learn best practices and recommended workflows for common CRM scenarios.

## New Lead to Customer Workflow

\`\`\`
1. Lead Captured (Website, Referral, etc.)
   ↓
2. Lead Created in CRM
   - Auto-assigned based on territory/round-robin
   - AI scores lead automatically
   ↓
3. Initial Contact (within 24 hours)
   - Phone call or email
   - Log activity
   - Update lead status to "Contacted"
   ↓
4. Qualification
   - Assess budget, authority, need, timeline (BANT)
   - Update lead score
   - Add qualifying notes
   ↓
5. Convert Lead
   - Create Contact record
   - Create/link Account record
   - Create Opportunity
   ↓
6. Opportunity Management
   - Move through pipeline stages
   - Log activities
   - Update probability
   ↓
7. Deal Close
   - Closed Won: Promote to customer
   - Closed Lost: Document reason
   ↓
8. Customer Onboarding (if won)
   - Welcome email
   - Schedule kickoff meeting
   - Create onboarding tasks
\`\`\`

## Daily Activities Workflow

### Morning Routine (15-30 min)
1. **Review Calendar**
   - Check today's activities
   - Prepare for meetings
   - Reschedule conflicts

2. **Check Dashboard**
   - Review overdue tasks
   - Check new leads assigned
   - Monitor pipeline changes

3. **Prioritize Tasks**
   - Focus on urgent/important
   - Set 3 must-do items for today
   - Block time for key activities

### Throughout Day
4. **Log Activities Promptly**
   - After each call/meeting
   - Add next steps
   - Update opportunity stages

5. **Respond to Notifications**
   - New lead assignments
   - Activity reminders
   - Team updates

### End of Day (10-15 min)
6. **Complete Pending Activities**
   - Mark tasks as done
   - Reschedule unfinished items
   - Add follow-up notes

7. **Plan Tomorrow**
   - Review calendar for tomorrow
   - Create task list
   - Set priorities

## Weekly Pipeline Review

### Monday Morning
- Review pipeline value and velocity
- Check deals closing this week
- Assign new leads

### Mid-Week
- Follow up on stalled opportunities
- Update close dates
- Log all customer interactions

### Friday Afternoon
- Clean up completed activities
- Update opportunity probabilities
- Plan next week's priorities
- Review team performance

## Monthly Reporting Workflow

### First Week of Month
1. **Close Last Month**
   - Mark won/lost deals
   - Complete overdue activities
   - Archive old records

2. **Generate Reports**
   - Sales performance
   - Lead conversion rates
   - Team productivity
   - Pipeline forecast

3. **Review Metrics**
   - Compare to goals
   - Identify trends
   - Spot issues

4. **Plan Ahead**
   - Set goals for new month
   - Adjust strategies
   - Update forecasts

## BizDev Source Workflow

\`\`\`
1. Import Business Development List
   - Upload CSV from directory
   - Tag with source name
   - Review for duplicates
   ↓
2. Research & Filter
   - Identify promising companies
   - Check license status
   - Prioritize targets
   ↓
3. Create Leads
   - Generate lead for target company
   - Link back to BizDev Source
   - Assign to sales rep
   ↓
4. Pursue Opportunity
   - Qualify lead
   - Create opportunity
   - Work through pipeline
   ↓
5. Upon Winning
   - Close opportunity as Won
   - Promote BizDev Source to Account
   - Begin customer relationship
   ↓
6. Cleanup
   - Archive non-converted sources
   - Track conversion rates by source
   - Refine targeting
\`\`\`

## Document Processing Workflow

### Business Cards
\`\`\`
1. Collect Cards (Networking Event)
   ↓
2. Batch Upload to CRM
   - Take photos or scan
   - Upload to Document Processing
   ↓
3. AI Extracts Data
   - Review extracted information
   - Correct any errors
   ↓
4. Create Records
   - Create Contact
   - Create Account (if new company)
   - Tag with event name
   ↓
5. Immediate Follow-Up
   - Send connection email
   - Add to nurture campaign
   - Schedule follow-up call
\`\`\`

### Receipt Processing
\`\`\`
1. Receive Receipt
   ↓
2. Upload Immediately
   - Photo or PDF
   - Upload to Document Processing
   ↓
3. AI Extracts Transaction
   - Verify merchant and amount
   - Confirm category
   ↓
4. Review & Approve
   - Check tax category
   - Add notes if needed
   ↓
5. Cash Flow Updated
   - Transaction created automatically
   - Reports updated in real-time
\`\`\`

## Team Collaboration Workflow

### Lead Assignment
- **Round Robin**: Auto-assign to next available rep
- **Territory**: Based on geographic location
- **Specialization**: By industry or product line
- **Workload**: Balance across team

### Handoffs
When transferring records between team members:
1. Add detailed handoff notes
2. Schedule transition call
3. Update assignment
4. Notify new owner
5. Follow up after 1 week

### Team Meetings
**Weekly Sales Meeting Structure**:
1. Pipeline review (each rep presents)
2. Wins and losses discussion
3. Stuck deals brainstorming
4. New leads assignment
5. Next week priorities

## Best Practices Summary

✓ **Consistency is key** - Follow processes every time
✓ **Log everything** - If it's not in the CRM, it didn't happen
✓ **Update promptly** - Don't wait until end of day
✓ **Review regularly** - Daily tasks, weekly pipeline, monthly performance
✓ **Clean as you go** - Don't let data pile up
✓ **Communicate** - Use notes to keep team informed
✓ **Leverage automation** - Let AI and integrations handle routine tasks
✓ **Measure and improve** - Track metrics and adjust processes
      `
    }
  ];

  // Filter sections based on search
  const filteredSections = documentationSections.filter(section => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      section.title.toLowerCase().includes(searchLower) ||
      section.content.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-purple-900/30 border border-purple-700/50">
                <Book className="w-5 h-5 sm:w-7 sm:h-7 text-purple-400" />
              </div>
              Documentation
            </h1>
            <p className="text-slate-400 mt-1 text-sm sm:text-base">
              Comprehensive guide to using Ai-SHA CRM
            </p>
          </div>

          {/* Version Badge */}
          <Badge variant="outline" className="text-xs">
            v2.0 - Updated {new Date().toLocaleDateString()}
          </Badge>
        </div>

        {/* Search */}
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search documentation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
              />
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {documentationSections.slice(0, 12).map((section) => {
            const IconComponent = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  activeSection === section.id
                    ? 'bg-slate-700 border-purple-500'
                    : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                }`}
              >
                <IconComponent className={`w-6 h-6 ${section.color} mb-2`} />
                <p className="text-sm font-medium text-slate-200">{section.title}</p>
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <Card className="bg-slate-800 border-slate-700 sticky top-4">
              <CardHeader>
                <CardTitle className="text-sm text-slate-400 uppercase tracking-wider">
                  Sections
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <nav className="space-y-1">
                  {filteredSections.map((section) => {
                    const IconComponent = section.icon;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`w-full px-4 py-3 flex items-center gap-3 transition-colors text-left ${
                          activeSection === section.id
                            ? 'bg-purple-600 text-white'
                            : 'text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <IconComponent className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{section.title}</span>
                      </button>
                    );
                  })}
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Content Area */}
          <div className="lg:col-span-3">
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-6 sm:p-8">
                {filteredSections.length === 0 ? (
                  <div className="text-center py-12">
                    <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No documentation found matching your search.</p>
                  </div>
                ) : (
                  <div className="prose prose-slate prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => (
                          <h1 className="text-3xl font-bold text-slate-100 mb-4">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-xl font-semibold text-slate-200 mt-6 mb-3">{children}</h3>
                        ),
                        h4: ({ children }) => (
                          <h4 className="text-lg font-semibold text-slate-300 mt-4 mb-2">{children}</h4>
                        ),
                        p: ({ children }) => (
                          <p className="text-slate-300 leading-relaxed mb-4">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal list-inside text-slate-300 space-y-2 mb-4">{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className="text-slate-300">{children}</li>
                        ),
                        code: ({ inline, children }) => (
                          inline ? (
                            <code className="bg-slate-700 px-2 py-1 rounded text-purple-400 text-sm">
                              {children}
                            </code>
                          ) : (
                            <code className="block bg-slate-900 p-4 rounded-lg text-slate-300 text-sm overflow-x-auto mb-4">
                              {children}
                            </code>
                          )
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-purple-500 pl-4 italic text-slate-400 my-4">
                            {children}
                          </blockquote>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-slate-100">{children}</strong>
                        ),
                        a: ({ href, children }) => (
                          <a href={href} className="text-purple-400 hover:text-purple-300 underline">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {filteredSections.find(s => s.id === activeSection)?.content || ''}
                    </ReactMarkdown>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Help Section */}
            <Alert className="mt-6 bg-blue-900/20 border-blue-700/50">
              <Info className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-300">
                <strong>Need more help?</strong> Contact support at support@ai-sha.com or use the AI Agent for instant assistance.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </div>
    </div>
  );
}