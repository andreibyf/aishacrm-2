import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// Tabs are not used here
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BarChart3,
  Book,
  Brain,
  Briefcase,
  Building2,
  Calendar,
  Database,
  DollarSign,
  Download,
  FileText,
  Info,
  Puzzle,
  Search,
  Settings,
  Shield,
  Star,
  Target,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import UserContext from "@/components/shared/UserContext";
import { useContext } from "react";
import { getBackendUrl } from "@/api/backendUrl";

export default function DocumentationPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const { currentUser } = useContext(UserContext);
  
  const isAdmin = currentUser?.role === 'admin';
  const isSuperadmin = currentUser?.role === 'superadmin';
  
  const handleDownloadPDF = async () => {
    // Prefer backend-generated PDF from our markdown-based User Guide
    const backendUrl = getBackendUrl().replace(/\/$/, '');
    const candidates = [
      backendUrl ? `${backendUrl}/api/documentation/user-guide.pdf` : null,
      // Local static fallbacks if present
      '/guides/Ai-SHA-CRM-User-Guide-2025-10-26.pdf',
      '/guides/AISHA_CRM_USER_GUIDE.pdf',
      // Raw GitHub fallback (repo: andreibyf/aishacrm-2)
      'https://raw.githubusercontent.com/andreibyf/aishacrm-2/main/docs/Ai-SHA-CRM-User-Guide-2025-10-26.pdf',
    ].filter(Boolean);

    let urlToDownload = null;
    for (const url of candidates) {
      try {
        // Use HEAD where possible; some CDNs may block HEAD so allow GET with no-cors fallback
        const res = await fetch(url, { method: 'HEAD' });
        if (res.ok) { urlToDownload = url; break; }
      } catch {
        // ignore and try next
      }
    }

    if (!urlToDownload && backendUrl) {
      // Last resort: overview report as a PDF
      urlToDownload = `${backendUrl}/api/reports/export-pdf?report_type=overview`;
    }

    if (!urlToDownload) {
      alert('Unable to locate the User Guide PDF. Please check with your administrator.');
      return;
    }

    const link = document.createElement('a');
    link.href = urlToDownload;
    link.download = 'Aisha_CRM_User_Guide.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const documentationSections = [
    {
      id: "user-guide",
      title: "User Guide",
      icon: Book,
      color: "text-blue-500",
      content: `
# Comprehensive User Guide

Welcome to the complete Aisha CRM User Guide. This comprehensive 14-chapter guide covers everything from getting started to advanced features.

## 📚 Quick Access to Chapters

### Getting Started
- **Chapter 1: Introduction** - About Aisha CRM, what makes it special, system requirements
- **Chapter 2: Getting Started** - First login, interface overview, navigation basics, user profile setup

### Core CRM Features
- **Chapter 3: Core Features** - Dashboard overview, AI Executive Assistant, calendar management, search and filters
- **Chapter 4: Contact Management** - Creating and managing contacts, activities, bulk operations
- **Chapter 5: Account Management** - Creating accounts, account hierarchy, relationships
- **Chapter 6: Lead Management** - Creating leads, qualification, conversion, source tracking
- **Chapter 7: Opportunity Management** - Creating opportunities, pipeline stages, revenue forecasting
- **Chapter 8: Activities and Tasks** - Activity types, creation, management, and reporting

### AI-Powered Features
- **Chapter 9: AI Telephony and Call Management** - Call tracking, call history, AI-generated notes, automatic follow-ups, call outcomes
- **Chapter 10: AI Campaigns** - Campaign types, creation, progress tracking, performance metrics

### Advanced Features
- **Chapter 11: Reports and Analytics** - Dashboard reports, custom reports, exporting data, data visualization
- **Chapter 12: Workflows and Automation** - Understanding workflows, triggers, workflow management
- **Chapter 13: Advanced Features** - Document processing, email integration, business card scanner, duplicate detection
- **Chapter 14: Troubleshooting** - Common issues, error messages, getting help

### Appendices
- **Appendix A: Keyboard Shortcuts** - Quick reference for keyboard commands
- **Appendix B: Glossary** - CRM terminology and definitions
- **Appendix C: FAQ** - Frequently asked questions and answers

## 📖 Download Complete Guide

The full User Guide with detailed screenshots, step-by-step instructions, and best practices is available as a downloadable PDF document.

**Click the &quot;Download PDF Guide&quot; button** at the top of this page to get the complete documentation.

## 🎯 Key Features Covered

### AI Executive Assistant
Your personal AI assistant that can:
- Search and retrieve CRM data
- Create and update records via natural language
- Answer questions about your business
- Provide insights and recommendations
- Access via chat interface or WhatsApp integration

### AI Telephony
Automated call tracking and management:
- Automatic call logging and notes
- AI-generated call summaries
- Follow-up task creation
- Call outcome tracking
- Integration with telephony providers

### AI Campaigns
Automated outreach at scale:
- AI-powered call campaigns
- Email campaigns with AI content generation
- Progress tracking and performance metrics
- Target contact management
- Campaign scheduling and automation

### Complete CRM Functionality
- Contact, Account, Lead, and Opportunity management
- Activity tracking and calendar management
- Reports and analytics
- Document processing and business card scanning
- Cash flow management
- Employee management with role-based access

## 💡 Quick Start Checklist

**For New Users:**
1. ✓ Complete your user profile (Chapter 2.4)
2. ✓ Learn the dashboard (Chapter 3.1)
3. ✓ Create your first contact (Chapter 4.1)
4. ✓ Try the AI Assistant (Chapter 3.2)
5. ✓ Set up your calendar (Chapter 3.3)

**For Sales Teams:**
1. ✓ Import contacts (Chapter 4.4)
2. ✓ Create leads (Chapter 6.1)
3. ✓ Set up pipeline (Chapter 7.2)
4. ✓ Log activities (Chapter 8.2)
5. ✓ Review reports (Chapter 11.1)

**For Managers:**
1. ✓ Configure team access (Admin Guide)
2. ✓ Set up workflows (Chapter 12)
3. ✓ Create custom reports (Chapter 11.2)
4. ✓ Monitor team performance (Chapter 11.1)
5. ✓ Set up AI campaigns (Chapter 10)

## 🔍 Finding What You Need

Use the search function above to find specific topics quickly. The User Guide includes:
- Detailed step-by-step instructions
- Screenshots and visual guides
- Best practices and tips
- Troubleshooting solutions
- Real-world examples

## 📧 Need Help?

- **AI Assistant**: Ask questions directly in the CRM
- **Support**: support@ai-sha.com
- **Documentation**: Download the complete PDF User Guide using the button above
- **Admin Guide**: Administrators can download the Admin Guide PDF for system configuration
      `,
    },
    {
      id: "tenant-admin",
      title: "Tenant Administration",
      icon: Shield,
      color: "text-amber-500",
      content: `
# Tenant Administration

**For Tenant Administrators** - Manage your organization's users, settings, and access control.

## Your Admin Role

As a **Tenant Administrator**, you have full control over your organization&apos;s CRM instance:

✓ Manage users within your tenant
✓ Configure tenant settings and branding
✓ Control module access
✓ View all tenant data
✓ Assign permissions and roles
✗ Cannot access other tenants' data
✗ Cannot manage system-level settings (Superadmin only)

## User Management

### Inviting New Users

1. Navigate to **Settings** → **User Management**
2. Click **"+ Invite User"**
3. Fill in user details:
   - **Email Address** - User&apos;s work email
   - **First Name** and **Last Name**
   - **Job Title** and **Department**
4. Select **CRM Role**:
   - **Manager** - Can view all tenant records
   - **Employee** - Can only view own/assigned records
5. Set **Access Level**:
   - **Read/Write** - Full CRUD permissions
   - **Read Only** - View-only access
6. Configure **Module Access** (see below)
7. Click **"Send Invitation"**

The user will receive an email with a signup link.

### User Roles Explained

**Manager Role**
- View all contacts, accounts, leads, opportunities
- Access to all reports and analytics
- Can assign records to team members
- Export capabilities
- Cannot manage other users (unless also admin)

**Employee Role**
- View only their own records
- View records assigned to them
- Limited export (own data only)
- Cannot see other employees&apos; data
- Cannot assign records

### Managing Existing Users

**View User List**
1. **Settings** → **User Management**
2. See all users in your tenant
3. Filter by role, status, department

**Edit User**
1. Click on user name
2. Update details, role, or module access
3. Click **"Save Changes"**

**Deactivate User**
1. Select user
2. Click **"Deactivate"**
3. Confirm action
4. User can no longer login
5. Their data remains for handoff

**Reactivate User**
1. Filter to show inactive users
2. Select user
3. Click **"Reactivate"**
4. User can login again

## Module Access Control

### Available Modules

Control which features each user can access:

**Core Modules**
- ☑ Dashboard - Home page and overview
- ☑ Contacts - Contact management
- ☑ Accounts - Company management
- ☑ Leads - Lead pipeline
- ☑ Opportunities - Sales pipeline
- ☑ Activities - Task and calendar

**Additional Modules**
- ☑ BizDev Sources - Business development
- ☑ Cash Flow - Financial tracking
- ☑ Documents - File management
- ☑ Reports - Analytics and reports
- ☑ AI Campaigns - Automated campaigns
- ☑ AI Agent - Executive assistant
- ☑ Calendar - Calendar view
- ☑ Utilities - Data tools

**Administrative Modules**
- ☑ Employees - Employee management
- ☑ Settings - User settings only
- ☑ User Management - Admin only

### Configuring Module Access

**For New Users** (during invitation):
1. In the invitation form
2. Scroll to **"Module Access"**
3. Check modules to enable
4. Uncheck to disable

**For Existing Users**:
1. **Settings** → **User Management**
2. Click user name
3. Click **"Edit Permissions"**
4. Update module checkboxes
5. Save changes

**Best Practices**:
- Start with minimal access
- Add modules as needed
- Sales team: Enable Contacts, Accounts, Leads, Opportunities
- Marketing team: Enable Leads, Campaigns, Reports
- Finance team: Enable Cash Flow, Reports
- Management: Enable all modules

## Tenant Settings

### Branding

**Company Information**
1. **Settings** → **Tenant Settings** → **Branding**
2. Update:
   - **Company Name** - Your organization name
   - **Industry** - Select from dropdown
   - **Business Model** - B2B, B2C, or Hybrid

**Visual Branding** (Coming Soon)
- Upload company logo
- Set primary brand color
- Set accent color
- Customize email templates

### Business Settings

**Industry Configuration**
- Helps AI provide relevant suggestions
- Affects default fields and workflows
- Over 30 industries supported

**Business Model**
- **B2B** - Business to Business
- **B2C** - Business to Consumer
- **Hybrid** - Both B2B and B2C

### Module Configuration

**Enable/Disable Modules**
Turn off modules your team doesn't need:
1. **Settings** → **Module Settings**
2. Toggle modules on/off
3. Disabled modules are hidden from all users
4. Can re-enable anytime

**Benefits**:
- Simplified interface
- Reduced confusion
- Better performance
- Focus on what matters

## Data Management

### Export Tenant Data

**Full Export**
1. **Settings** → **Data Management**
2. Click **"Export All Data"**
3. Select format (CSV or JSON)
4. Click **"Request Export"**
5. Receive download link via email (24-48 hours)

**Scheduled Exports** (Coming Soon)
- Weekly or monthly exports
- Automatic backups
- Email delivery

### Data Quality

**Run Quality Checks**
1. **Utilities** → **Data Quality**
2. Click **"Run Analysis"**
3. Review issues found:
   - Missing required fields
   - Duplicate records
   - Invalid data formats
   - Stale records
4. Take action:
   - Bulk update
   - Merge duplicates
   - Clean up old data

### Duplicate Management

**Find Duplicates**
1. **Utilities** → **Duplicates**
2. Select entity type (Contacts, Accounts, Leads)
3. Click **"Find Duplicates"**
4. Review matches
5. Merge or mark as not duplicate

## Reporting & Analytics

### Tenant-Wide Reports

**Access All Reports**
As admin, you can:
- View all team member activities
- See complete pipeline
- Track overall performance
- Export any report

**Standard Reports**
- Sales Performance
- Lead Conversion
- Activity Summary
- Pipeline Forecast
- Team Productivity

**Custom Reports** (Coming Soon)
- Build your own reports
- Schedule delivery
- Share with team

## Security & Compliance

### Access Monitoring

**Audit Logs**
1. **Settings** → **Audit Log**
2. View all user actions:
   - Logins/logouts
   - Record changes
   - Exports
   - Permission changes
3. Filter by user, date, action
4. Export for compliance

### Data Privacy

**GDPR Compliance**
- Users can request data export
- Data deletion requests (contact support)
- Audit trail maintained
- Secure data storage

### Password Policies

**Requirements** (System-enforced)
- Minimum 8 characters
- Mix of upper/lowercase
- At least one number
- At least one special character

**User Password Reset**
1. User clicks &quot;Forgot Password&quot;
2. System sends reset email
3. User creates new password
4. Admin cannot see passwords

## Best Practices

### User Onboarding
✓ Create user accounts before first day
✓ Send invitations with clear instructions
✓ Schedule onboarding session
✓ Grant minimal permissions initially
✓ Add modules as user gets comfortable

### Permission Management
✓ Regular access reviews (quarterly)
✓ Remove access for departed employees immediately
✓ Follow principle of least privilege
✓ Document permission changes
✓ Train users on their specific modules

### Data Governance
✓ Monthly data quality checks
✓ Regular duplicate cleanup
✓ Archive old/closed records
✓ Export backups monthly
✓ Monitor audit logs weekly

### Team Communication
✓ Announce new users to team
✓ Share updates on new features
✓ Create internal documentation
✓ Regular training sessions
✓ Encourage CRM usage

## Getting Additional Help

**For Tenant Admins:**
- Download the **Administrator Guide PDF** (see download button above)
- Contact support@ai-sha.com for assistance
- Use AI Agent for quick questions
- Request training sessions

**For System Issues:**
- Contact your system administrator (Superadmin)
- Report bugs to support
- Request new features
      `,
    },
    {
      id: "overview",
      title: "Overview",
      icon: Info,
      color: "text-purple-400",
      content: `
# Welcome to Ai-SHA CRM v3.0

**AI-SHA CRM (AI Super Hi-performing Assistant)** is an enterprise-grade customer relationship management platform with an integrated Executive AI Assistant. Built on modern cloud architecture with PostgreSQL, React, and Node.js, it provides comprehensive CRM functionality alongside intelligent automation.

## 🌟 Core Capabilities

### 🤖 Executive AI Assistant (AiSHA)
- **Natural Language CRM**: Create leads, update contacts, search records via conversational interface
- **Calendar & Task Management**: Schedule meetings, set reminders, track activities
- **Notes & Documentation**: Intelligent note-taking across all entities
- **AI Telephony**: Automated outbound calling via CallFluent and Thoughtly integrations
- **Web Research**: Fetch company data, market insights, and competitive intelligence
- **Workflow Automation**: Build and execute custom workflow templates
- **CRM Navigation**: Voice-activated navigation to any module

### 📊 Complete CRM Modules
- **Dashboard**: Real-time metrics, tenant-specific analytics, customizable widgets
- **Contacts**: Individual relationship management with activity timeline
- **Accounts**: Company/organization management with hierarchy support
- **Leads**: Lead qualification and nurturing pipeline
- **Opportunities**: Visual sales pipeline with kanban and table views
- **Activities**: Task, call, meeting, and email tracking
- **Calendar**: Integrated scheduling with timeline view
- **BizDev Sources**: Raw prospect data from multiple channels
- **Cash Flow**: Financial tracking and revenue forecasting
- **Document Processing**: Business card scanning and receipt OCR
- **Document Management**: Centralized file storage and organization
- **AI Campaigns**: Automated outreach campaigns with AI-generated content
- **Construction Projects**: Specialized module for construction staffing (industry-specific)
- **Workers**: Worker/contractor management (industry-specific)
- **Reports & Analytics**: Pre-built and custom reporting dashboards
- **Workflows**: Visual workflow builder with trigger-action automation

### 🏢 Multi-Tenancy & Security
- **UUID-Based Tenant Isolation**: Enterprise-grade data segregation
- **Row-Level Security (RLS)**: Database-enforced tenant boundaries
- **Role-Based Access Control**: SuperAdmin, Admin, Manager, Employee roles
- **Module-Level Permissions**: Granular feature access control
- **Audit Logging**: Complete activity trail for compliance

### 🔗 Integrations
- **AI Services**: OpenAI, CallFluent, Thoughtly
- **Telephony**: Twilio, SignalWire webhook adapters
- **Authentication**: Supabase Auth with JWT tokens
- **File Storage**: Supabase Storage with CDN
- **Caching**: Redis for performance optimization

## 🚀 Getting Started

### New Users
1. ✅ **Login** with your credentials (check your email for invitation)
2. ✅ **Complete your profile** in Settings → User Profile
3. ✅ **Explore the Dashboard** to see your tenant overview
4. ✅ **Try the AI Assistant** by clicking the AI icon in the sidebar
5. ✅ **Create your first contact** to start building relationships

### Sales Teams
1. ✅ **Import contacts** via CSV (bulk upload in Contacts module)
2. ✅ **Create leads** from BizDev sources or manually
3. ✅ **Qualify and convert** leads to opportunities
4. ✅ **Track activities** to log customer interactions
5. ✅ **Monitor pipeline** in Opportunities kanban view

### Managers & Admins
1. ✅ **Invite team members** via Settings → User Management
2. ✅ **Configure module access** and permissions per user
3. ✅ **Set up workflows** for common processes
4. ✅ **Review analytics** in Reports and Dashboard
5. ✅ **Monitor audit logs** for compliance and security

## 💡 What's New in v3.0

- **Enhanced Tenant System**: Migration to UUID-based tenant identifiers
- **Improved Multi-Tenancy**: Better data isolation and security
- **Braid SDK Integration**: Custom AI tool language for safer database operations
- **Workflow Builder**: Visual workflow creation with template library
- **Advanced Filtering**: Enhanced search and filter capabilities across all modules
- **Performance Optimizations**: Redis caching, query optimization, lazy loading
- **Mobile Responsive**: Improved mobile experience across all pages

## 📖 Documentation Resources

- **This Guide**: Quick reference for common tasks and features
- **User Guide PDF**: Download comprehensive guide with screenshots (button above)
- **Admin Guide**: For administrators managing users and settings
- **AI Assistant Guide**: Learn advanced AiSHA capabilities
- **Support**: Contact support@ai-sha.com or use the AI Assistant for instant help
      `,
    },
    {
      id: "contacts",
      title: "Contacts",
      icon: Users,
      color: "text-blue-400",
      content: `
# Contact Management

Contacts are individuals you interact with - potential customers, existing clients, partners, industry contacts, or any professional relationship. All contact data is automatically isolated by tenant for security and privacy.

## Creating Contacts

### Manual Creation
1. Click **"+ Add Contact"** button in the top-right corner
2. Fill in contact details:
   - **Required**: First Name, Last Name
   - **Recommended**: Email, Phone, Job Title
   - **Optional**: Department, Account (Company), Birthday, Address
3. Add custom tags for categorization (e.g., "VIP", "Newsletter", "Event Attendee")
4. Assign to a team member for follow-up
5. Add initial notes about the contact
6. Click **"Create Contact"** to save

### Quick Add
- Use the AI Assistant to create contacts via natural language
- Example: *"Create a contact named John Smith with email john@example.com"*

## Key Features

### Contact Details View
- **Activity Timeline**: Chronological view of all interactions (calls, emails, meetings, notes)
- **Linked Records**: View associated accounts, opportunities, and activities
- **Custom Fields**: Store additional information specific to your business
- **Attachments**: Upload and manage documents related to the contact
- **Engagement Score**: Automatic tracking of interaction frequency and recency

### Bulk Operations
- **CSV Import**: Upload spreadsheet of contacts (supports Excel/Google Sheets exports)
  - Automatic duplicate detection
  - Field mapping assistant
  - Preview before import
- **CSV Export**: Download all contacts or filtered subset
  - Respects current filters and search
  - Includes all custom fields
- **Bulk Actions**: Select multiple contacts to:
  - Assign to team member
  - Add tags
  - Update status
  - Delete (with confirmation)
  - Merge duplicates

### Advanced Search & Filtering
- **Quick Search**: Type to search across name, email, phone, company
- **Status Filters**: Active, Inactive, Prospect, Customer, Partner
- **Tag Filters**: Multi-select tag filtering
- **Assigned To**: Filter by owner (managers see all, employees see own)
- **Account Filter**: Show contacts from specific company
- **Date Filters**: Created date, last modified, last contact date
- **Custom Field Filters**: Filter by any custom field value

### Contact Source Tracking
- Track where contacts originated:
  - Website Form
  - Referral
  - Event
  - Cold Outreach
  - Partner
  - BizDev Source
  - Lead Conversion
  - Import

### Duplicate Management
- Automatic duplicate detection based on:
  - Email match
  - Phone number match
  - Name + company match
- Review and merge duplicates via **Utilities → Duplicate Contacts**
- Preserve activity history when merging

## Integration with Other Modules

### Link to Accounts
- Associate contacts with their company (Account)
- View all contacts from an account on the account detail page
- Automatically inherit account data (industry, size, etc.)

### Convert to Lead
- Promote a contact to a lead when there's sales opportunity
- Preserves all contact history
- Creates bidirectional link between contact and lead

### Activity Tracking
- Log calls, emails, meetings directly from contact page
- AI Assistant can log activities via voice command
- Automatic activity creation from integrations (email, calendar)

### Opportunities
- Link opportunities to contacts
- Track which contacts are involved in which deals
- Decision-maker flagging

## AI Assistant Capabilities

Ask the AI Assistant to help with contacts:
- *"Show me all VIP contacts"*
- *"Create a contact for Jane Doe at Acme Corp"*
- *"Find contacts at Microsoft"*
- *"Update John's phone number to 555-1234"*
- *"Show me contacts I haven't contacted in 30 days"*
- *"Add tag 'webinar-attendee' to contacts from last week's imports"*

## Best Practices

✓ **Always link to account** - Improves data organization and reporting
✓ **Use consistent tagging** - Create tag naming conventions for your team
✓ **Log interactions immediately** - Add notes right after calls/meetings
✓ **Assign ownership** - Ensures accountability and follow-up
✓ **Regular cleanup** - Quarterly review to mark inactive contacts
✓ **Enrich profiles** - Add LinkedIn URLs, birthdays, preferences for personalization
✓ **Track source** - Always record how you acquired the contact for ROI analysis
✓ **Merge duplicates promptly** - Weekly check via Duplicate Contacts utility
✓ **Use custom fields** - Capture industry-specific information

## Mobile Access

The Contacts module is fully responsive:
- Search and view contacts on mobile devices
- Quick-add new contacts on the go
- Log activities from mobile
- Access contact details and history
      `,
    },
    {
      id: "accounts",
      title: "Accounts",
      icon: Building2,
      color: "text-emerald-400",
      content: `
# Account Management

Accounts represent companies or organizations you do business with. In B2B scenarios, accounts are the parent record for contacts and opportunities. In B2C scenarios, accounts can represent individual customers. All account data is automatically isolated by tenant.

## Creating Accounts

### Manual Creation
1. Click **"+ Add Account"** button
2. Fill in company details:
   - **Required**: Company Name
   - **Recommended**: Industry, Website, Phone
   - **Optional**: Revenue, Employee Count, Address, Parent Account
3. Select **Account Type**:
   - Prospect - Potential customer
   - Customer - Active client
   - Partner - Business partner
   - Competitor - Competitive intelligence
   - Vendor - Supplier relationship
4. Choose **Industry** from 30+ options
5. Set **Annual Revenue** and **Employee Count** ranges
6. Assign to account owner
7. Click **"Create Account"**

### From Lead Conversion
- When converting a lead, system automatically:
  - Creates new account from company name
  - OR links to existing account if name matches
  - Preserves lead source attribution
  - Links contact and opportunity to account

### AI-Powered Creation
- Use AI Assistant: *"Create an account for Acme Corporation in the Technology industry"*
- AI can enrich with publicly available data

## Account Types

### Primary Types
- **Prospect**: Potential customer, not yet engaged
- **Customer**: Active client with revenue relationship
- **Partner**: Strategic partner, reseller, or affiliate
- **Competitor**: Track for competitive intelligence
- **Vendor**: Supplier or service provider to your company

### Status Tracking
- **Active**: Currently engaged
- **Inactive**: No recent activity
- **Churned**: Former customer, lost business
- **Dormant**: Past customer, potential re-engagement

## Industry Categories

Over **30 industry options** including:
- Technology & Software
- Healthcare & Medical
- Financial Services
- Construction & Engineering
- Manufacturing & Industrial
- Professional Services
- Retail & E-commerce
- Real Estate
- Education
- Hospitality & Tourism
- Transportation & Logistics
- Energy & Utilities
- Agriculture
- Media & Entertainment
- Non-Profit
- Government
- And many more...

## Account Hierarchy

### Parent-Child Relationships
- **Parent Account**: Corporate headquarters or main entity
- **Child Accounts**: Subsidiaries, divisions, or branch locations
- **Hierarchical Reporting**: Roll up opportunities and revenue
- **Territory Management**: Assign different reps to different locations

**Use Cases:**
- Enterprise accounts with multiple divisions
- Franchise organizations
- Holding companies with multiple brands
- Multi-location businesses

### Setting Up Hierarchy
1. Create parent account first (e.g., "Acme Corp HQ")
2. Create child accounts (e.g., "Acme Corp - West Coast Division")
3. Set **Parent Account** field on child to link
4. View hierarchy tree on parent account detail page

## Key Features

### Account Overview
- **Contact List**: All people associated with this account
- **Opportunity Pipeline**: All deals with this account
- **Activity Timeline**: Complete interaction history
- **Revenue Summary**: Total value, won deals, open pipeline
- **Key Metrics**: Win rate, average deal size, sales cycle length
- **Related Records**: Linked leads, BizDev sources

### Account Enrichment
- **Website Scraping**: AI can extract company info from website
- **Social Profiles**: LinkedIn, Twitter, Facebook links
- **News & Events**: Track company news, funding rounds, acquisitions
- **Financial Data**: Revenue estimates, growth rate, funding status
- **Technology Stack**: Tools and platforms they use (for B2B tech sales)

### Account Segmentation
- **Revenue Tiers**: Enterprise, Mid-Market, SMB, Startup
- **Geographic Region**: Americas, EMEA, APAC, etc.
- **Industry Vertical**: Technology, Healthcare, Finance, etc.
- **Customer Lifecycle**: Prospect → Customer → Champion → At-Risk → Churned
- **Strategic Value**: Key Account, Growth Account, Sustaining Account

### Bulk Operations
- **CSV Import**: Upload company lists with auto-matching
- **CSV Export**: Download account data with filters
- **Bulk Update**: Change owner, status, or custom fields
- **Bulk Tag**: Apply tags to multiple accounts
- **Merge Duplicates**: Combine duplicate account records

## Advanced Search & Filtering

- **Quick Search**: Type to search name, website, phone
- **Account Type**: Filter by Prospect, Customer, Partner, etc.
- **Industry**: Multi-select industry filtering
- **Revenue Range**: Min/max annual revenue
- **Employee Count**: Company size ranges
- **Owner**: Filter by assigned account executive
- **Status**: Active, Inactive, Churned
- **Tags**: Custom categorization
- **Has Opportunities**: Accounts with active deals
- **Pipeline Value**: Accounts with pipeline above threshold

## Integration with Other Modules

### Linked to Contacts
- **One-to-Many**: Multiple contacts per account
- **Decision Maker Tracking**: Flag key contacts
- **Org Chart**: Build account organization structure
- **Contact Roles**: Identify champions, blockers, influencers

### Linked to Opportunities
- **Account Pipeline**: View all deals with this company
- **Revenue Forecasting**: Aggregate forecast by account
- **Cross-Sell/Upsell**: Track multiple products/services
- **Account Health Score**: Based on pipeline activity and engagement

### Linked to Activities
- **Account-Level Activities**: Calls, meetings, emails with anyone at account
- **Activity Roll-Up**: See all team interactions across all contacts
- **Engagement Tracking**: Last contact date, touch frequency

### Linked to Leads
- **Lead Source**: See which leads converted to this account
- **Conversion History**: Track lead-to-account conversion rate
- **Multi-Touch Attribution**: Credit all touchpoints in conversion

## AI Assistant Capabilities

Leverage the AI for account management:
- *"Show me all Technology accounts with revenue over $1M"*
- *"Create an account for Microsoft in the Technology industry"*
- *"Find accounts with no activity in the last 90 days"*
- *"Show me all Customer accounts assigned to me"*
- *"What's the total pipeline value for Acme Corp?"*
- *"Add tag 'Target 2025' to all Enterprise accounts in California"*
- *"Find competitor accounts we should be tracking"*

## Account Health & Risk

### Health Scoring
- **Green**: High engagement, growing pipeline, regular activity
- **Yellow**: Reduced activity, stalled deals, needs attention
- **Red**: At-risk, no recent contact, declining pipeline

### Risk Indicators
- No activity in 60+ days
- Declining opportunity count
- Lost last 2+ opportunities
- Key contact departed
- Competitor mentioned in notes
- Contract renewal approaching

### Retention Strategies
- Proactive outreach campaigns
- Executive business reviews (EBRs)
- Success planning sessions
- Upsell/cross-sell opportunities
- Customer advocacy programs

## Best Practices

✓ **One account per company** - Avoid duplicates, use hierarchy for divisions
✓ **Link all contacts** - Build complete org chart
✓ **Update regularly** - Keep revenue and employee data current
✓ **Track all accounts** - Include prospects, customers, AND competitors
✓ **Use hierarchy** - For enterprise accounts with multiple locations
✓ **Enrich profiles** - Add LinkedIn, website, news, technologies
✓ **Assign clear ownership** - Each account has one primary owner
✓ **Set account tiers** - Enterprise, Mid-Market, SMB, Startup
✓ **Monitor health** - Regular account reviews, especially top accounts
✓ **Document strategies** - Use notes for account plans and strategies

## Reporting & Analytics

Access account reports via **Reports** module:
- **Account Distribution**: By industry, size, type, region
- **Account Pipeline**: Revenue by account, forecast by account
- **Account Health**: At-risk accounts, churn prediction
- **Owner Performance**: Accounts per rep, pipeline per rep
- **Account Growth**: New accounts added, conversion rates
- **Win/Loss by Account**: Success rate with different account types
      `,
    },
    {
      id: "leads",
      title: "Leads",
      icon: Star,
      color: "text-yellow-400",
      content: `
# Lead Management

Leads represent qualified prospects who show genuine interest in your products or services. In the v3.0 CRM lifecycle, leads sit between raw BizDev Sources and fully qualified Contacts/Opportunities.

## CRM Lifecycle: v3.0

BizDev Source → Promote → Lead → Qualify → Lead (Qualified) → Convert → Contact + Account + Opportunity

- **BizDev Sources**: Raw, unqualified prospect data from various channels
- **Leads**: Prospects being actively qualified and nurtured
- **Conversion**: Creates Contact, Account (if needed), and Opportunity simultaneously

## Lead Statuses

### Lead Lifecycle Stages
1. **New** - Just created or promoted from BizDev source
2. **Contacted** - Initial outreach completed (call, email, meeting)
3. **Qualified** - Meets BANT criteria, ready for conversion
4. **Nurturing** - Needs more education/time before ready to buy
5. **Unqualified** - Doesn't meet criteria (budget, authority, need, timing)
6. **Converted** - Successfully promoted to Contact + Opportunity
7. **Lost** - No longer interested or went with competitor

### Lead Priority
- **Hot** 🔥 - Immediate opportunity, high intent
- **Warm** 🌡️ - Interested, needs nurturing
- **Cold** ❄️ - Low priority, long-term nurture

## Creating Leads

### From BizDev Sources
1. Navigate to **BizDev Sources** module
2. Select promising prospect
3. Click **"Promote to Lead"** button
4. System automatically:
   - Creates lead with all available BizDev data
   - Sets initial status to "New"
   - Preserves source tracking
   - Links back to BizDev source record

### Manual Creation
1. Click **"+ Add Lead"** button
2. Fill in lead information:
   - **Required**: First Name, Last Name
   - **Recommended**: Email, Phone, Company, Job Title
   - **Optional**: Source, Industry, Revenue, Employees
3. Select **Lead Source**:
   - Website Form
   - Referral
   - Cold Call/Email
   - Event/Trade Show
   - Partner
   - Social Media
   - Advertisement
   - BizDev Source
4. Set **Priority** (Hot, Warm, Cold)
5. Set **Status** (typically "New" for manual entries)
6. Assign to sales rep
7. Click **"Create Lead"**

### AI-Powered Creation
- Use AI Assistant: *"Create a lead for Jane Smith at Acme Corp with email jane@acme.com"*
- AI can extract data from natural language descriptions
- Automatically suggests source and priority based on context

## Lead Scoring (AI-Powered)

The system automatically scores leads (0-100) based on multiple factors:

### Scoring Criteria
- **Profile Completeness** (30 points): Email, phone, company, title filled in
- **Company Fit** (25 points): Industry match, company size, revenue range
- **Engagement Level** (20 points): Response rate, website visits, email opens
- **Source Quality** (15 points): Referrals score higher than cold outreach
- **Recency** (10 points): Recently created/engaged leads score higher

### Score Interpretation
- **80-100**: Hot Lead 🔥 - Immediate follow-up required
- **60-79**: Warm Lead 🌡️ - Schedule follow-up within 48 hours
- **40-59**: Cool Lead - Add to nurture campaign
- **0-39**: Cold Lead ❄️ - Long-term nurture or disqualify

### AI Recommendations
Based on lead score, the AI suggests next actions:
- **"Follow Up Immediately"** - High-value hot lead
- **"Schedule Discovery Call"** - Qualified but needs conversation
- **"Add to Nurture Campaign"** - Not ready now, nurture for future
- **"Qualify Further"** - Missing key information
- **"Consider Disqualifying"** - Poor fit, low engagement

## Converting Leads

When a lead is qualified and ready to become a customer, convert them to create full CRM records:

### Conversion Process
1. Open lead detail page
2. Verify all information is complete and accurate
3. Click **"Convert Lead"** button
4. System creates:
   - **Contact**: Individual person record
   - **Account**: Company/organization (or links to existing)
   - **Opportunity**: Sales deal with specified value and close date
5. Enter opportunity details:
   - **Amount**: Expected deal value
   - **Close Date**: Expected close date
   - **Stage**: Initial stage (typically "Qualification")
   - **Probability**: Confidence level (typically 20-40% for new opps)
6. Click **"Complete Conversion"**

### What Gets Preserved
- ✅ Original lead ID (unique_id field) stored in all new records
- ✅ Lead source tracked through to opportunity
- ✅ All lead notes copied to contact
- ✅ Activity history linked to contact
- ✅ Tags transferred
- ✅ Custom fields migrated
- ✅ Lead status updated to "Converted"
- ✅ Link maintained for conversion tracking

### After Conversion
- Lead remains in system with "Converted" status
- Can view which contact/opportunity it created
- Preserves data for conversion rate analysis
- Used in pipeline and ROI reporting

## Key Features

### Lead Management Table
- **Search**: Type to search name, email, company, phone
- **Filter by Status**: New, Contacted, Qualified, Nurturing, etc.
- **Filter by Priority**: Hot, Warm, Cold
- **Filter by Source**: Track which channels work best
- **Filter by Assigned To**: See your leads or team's leads
- **Sort by Score**: Focus on highest-quality leads first
- **Bulk Actions**: Update, tag, or assign multiple leads

### Lead Detail View
- **AI Score Badge**: Visual indicator of lead quality
- **Activity Timeline**: All interactions with this lead
- **Next Action**: AI-recommended next step
- **Source Attribution**: How you acquired this lead
- **Engagement Metrics**: Email opens, website visits, call attempts
- **Notes Section**: Team collaboration on lead strategy
- **Related Records**: Link to BizDev source if promoted

### BizDev Source Integration
- **Bi-directional Linking**: Lead knows its source, source knows its lead(s)
- **Bulk Promotion**: Select multiple BizDev sources, promote all to leads
- **Quality Filtering**: Only promote BizDev sources above certain threshold
- **Data Inheritance**: All available fields flow from BizDev to Lead

## AI Assistant Capabilities

Leverage the AI for lead management:
- *"Show me all hot leads"*
- *"Create a lead for John Doe at Microsoft"*
- *"What leads should I follow up with today?"*
- *"Convert the lead from Acme Corp to an opportunity"*
- *"Show me leads from referrals in the last 30 days"*
- *"Update Sarah's lead status to Qualified"*
- *"Find leads in the technology industry with scores over 70"*

## Lead Nurturing

### Automated Campaigns
- Create AI-powered email nurture sequences
- Trigger campaigns based on lead score or source
- Track opens, clicks, and engagement
- Automatically update lead status based on engagement

### Manual Follow-Up
- Set reminders for follow-up calls
- Log all call attempts and outcomes
- Add detailed notes on conversations
- Track objections and interests

## Analytics & Reporting

### Lead Metrics
- **Conversion Rate**: % of leads that become opportunities
- **Time to Convert**: Average days from lead creation to conversion
- **Lead Source ROI**: Which sources generate best leads
- **Rep Performance**: Conversion rates by sales rep
- **Lead Velocity**: Speed of leads moving through stages
- **Score Distribution**: How many leads in each score range

### Lead Funnel
Track leads through stages:
1. BizDev Source pool
2. Promoted to Lead
3. Contacted
4. Qualified
5. Converted to Opportunity

## Best Practices

✓ **Qualify quickly** - Don't let leads stagnate; decision within 1 week
✓ **Use lead scoring** - Prioritize high-score leads for best ROI
✓ **Track all sources** - Essential for marketing attribution
✓ **Add notes immediately** - Document each touchpoint in real-time
✓ **Set follow-up reminders** - Never let a hot lead go cold
✓ **Convert when ready** - Don't wait for "perfect" information
✓ **Nurture cold leads** - Keep them warm with educational content
✓ **Clean up regularly** - Disqualify dead leads to keep pipeline accurate
✓ **Promote from BizDev** - Leverage BizDev sources for lead gen pipeline
✓ **Review weekly** - Sales team sync on lead status and strategy

## Integration with Other Modules

- **BizDev Sources**: Upstream feed of raw prospects
- **Contacts**: Downstream record after conversion
- **Accounts**: Created or linked during conversion
- **Opportunities**: Primary output of lead conversion
- **Activities**: Track all interactions with leads
- **AI Campaigns**: Automated outreach to warm leads
- **Reports**: Conversion funnels and source attribution
      `,
    },
    {
      id: "opportunities",
      title: "Opportunities",
      icon: Target,
      color: "text-orange-400",
      content: `
# Sales Pipeline Management

Opportunities represent potential revenue deals in your sales pipeline. Track them from initial interest through closed-won or closed-lost, with full visibility into deal progress, probability, and forecasted revenue.

## Sales Stages

The standard sales pipeline includes six stages:

1. **Prospecting** (0-20% probability) - Initial interest identified, qualifying needs
2. **Qualification** (20-40% probability) - Budget, authority, need, timeline (BANT) confirmed
3. **Proposal** (40-60% probability) - Solution presented, pricing discussed
4. **Negotiation** (60-80% probability) - Terms finalized, contracts reviewed
5. **Closed Won** (100% probability) 🎉 - Deal won! Revenue recognized
6. **Closed Lost** (0% probability) - Deal lost, reason documented for learning

## Creating Opportunities

### Manual Creation
1. Click **"+ Add Opportunity"** button
2. Fill in opportunity details:
   - **Required**: Name, Amount, Close Date, Stage
   - **Recommended**: Account, Primary Contact, Probability, Source
   - **Optional**: Description, Next Steps, Competitors, Product/Service
3. Set realistic **probability** (0-100%) based on stage
4. Add **forecast category**: Pipeline, Best Case, Commit, Closed
5. Assign to **account executive** or sales rep
6. Click **"Create Opportunity"**

### From Lead Conversion
- Convert qualified leads to opportunities automatically
- Carries forward lead data: source, notes, contact info
- Links to account and primary contact
- Preserves lead ID for tracking conversion rates

### AI-Powered Creation
- Use AI Assistant: *"Create an opportunity for Acme Corp worth $50,000 closing in Q1"*
- Assistant can create opportunity and link to existing account/contact

## View Modes

The Opportunities page offers three visualization options:

### 📊 Kanban Board (Default)
- **Drag-and-drop** opportunities between stages
- **Visual pipeline** with column totals
- **Quick-edit cards** with inline updates
- **Color-coded** by stage for at-a-glance status
- **Status summary cards** at top showing count per stage
- **Tenant-filtered** - only shows opportunities for your selected tenant

**Using Kanban:**
- Drag opportunity cards left/right to update stage
- Click card to open detail view
- Status cards show real-time counts matching the board
- Filter by account, assigned to, close date, or amount

### 📋 Table View
- **Sortable columns**: Click headers to sort
- **Bulk selection**: Select multiple opportunities for mass updates
- **Inline actions**: Quick edit, delete, or view details
- **Export ready**: Respects current filters
- **Pagination**: 25 records per page with navigation

### 🎴 Grid View
- **Card-based layout** with key metrics visible
- **Responsive** - adjusts to screen size
- **Quick filtering** with visual cards
- **Perfect for presentations** and high-level overviews

Toggle between views using the **view mode selector** in the top-right corner.

## Key Features

### Opportunity Details
- **Full activity timeline**: All calls, emails, meetings related to the deal
- **Contact roles**: Track decision makers, influencers, champions
- **Competitive intel**: Note competitors and differentiators
- **Documents**: Attach proposals, contracts, presentations
- **Custom fields**: Industry-specific data capture
- **Change history**: Audit trail of all modifications

### Revenue Forecasting
- **Weighted pipeline**: Amount × Probability = Weighted Value
- **Forecast categories**:
  - **Pipeline**: Early-stage opportunities (under 60%)
  - **Best Case**: Optimistic forecast (60-80%)
  - **Commit**: High-confidence forecast (80-99%)
  - **Closed**: Won deals (100%)
- **Trending**: Track how forecast changes over time

### Sales Metrics
Dashboard and reports show:
- **Total Pipeline Value**: Sum of all open opportunity amounts
- **Weighted Pipeline**: Sum of (amount × probability)
- **Win Rate**: Percentage of deals closed-won vs. total closed
- **Average Deal Size**: Mean opportunity value
- **Sales Velocity**: Average days from create to close
- **Conversion Rates**: By stage, source, and sales rep

### Team Collaboration
- **Assigned ownership**: Each opportunity has a primary owner
- **Team access**: Managers see all opportunities, employees see assigned
- **Activity sharing**: Team members can log activities on any opportunity
- **@ Mentions**: Tag team members in notes for collaboration
- **Pipeline reviews**: Weekly sync using kanban board

## Filtering & Search

**Advanced filters available:**
- **Stage**: Filter by single or multiple stages
- **Amount Range**: Min/max deal size
- **Close Date**: This month, this quarter, custom range
- **Account**: Show opportunities for specific company
- **Assigned To**: Filter by sales rep (or "Unassigned")
- **Probability Range**: Show only high-confidence deals
- **Source**: Track which channels drive best opportunities
- **Tags**: Custom categorization

**Quick Search:**
- Type to search across opportunity name, account name, contact name
- Fast, real-time filtering as you type

## AI Assistant Capabilities

Leverage the AI Assistant for opportunity management:
- *"Show me all opportunities over $10,000"*
- *"Create an opportunity for Acme Corp worth $25,000"*
- *"Move the Acme deal to Negotiation stage"*
- *"Show me opportunities closing this month"*
- *"What's my total pipeline value?"*
- *"show me deals stuck in Proposal for over 30 days"*
- *"Update the probability on the Microsoft deal to 75%"*

## Integration with Other Modules

### Linked to Accounts
- Every opportunity should link to an account
- View all opportunities for an account on the account detail page
- Account-level metrics: total pipeline, win rate

### Linked to Contacts
- Assign primary contact (decision maker)
- Add additional contacts with roles (Champion, Influencer, Blocker)
- Track contact engagement throughout deal cycle

### Activities
- Log calls, meetings, emails directly from opportunity
- AI automatically creates follow-up tasks based on stage
- Activity reminders tied to close date

### Documents
- Attach proposals, contracts, pricing sheets
- Version control for document iterations
- Share via secure links

## Recent Improvements (v3.0)

✨ **What's New:**
- **Status card synchronization**: Top status cards now accurately reflect kanban column counts
- **Tenant-specific filtering**: All views properly scoped to selected tenant
- **Enhanced UUID support**: Seamless handling of tenant IDs across the system
- **Performance optimizations**: Faster loading with redis caching
- **Mobile responsive**: Full kanban functionality on tablets and phones

## Best Practices

✓ **Update stages regularly** - Keep pipeline current for accurate forecasting
✓ **Set realistic close dates** - Avoid pipeline bloat from overly optimistic dates
✓ **Adjust probability** - Update as deal progresses through stages
✓ **Document next steps** - Always know what action is needed to advance the deal
✓ **Log all activities** - Maintain complete interaction history
✓ **Review pipeline weekly** - Team sync to discuss deals and remove stale opportunities
✓ **Clean up old opportunities** - Close or disqualify stale deals (90+ days no activity)
✓ **Use forecast categories** - Helps sales leadership plan resources and quotas
✓ **Link all supporting data** - Attach proposals, link contacts, note competitors
✓ **Celebrate wins** 🎉 - Move to Closed Won and analyze what worked

## Reporting

Access opportunity reports via **Reports** module:
- **Pipeline funnel**: Conversion rates by stage
- **Win/Loss analysis**: Why deals are won or lost
- **Sales rep performance**: Individual quota attainment
- **Source ROI**: Which channels generate best opportunities
- **Forecast accuracy**: Compare predicted vs. actual close dates
- **Deal age**: Identify deals stuck in stages
      `,
    },
    {
      id: "activities",
      title: "Activities",
      icon: Calendar,
      color: "text-indigo-400",
      content: `
# Activity Tracking & Task Management

Activities are the actions you take to move deals forward and build relationships. Track calls, emails, meetings, tasks, notes, and more. All activities are automatically linked to contacts, accounts, leads, or opportunities for complete relationship history.

## Activity Types

### Core Activity Types
- **Call** - Phone conversations (inbound or outbound)
- **Email** - Email correspondence
- **Meeting** - In-person or virtual meetings
- **Task** - To-do items and action items
- **Note** - Quick notes and observations
- **Demo** - Product or service demonstrations
- **Proposal** - Proposal submissions
- **Follow-Up** - Scheduled follow-up actions

### AI-Powered Activities
- **Scheduled AI Call** - Automated AI-powered outbound calls via Call Fluent or Thoughtly
- **Scheduled AI Email** - AI-generated email outreach
- **AI Campaign Activity** - Activities created by AI campaigns

### Integration Activities
- **Webhook Event** - Activities triggered by integrations (calendar sync, email sync)
- **System Generated** - Auto-created activities from workflows

## Creating Activities

### Manual Creation
1. Navigate to **Activities** module OR open a Contact/Account/Lead/Opportunity
2. Click **"+ Add Activity"** button
3. Fill in details:
   - **Required**: Activity Type, Subject/Title
   - **Required for scheduled**: Due Date & Time
   - **Recommended**: Link to Contact, Account, Lead, or Opportunity
   - **Optional**: Priority, Description, Duration, Location
4. Set **Priority**:
   - High 🔴 - Urgent, needs immediate attention
   - Medium 🟡 - Normal priority
   - Low 🟢 - Can be deferred
5. Set **Status**:
   - Planned - Not yet started
   - In Progress - Currently working on it
   - Completed - Finished
   - Cancelled - No longer needed
6. Assign to team member (defaults to you)
7. Click **"Create Activity"**

### Quick Log from Records
- From any Contact, Account, Lead, or Opportunity page
- Click **"Log Activity"** button
- Activity automatically links to that record
- Quick-log completed activities retroactively

### AI-Powered Creation
- Use AI Assistant: *"Schedule a call with John Smith tomorrow at 2pm"*
- AI creates activity, links to contact, sets reminder
- Voice command: *"Log a meeting with Acme Corp for today"*

## Activity Scheduling

### Calendar Integration

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
      `,
    },
    {
      id: "bizdev",
      title: "BizDev Sources",
      icon: Database,
      color: "text-cyan-400",
      content: `
# Business Development Sources

BizDev Sources are the **top of your sales funnel** - raw prospect data from various channels that feeds into your lead pipeline. This is where you manage large lists of potential customers before active pursuit.

## v3.0 CRM Lifecycle Position

**BizDev Source → Promote to Lead → Qualify → Convert to Contact + Account + Opportunity**

BizDev Sources sit at the very top of your pipeline, representing unqualified prospects from directories, trade shows, purchased lists, web scraping, or partner referrals.

## What are BizDev Sources?

**Staging Area for Prospects:**
- Raw company/contact data from external sources
- Unqualified prospects requiring initial vetting
- Industry-specific prospects (e.g., licensed contractors)
- Trade show attendee lists
- Directory imports
- Web-scraped company data

**Not Yet Leads Because:**
- Haven't verified contact information
- No engagement or intent shown
- May not meet qualification criteria
- Purchased lists need scrubbing
- Require compliance checks (license status)

## Creating BizDev Sources

### 1. Manual Entry
- Click "+ Add BizDev Source"
- Enter Company Name, Contact Name, Email, Phone, Industry, etc.
- Assign a "Source Type" (e.g., "Trade Show", "Web Scraping", "Purchased List")
- Add "Tags" for further categorization (e.g., "Q4 2023", "Construction", "SMB")

### 2. Bulk Import (CSV)
- Prepare a CSV file with prospect data (Company Name, Contact, Email, Phone, Address, Industry, etc.)
- Navigate to "BizDev Sources" and click "Import"
- Map your CSV columns to the system fields
- System automatically creates multiple BizDev Source records
- Ideal for large lists from directories or purchased data

### 3. API / Integration
- Integrate with external data providers or web scraping tools
- Automatically push new prospect data into BizDev Sources
- Ensures a continuous flow of fresh prospects

## Managing BizDev Sources

### Promote to Lead
- When a BizDev Source shows potential or you're ready to engage:
  1. Select the BizDev Source(s)
  2. Click "Promote to Lead"
- This action creates a new **Lead** record, carrying over all relevant data.
- The original BizDev Source record is marked as "Promoted" and can be archived.

### Bulk Operations
- **Archive**: Move old or irrelevant sources to an archive (preserves data for historical analysis).
- **Delete**: Permanently remove sources (use with caution).
- **Update Status**: Change status for multiple records (e.g., "Contacted", "Not Interested").

### Filtering & Search
- **Status**: Filter by Active, Promoted, Archived.
- **Source Type**: Filter by how the data was acquired (e.g., "Trade Show", "Web Scraping").
- **Industry**: Target specific market segments.
- **License Status**: For regulated industries, filter by Active, Suspended, Revoked, Expired, Not Required.
- **Tags**: Use custom tags for granular filtering (e.g., "High Potential", "Competitor List").
- **Quick Search**: Search by company name, contact name, or email.

## Key Features

### License Tracking (v3.0 Enhanced)
For industries requiring specific certifications or licenses, track their status directly:
- **Active** - License is current and valid.
- **Suspended** - Temporarily suspended; requires follow-up.
- **Revoked** - License permanently removed; disqualify.
- **Expired** - License has lapsed; needs renewal.
- **Not Required** - No license needed for this prospect type.
- **Compliance Alerts**: Set up automated alerts for expiring licenses.

### Source Type Categorization
- Define custom source types to understand where your raw data originates.
- Analyze which source types yield the highest quality leads and conversions.

### Tags
- Apply multiple custom tags to BizDev Sources for flexible categorization.
- Examples: "Enterprise Target", "SMB Focus", "Q1 Campaign", "Cold Outreach".

## Best Practices

✓ **Use descriptive source names** (e.g., "Construction Expo 2024", "LinkedIn Scrape Q3")
✓ **Regular cleanup** - archive or delete old/irrelevant sources to keep your pipeline clean.
✓ **Track conversion rates** - analyze which BizDev Sources convert best into Leads and Opportunities.
✓ **Don't promote prematurely** - only promote to Lead when you're ready for active engagement.
✓ **Use Tags** for additional categorization
      `,
    },
    {
      id: "workflows",
      title: "Workflows & Automation",
      icon: Zap,
      color: "text-yellow-400",
      content: `
# Workflows & Automation

Workflows automate repetitive tasks and ensure consistent processes across your team. Build custom workflows to trigger actions based on CRM events, saving time and reducing human error.

## What are Workflows?

**Workflows** are automated sequences of actions triggered by specific events in the CRM. They enable you to:
- Automate follow-up tasks when leads are created
- Send notifications when opportunities reach certain stages
- Auto-assign records based on criteria
- Update fields automatically based on conditions
- Create activities and reminders
- Send emails or SMS messages
- Execute custom logic

## Workflow Components

### 1. Triggers (When)
**What starts the workflow:**
- **Record Created** - New contact, lead, opportunity, account, or activity
- **Record Updated** - Specific field changes (e.g., opportunity stage changed)
- **Record Deleted** - Record removal (use for cleanup tasks)
- **Scheduled** - Time-based triggers (daily, weekly, monthly, specific date/time)
- **Manual** - User-initiated workflows via button click
- **Webhook** - External system triggers via API call

**Examples:**
- Trigger: "Lead created with source = 'Website'"
- Trigger: "Opportunity stage changed to 'Closed Won'"
- Trigger: "Contact not contacted in 30 days"
- Trigger: "Every Monday at 9 AM"

### 2. Conditions (If)
**Filter when the workflow runs:**
- **Field Comparisons** - Check if field equals, contains, is greater than, etc.
- **Date Comparisons** - Before, after, within last X days
- **Boolean Logic** - AND, OR, NOT conditions
- **User/Team** - Assigned to specific user or team
- **Custom Formula** - Advanced conditional logic

**Examples:**
- Condition: "If opportunity amount > $10,000"
- Condition: "If lead score >= 70 AND industry = 'Technology'"
- Condition: "If contact email domain contains 'gmail.com'"

### 3. Actions (Then)
**What happens when triggered:**
- **Create Record** - Create new task, note, opportunity
- **Update Record** - Change field values, status, owner
- **Send Email** - Automated email to contact or team member
- **Send SMS** - Text message notification
- **Assign Record** - Auto-assign to user or round-robin
- **Add Tag** - Apply tags for categorization
- **Create Activity** - Schedule call, meeting, or follow-up task
- **Call Webhook** - Trigger external system integration
- **Run AI Tool** - Execute AiSHA AI action (send AI call, generate content)
- **Wait** - Delay before next action (e.g., wait 2 days)

**Examples:**
- Action: "Create follow-up task assigned to owner, due in 3 days"
- Action: "Send email template 'Welcome Email' to new lead"
- Action: "Update lead score to 80"
- Action: "Assign to user with least open leads (round-robin)"

## Creating Workflows

### Using the Visual Workflow Builder

1. Navigate to **Workflows** module
2. Click **"+ Create Workflow"**
3. Enter workflow details:
   - **Name**: Descriptive name (e.g., "Auto-qualify hot leads")
   - **Description**: What the workflow does
   - **Active Status**: Enable/disable workflow
4. Configure **Trigger**:
   - Select trigger type (Record Created, Updated, Scheduled, etc.)
   - Choose entity (Lead, Opportunity, Contact, etc.)
   - Set trigger conditions
5. Add **Conditions** (optional):
   - Click "+ Add Condition"
   - Select field to check
   - Choose operator (equals, contains, greater than, etc.)
   - Enter comparison value
   - Use AND/OR logic for multiple conditions
6. Add **Actions**:
   - Click "+ Add Action"
   - Select action type
   - Configure action parameters
   - Chain multiple actions in sequence
7. Test workflow with sample data
8. Click **"Save \u0026 Activate"**

### Workflow Templates

Pre-built workflows you can customize:

**Lead Management:**
- **Auto-qualify hot leads** - Score leads and auto-assign to sales reps
- **Lead nurture sequence** - Automated email drip campaign for cold leads
- **Stale lead cleanup** - Archive leads with no activity in 90 days

**Opportunity Management:**
- **Deal stage notifications** - Alert manager when deal reaches Negotiation
- **Win/loss follow-up** - Create tasks based on closed opportunity outcome
- **Stalled deal alerts** - Notify owner if deal stuck in stage for 14+ days

**Activity Automation:**
- **Follow-up reminders** - Auto-create tasks after calls or meetings
- **Overdue task escalation** - Notify manager of overdue tasks
- **Meeting prep workflow** - Send reminder with account history 1 day before meeting

**Account Management:**
- **Welcome new customers** - Send onboarding email when account becomes customer
- **Quarterly business review** - Schedule QBR tasks for all enterprise accounts
- **Renewal reminders** - Alert team 90 days before contract renewal

**Contact Engagement:**
- **Birthday greetings** - Send personalized email on contact birthday
- **Engagement scoring** - Update contact score based on activity frequency
- **Re-engagement campaign** - Target contacts with no activity in 6 months

## Workflow Execution

### Execution Modes
- **Real-Time** - Actions execute immediately when triggered (default)
- **Scheduled** - Actions execute at specific time (for batch processing)
- **Queue** - Actions queued for asynchronous processing (high-volume)

### Execution Logs
- View workflow execution history
- See which records triggered workflow
- Check action results (success/failure)
- Debug failed workflows with error messages
- Monitor performance metrics

### Workflow Metrics
- **Execution Count** - How many times workflow has run
- **Success Rate** - Percentage of successful executions
- **Average Duration** - How long workflow takes to complete
- **Error Rate** - Failed executions requiring attention

## Advanced Features

### Multi-Step Workflows
Chain multiple actions with conditional branching:
- IF opportunity won
  - THEN create thank-you task
  - AND send congratulations email
  - AND update account status to "Customer"
- ELSE IF opportunity lost
  - THEN create follow-up task in 90 days
  - AND add tag "Lost - Competitor"

### Wait/Delay Actions
Introduce delays between actions:
- Wait 3 days, then send follow-up email
- Wait until specific date/time
- Wait for field value to change

### Round-Robin Assignment
Distribute records evenly across team:
- Assign new leads to sales reps in rotation
- Balance workload automatically
- Skip users who are out of office

### Webhook Integration
Connect external systems:
- Trigger workflows from external apps via API
- Call external webhooks when CRM events occur
- Sync data bidirectionally

### AI-Powered Actions
Leverage AiSHA AI in workflows:
- **AI Call** - Automated outbound calls via CallFluent/Thoughtly
- **AI Email** - Generate personalized email content
- **AI Scoring** - Use AI to score lead quality
- **AI Enrichment** - Auto-fill company data from web

## Best Practices

✓ **Start simple** - Begin with single-action workflows, add complexity gradually
✓ **Test thoroughly** - Use test records before activating on live data
✓ **Name descriptively** - "Auto-assign hot leads to Sarah" vs "Lead workflow 1"
✓ **Document logic** - Add descriptions explaining workflow purpose and conditions
✓ **Monitor regularly** - Check execution logs weekly for errors
✓ **Avoid loops** - Be careful with update triggers to prevent infinite loops
✓ **Use conditions** - Don't trigger on every update, filter to relevant changes
✓ **Version control** - Duplicate workflow before making major changes
✓ **Deactivate unused** - Turn off workflows no longer needed
✓ **Limit actions** - Keep workflows focused (5-7 actions max per workflow)

## Common Use Cases

**Sales Team Automation:**
- Auto-create demo tasks when lead status = "Qualified"
- Notify manager when deal > $50k enters pipeline
- Round-robin assign new leads to available reps
- Send automated follow-up sequence to cold leads

**Marketing Automation:**
- Tag contacts by engagement level
- Add website visitors to nurture campaigns
- Score leads based on activity and profile
- Sync with marketing automation platforms

**Customer Success:**
- Create onboarding tasks when deal closes
- Schedule quarterly check-ins for all customers
- Alert CSM when support tickets > 5 in 30 days
- Send NPS surveys 90 days after purchase

**Data Quality:**
- Auto-archive stale records
- Standardize formatting (phone numbers, addresses)
- De-duplicate records based on email/phone
- Enrich records with missing data

## AI Assistant Integration

Use the AI Assistant to help with workflows:
- *"Create a workflow to auto-assign new leads to sales team"*
- *"Show me all active workflows"*
- *"Why did the email workflow fail for contact ID 12345?"*
- *"Activate the lead nurture workflow"*
- *"Create a workflow to notify me when deals stall for 2 weeks"*

## Workflow Templates Library

Access 50+ pre-built workflow templates:
1. Navigate to **Workflows** → **Templates**
2. Browse by category or search
3. Click **"Use Template"**
4. Customize trigger, conditions, actions
5. Test and activate

Popular templates updated monthly based on user feedback and industry best practices.

## Mobile Access

- View active workflows on mobile
- Check execution logs
- Enable/disable workflows
- Trigger manual workflows via mobile
- Receive workflow notifications via push

## Security & Permissions

- **Workflow Creators** - Create and edit own workflows
- **Workflow Admins** - Manage all workflows across tenant
- **Viewers** - View workflow configs and logs (read-only)
- **Execution Permissions** - Workflows run with creator's permissions
- **Audit Trail** - All workflow changes logged for compliance
      `,
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

✓ **Record promptly** - don&apos;t wait until month-end
✓ **Use categories consistently** - easier to analyze
✓ **Upload receipts** - for tax compliance
✓ **Set up recurring** - for predictable expenses
✓ **Review monthly** - check for unusual patterns
✓ **Project ahead** - plan for upcoming expenses
      `,
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

✓ **Process immediately** - don&apos;t let cards pile up
✓ **Review AI extraction** - verify accuracy
✓ **Add notes** - context for later
✓ **Organize files** - use consistent naming
✓ **Tag appropriately** - makes finding easier
      `,
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
✓ **Act on insights** - don&apos;t just collect data
      `,
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

### CRM Roles

**Employee**
- View only assigned records
- Full access to own records
- Cannot access other employees' data
- Read/write permissions for own records
- Can create and edit assigned records

**Manager**
- View all tenant data
- Full administrative controls for tenant
- Manage team records and settings
- Access to all modules
- Export capabilities

### Requesting CRM Access

For employees without CRM access:
1. Click **"Request CRM Access"**
2. Select desired role (Employee or Manager)
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
      `,
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
- &quot;Show me all high-value opportunities&quot;
- &quot;Create a new contact for John Smith at Acme Corp&quot;
- &quot;What&apos;s my pipeline value this month?&quot;

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
      `,
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
- **n8n** - Open-source automation (external access at http://localhost:5679 in dev)
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
Send automated emails via external automation tools (n8n, Make/Integromat, Zapier):
1. Set up webhook in automation tool (n8n accessible at http://localhost:5679 in dev)
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
      `,
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
✓ **Set realistic durations** - Don&apos;t overbook
✓ **Use recurring** - For regular meetings
✓ **Update promptly** - Mark as complete when done
✓ **Review weekly** - Plan upcoming week on Fridays
✓ **Time blocking** - Group similar activities together
      `,
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
✓ **Merge duplicates promptly** - Don&apos;t let them multiply
✓ **Import carefully** - Validate data before bulk import
✓ **Regular exports** - Backup your data externally
✓ **Archive old data** - Keep system performant
✓ **Test before production** - Use test data for training
      `,
    },
    {
      id: "settings",
      title: "User Settings",
      icon: Settings,
      color: "text-gray-400",
      content: `
# User Settings & Preferences

Personalize your Aisha CRM experience and manage your user profile.

## Your Profile

### Profile Information
1. Click your profile avatar (top-right corner)
2. Select **&quot;Profile Settings&quot;**
3. Update your information:
   - **Full Name** - Your display name
   - **Email Address** - Login email (cannot be changed)
   - **Phone Number** - For softphone and notifications
   - **Profile Picture** - Upload a photo (JPG, PNG)
   - **Job Title** - Your role
   - **Department** - Your team

### Timezone & Locale

**Why it matters**: Ensures correct times for meetings, activities, and reports.

1. Navigate to **Settings** → **Preferences**
2. Set your preferences:
   - **Timezone** - Select your local timezone
   - **Date Format** - MM/DD/YYYY, DD/MM/YYYY, or YYYY-MM-DD
   - **Time Format** - 12-hour (AM/PM) or 24-hour
   - **First Day of Week** - Sunday or Monday

## Notification Preferences

### Email Notifications
Control which emails you receive:
- ✓ New lead assignments
- ✓ Opportunity stage changes
- ✓ Activity reminders
- ✓ Mentions in notes
- ✓ System announcements

### In-App Notifications
Manage real-time alerts:
- Task due reminders (15 min, 1 hour, 1 day)
- New record assignments
- Comments and mentions
- System updates

### Quiet Hours
Set times when you don&apos;t want notifications:
- Start time (e.g., 8:00 PM)
- End time (e.g., 7:00 AM)
- Weekend notifications (on/off)

## Display Preferences

### Dashboard Customization
- Choose default widgets
- Arrange widget layout
- Set default date ranges
- Customize chart colors

### List View Options
- Records per page (25, 50, 100)
- Default sort order
- Visible columns
- Compact or expanded view

### Theme (Coming Soon)
- Light mode
- Dark mode
- Auto (follow system)

## Calendar Settings

### Default View
- Month, Week, Day, or Agenda
- Start time (e.g., 8:00 AM)
- End time (e.g., 6:00 PM)
- Show weekends (on/off)

### Meeting Defaults
- Default meeting duration (15, 30, 60 minutes)
- Buffer time between meetings
- Default meeting type (Call, Video, In-person)

## Privacy & Security

### Password Management
1. Navigate to **Settings** → **Security**
2. Click **&quot;Change Password&quot;**
3. Enter current password
4. Enter new password (min 8 characters)
5. Confirm new password

**Password Requirements**:
- Minimum 8 characters
- At least one uppercase letter
- At least one number
- At least one special character (!@#$%^&*)

### Active Sessions
View and manage your active login sessions:
- Current device (this one)
- Other devices
- Last activity time
- Revoke access to specific devices

### Two-Factor Authentication (Coming Soon)
- SMS verification
- Authenticator app
- Backup codes

## Data & Privacy

### Data Export
Request a copy of your personal data:
1. **Settings** → **Privacy**
2. Click **&quot;Request Data Export&quot;**
3. Receive download link via email (24-48 hours)
4. Download ZIP file with all your data

### Account Deactivation
If you need to leave:
1. Contact your administrator
2. Admin can deactivate your account
3. Your data remains for handoff
4. Can be reactivated if needed

## Integration Preferences

### Connected Accounts
Manage your connected services:
- **Google Calendar** - Sync calendar events
- **Gmail** - Email integration
- **Outlook** - Microsoft services
- **Zapier** - Automation connections

### API Access (Power Users)
If you're integrating with external tools:
1. **Settings** → **API Keys**
2. Generate new API key
3. Set expiration date (optional)
4. Copy key (shown only once)
5. Use in your integrations

## Best Practices

✓ **Keep profile updated** - Accurate info helps team collaboration
✓ **Set realistic timezone** - Ensures correct meeting times
✓ **Configure notifications** - Balance staying informed vs overwhelmed
✓ **Regular password changes** - Every 90 days recommended
✓ **Review sessions** - Logout unused devices
✓ **Enable 2FA** - Extra security when available
      `,
    },
  ];

  // Filter sections based on search
  const filteredSections = documentationSections.filter((section) => {
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

          <div className="flex items-center gap-3">
            {/* Download PDF Button */}
            <Button
              onClick={handleDownloadPDF}
              variant="outline"
              className="bg-purple-900/30 border-purple-700/50 text-purple-300 hover:bg-purple-800/50"
            >
              <Download className="w-4 h-4 mr-2" />
              Download PDF Guide
            </Button>
            
            {/* Version Badge */}
            <Badge variant="outline" className="text-xs">
              v3.0 - Updated {new Date().toLocaleDateString()}
            </Badge>
          </div>
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
                    ? "bg-slate-700 border-purple-500"
                    : "bg-slate-800 border-slate-700 hover:border-slate-600"
                }`}
              >
                <IconComponent className={`w-6 h-6 ${section.color} mb-2`} />
                <p className="text-sm font-medium text-slate-200">
                  {section.title}
                </p>
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
                            ? "bg-purple-600 text-white"
                            : "text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        <IconComponent className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm font-medium truncate">
                          {section.title}
                        </span>
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
                {filteredSections.length === 0
                  ? (
                    <div className="text-center py-12">
                      <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-400">
                        No documentation found matching your search.
                      </p>
                    </div>
                  )
                  : (
                    <div className="prose prose-slate prose-invert max-w-none">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => (
                            <h1 className="text-3xl font-bold text-slate-100 mb-4">
                              {children}
                            </h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-2xl font-semibold text-slate-200 mt-8 mb-4">
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-xl font-semibold text-slate-200 mt-6 mb-3">
                              {children}
                            </h3>
                          ),
                          h4: ({ children }) => (
                            <h4 className="text-lg font-semibold text-slate-300 mt-4 mb-2">
                              {children}
                            </h4>
                          ),
                          p: ({ children }) => (
                            <p className="text-slate-300 leading-relaxed mb-4">
                              {children}
                            </p>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal list-inside text-slate-300 space-y-2 mb-4">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="text-slate-300">{children}</li>
                          ),
                          code: ({ inline, children }) => (
                            inline
                              ? (
                                <code className="bg-slate-700 px-2 py-1 rounded text-purple-400 text-sm">
                                  {children}
                                </code>
                              )
                              : (
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
                            <strong className="font-semibold text-slate-100">
                              {children}
                            </strong>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              className="text-purple-400 hover:text-purple-300 underline"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {filteredSections.find((s) => s.id === activeSection)
                          ?.content || ""}
                      </ReactMarkdown>
                    </div>
                  )}
              </CardContent>
            </Card>

            {/* Help Section */}
            <Alert className="mt-6 bg-blue-900/20 border-blue-700/50">
              <Info className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-300">
                <strong>Need more help?</strong>{" "}
                Contact support at support@ai-sha.com or use the AI Agent for
                instant assistance.
              </AlertDescription>
            </Alert>

            {/* Admin Guide Notice - Only show for admins */}
            {(isAdmin || isSuperadmin) && (
              <Alert className="mt-4 bg-amber-900/20 border-amber-700/50">
                <Shield className="h-4 w-4 text-amber-400" />
                <AlertDescription className="text-amber-300">
                  <strong>Tenant Administrators:</strong>{" "}
                  See the <strong>&ldquo;Tenant Administration&rdquo;</strong> section above for managing users, 
                  permissions, and tenant settings. For complete admin documentation, download the Administrator Guide PDF.
                </AlertDescription>
              </Alert>
            )}

            {/* System Admin Notice - Only for superadmins */}
            {isSuperadmin && (
              <Alert className="mt-4 bg-purple-900/20 border-purple-700/50">
                <Settings className="h-4 w-4 text-purple-400" />
                <AlertDescription className="text-purple-300">
                  <strong>System Administrators:</strong>{" "}
                  For system configuration, deployment, database management, and advanced settings, 
                  download the complete <strong>System Administrator Guide PDF</strong>.
                </AlertDescription>
              </Alert>
            )}

            {/* Last Updated Footer */}
            <div className="mt-8 pt-6 border-t border-slate-700">
              <p className="text-center text-sm text-slate-400">
                <strong>Last Updated:</strong> December 22, 2025 (v3.0)
              </p>
              <p className="text-center text-xs text-slate-500 mt-2">
                Documentation reflects the current production state of Ai-SHA CRM v3.0
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
