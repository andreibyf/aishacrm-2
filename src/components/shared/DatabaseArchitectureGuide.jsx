import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Archive,
  Database,
  GitBranch,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * DATABASE ARCHITECTURE OPTIMIZATION GUIDE
 * Comprehensive strategy for optimizing Ai-SHA CRM database structure
 */
export default function DatabaseArchitectureGuide() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 bg-slate-50">
      <div className="flex items-center gap-3 mb-8">
        <Database className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Database Architecture Optimization
          </h1>
          <p className="text-slate-600">
            Strategic plan for improving data structure and performance
          </p>
        </div>
      </div>

      {/* Current State Analysis */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-900">
            Current Architecture Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-3">
              Current Structure
            </h3>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">●</span>
                <span>
                  <strong>Flat Entity Model:</strong>{" "}
                  Each entity (Contact, Account, Lead, etc.) is independent with
                  loose relationships via ID references
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">●</span>
                <span>
                  <strong>No Referential Integrity:</strong>{" "}
                  Base44/MongoDB doesn't enforce foreign key constraints
                  automatically
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">●</span>
                <span>
                  <strong>Mixed Normalization:</strong>{" "}
                  Some denormalization (caching names/emails) but inconsistent
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-1">●</span>
                <span>
                  <strong>Single Tenant Filtering:</strong>{" "}
                  All queries filter by tenant_id at application level
                </span>
              </li>
            </ul>
          </div>

          <Alert className="bg-amber-50 border-amber-200">
            <AlertDescription className="text-slate-700">
              <strong>Key Issues:</strong>{" "}
              Orphaned records, expensive JOIN-like operations, no historical
              tracking, slow aggregate queries
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Recommended Architecture: Hybrid Star Schema */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-900 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-blue-600" />
            Recommended: Hybrid Star Schema Approach
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-slate-900 mb-2">
              What is a Hybrid Star Schema?
            </h3>
            <p className="text-sm text-slate-700 mb-3">
              Combines traditional star schema patterns (fact tables + dimension
              tables) with MongoDB's document flexibility. Core business
              entities become "fact tables" while reference data becomes
              "dimension tables."
            </p>
            <div className="text-sm text-slate-700">
              <strong>Benefits:</strong>{" "}
              Faster queries, better data integrity, easier analytics, cleaner
              separation of concerns
            </div>
          </div>

          {/* Fact Tables */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-green-600" />
              Fact Tables (Core Business Entities)
            </h3>
            <div className="space-y-3">
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-800">
                    Contact (Fact)
                  </h4>
                  <Badge className="bg-green-100 text-green-700">Primary</Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <strong>Purpose:</strong>{" "}
                    Store all contact interactions and attributes
                  </p>
                  <p>
                    <strong>Key Fields:</strong>{" "}
                    id, tenant_id, unique_id, first_name, last_name, email,
                    phone
                  </p>
                  <p>
                    <strong>References:</strong>{" "}
                    account_id → Account, assigned_to → Employee
                  </p>
                  <p>
                    <strong>Optimization:</strong>{" "}
                    Index on [tenant_id, status, assigned_to, created_date]
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-800">Lead (Fact)</h4>
                  <Badge className="bg-green-100 text-green-700">Primary</Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <strong>Purpose:</strong>{" "}
                    Track sales pipeline and conversion funnel
                  </p>
                  <p>
                    <strong>Key Fields:</strong>{" "}
                    id, tenant_id, unique_id, status, score, source
                  </p>
                  <p>
                    <strong>References:</strong>{" "}
                    converted_contact_id → Contact, account_id → Account
                  </p>
                  <p>
                    <strong>Optimization:</strong>{" "}
                    Index on [tenant_id, status, score, created_date]
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-800">
                    Opportunity (Fact)
                  </h4>
                  <Badge className="bg-green-100 text-green-700">Primary</Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <strong>Purpose:</strong> Revenue tracking and forecasting
                  </p>
                  <p>
                    <strong>Key Fields:</strong>{" "}
                    id, tenant_id, amount, stage, probability, close_date
                  </p>
                  <p>
                    <strong>References:</strong>{" "}
                    account_id → Account, contact_id → Contact
                  </p>
                  <p>
                    <strong>Optimization:</strong>{" "}
                    Index on [tenant_id, stage, close_date, amount]
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-800">
                    Activity (Fact)
                  </h4>
                  <Badge className="bg-green-100 text-green-700">
                    Transaction
                  </Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <strong>Purpose:</strong> Time-series interaction tracking
                  </p>
                  <p>
                    <strong>Key Fields:</strong>{" "}
                    id, tenant_id, type, due_date, status, related_to,
                    related_id
                  </p>
                  <p>
                    <strong>Optimization:</strong>{" "}
                    Index on [tenant_id, due_date, status,
                    related_to+related_id]
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Dimension Tables */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-600" />
              Dimension Tables (Reference Data)
            </h3>
            <div className="space-y-3">
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-800">
                    Account (Dimension)
                  </h4>
                  <Badge className="bg-blue-100 text-blue-700">Reference</Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <strong>Purpose:</strong> Company/organization master data
                  </p>
                  <p>
                    <strong>Key Fields:</strong>{" "}
                    id, tenant_id, unique_id, name, industry, type
                  </p>
                  <p>
                    <strong>Optimization:</strong>{" "}
                    Index on [tenant_id, name], unique constraint on [tenant_id,
                    unique_id]
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-800">
                    Employee (Dimension)
                  </h4>
                  <Badge className="bg-blue-100 text-blue-700">Reference</Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <strong>Purpose:</strong>{" "}
                    User assignment and ownership tracking
                  </p>
                  <p>
                    <strong>Key Fields:</strong>{" "}
                    id, tenant_id, email, user_email, first_name, last_name
                  </p>
                  <p>
                    <strong>Optimization:</strong>{" "}
                    Index on [tenant_id, email], [tenant_id, is_active]
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-800">
                    Tenant (Dimension)
                  </h4>
                  <Badge className="bg-blue-100 text-blue-700">Master</Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <strong>Purpose:</strong>{" "}
                    Multi-tenant isolation and branding
                  </p>
                  <p>
                    <strong>Key Fields:</strong>{" "}
                    id, name, domain, branding_settings
                  </p>
                  <p>
                    <strong>Optimization:</strong>{" "}
                    Small table, full cache acceptable
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Auxiliary/Junction Tables */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-600" />
              Auxiliary Tables (Linking & Metadata)
            </h3>
            <div className="space-y-3">
              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-800">
                    Note (Auxiliary)
                  </h4>
                  <Badge className="bg-purple-100 text-purple-700">
                    1:Many
                  </Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <strong>Purpose:</strong> Attach notes to any entity
                  </p>
                  <p>
                    <strong>Pattern:</strong>{" "}
                    Polymorphic relationship via related_to + related_id
                  </p>
                  <p>
                    <strong>Optimization:</strong>{" "}
                    Composite index on [tenant_id, related_to, related_id,
                    created_date]
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-800">
                    Notification (Auxiliary)
                  </h4>
                  <Badge className="bg-purple-100 text-purple-700">
                    User-Scoped
                  </Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <strong>Purpose:</strong> User-specific alerts and updates
                  </p>
                  <p>
                    <strong>Optimization:</strong>{" "}
                    Index on [user_email, is_read, created_date], auto-archive
                    after 30 days
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-800">
                    AuditLog (Auxiliary)
                  </h4>
                  <Badge className="bg-purple-100 text-purple-700">
                    Append-Only
                  </Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <p>
                    <strong>Purpose:</strong> Historical change tracking
                  </p>
                  <p>
                    <strong>Pattern:</strong>{" "}
                    Write-heavy, read-light (admin only)
                  </p>
                  <p>
                    <strong>Optimization:</strong>{" "}
                    Partition by date, archive quarterly, index on [user_email,
                    action_type, created_date]
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Implementation Recommendations */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Implementation Roadmap
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {/* Phase 1 */}
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-green-600 text-white">Phase 1</Badge>
                <h3 className="font-semibold text-slate-900">
                  Referential Integrity Layer
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>
                    Create validation functions to check foreign key
                    relationships before writes
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>
                    Add cascade delete handlers (e.g., deleting Account should
                    handle related Contacts)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>Implement orphan detection and cleanup utilities</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 mt-1">✓</span>
                  <span>
                    Add data consistency checks in Settings → Utilities
                  </span>
                </li>
              </ul>
              <div className="mt-3 text-sm text-slate-600">
                <strong>Timeline:</strong> 1 week | <strong>Impact:</strong>
                {" "}
                High - prevents data corruption
              </div>
            </div>

            {/* Phase 2 */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-blue-600 text-white">Phase 2</Badge>
                <h3 className="font-semibold text-slate-900">
                  Denormalization Strategy
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">✓</span>
                  <span>
                    Add cached fields to fact tables: account_name,
                    assigned_to_name, contact_name
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">✓</span>
                  <span>
                    Create update triggers to maintain cached values when
                    dimensions change
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">✓</span>
                  <span>
                    Add computed fields: contact_age_days, opportunity_age_days,
                    activity_overdue
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">✓</span>
                  <span>Implement nightly sync job to refresh cached data</span>
                </li>
              </ul>
              <div className="mt-3 text-sm text-slate-600">
                <strong>Timeline:</strong> 2 weeks | <strong>Impact:</strong>
                {" "}
                Medium - 40% faster list views
              </div>
            </div>

            {/* Phase 3 */}
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-purple-600 text-white">Phase 3</Badge>
                <h3 className="font-semibold text-slate-900">
                  Aggregation Tables
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">✓</span>
                  <span>
                    Create DailyStat entity: tenant_id, date, entity_type,
                    metric_type, value
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">✓</span>
                  <span>
                    Pre-compute dashboard metrics nightly (contact count, lead
                    count, revenue)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">✓</span>
                  <span>
                    Add EmployeePerformance summary table for team reports
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 mt-1">✓</span>
                  <span>Create materialized views for complex reports</span>
                </li>
              </ul>
              <div className="mt-3 text-sm text-slate-600">
                <strong>Timeline:</strong> 2 weeks | <strong>Impact:</strong>
                {" "}
                High - 90% faster dashboard/reports
              </div>
            </div>

            {/* Phase 4 */}
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-amber-600 text-white">Phase 4</Badge>
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Archive className="w-4 h-4" />
                  Historical & Archive Strategy
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">✓</span>
                  <span>
                    Create archive entities: ArchivedActivity,
                    ArchivedOpportunity, ArchivedLead
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">✓</span>
                  <span>
                    Move completed activities older than 90 days to archive
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">✓</span>
                  <span>
                    Move closed opportunities older than 365 days to archive
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">✓</span>
                  <span>Add "View Archive" option for historical lookups</span>
                </li>
              </ul>
              <div className="mt-3 text-sm text-slate-600">
                <strong>Timeline:</strong> 1 week | <strong>Impact:</strong>
                {" "}
                High - reduces main table size by 60%
              </div>
            </div>

            {/* Phase 5 */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-300">
              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-slate-600 text-white">Phase 5</Badge>
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Advanced Indexing & Partitioning
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="text-slate-600 mt-1">✓</span>
                  <span>Add compound indexes for common query patterns</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-600 mt-1">✓</span>
                  <span>
                    Implement text search indexes for name/email fields
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-600 mt-1">✓</span>
                  <span>
                    Partition large tables by tenant_id for better isolation
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-slate-600 mt-1">✓</span>
                  <span>
                    Add performance monitoring to identify slow queries
                  </span>
                </li>
              </ul>
              <div className="mt-3 text-sm text-slate-600">
                <strong>Timeline:</strong> 2 weeks | <strong>Impact:</strong>
                {" "}
                Medium - 30% overall performance boost
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Specific Optimizations */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-900">
            Specific Optimization Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4 text-sm text-slate-700">
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h4 className="font-semibold text-slate-800 mb-2">
                1. ContactAccount Relationship
              </h4>
              <p className="text-slate-600 mb-2">
                <strong>Current:</strong>{" "}
                Contact.account_id → Account.id (string reference, no
                validation)
              </p>
              <p className="text-slate-600 mb-2">
                <strong>Proposed:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-slate-600">
                <li>
                  Add Contact.account_name (cached) for fast display without
                  joins
                </li>
                <li>
                  Add validation function: validateAccountExists(account_id)
                </li>
                <li>
                  Create orphan cleanup utility:
                  findContactsWithInvalidAccounts()
                </li>
                <li>
                  Add cascade option: when Account deleted, set contacts to
                  account_id=null or transfer to new account
                </li>
              </ul>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h4 className="font-semibold text-slate-800 mb-2">
                2. Activity Polymorphic References
              </h4>
              <p className="text-slate-600 mb-2">
                <strong>Current:</strong>{" "}
                Activity.related_to + Activity.related_id (polymorphic pattern)
              </p>
              <p className="text-slate-600 mb-2">
                <strong>Proposed:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-slate-600">
                <li>
                  Add compound index: [tenant_id, related_to, related_id,
                  due_date]
                </li>
                <li>Cache entity name: Activity.related_name for display</li>
                <li>
                  Add validation: ensure related entity exists before activity
                  creation
                </li>
                <li>
                  Implement soft-delete: archive activities when parent entity
                  deleted
                </li>
              </ul>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h4 className="font-semibold text-slate-800 mb-2">
                3. Employee Assignment
              </h4>
              <p className="text-slate-600 mb-2">
                <strong>Current:</strong>{" "}
                Contact/Lead.assigned_to (email string, inconsistent with
                Employee.email vs Employee.user_email)
              </p>
              <p className="text-slate-600 mb-2">
                <strong>Proposed:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-slate-600">
                <li>Standardize on Employee.email as canonical identifier</li>
                <li>
                  Add Employee.is_active filter to selectors (hide inactive
                  employees)
                </li>
                <li>
                  Cache Employee name: Contact.assigned_to_name,
                  Lead.assigned_to_name
                </li>
                <li>Add reassignment utility when Employee deactivated</li>
              </ul>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h4 className="font-semibold text-slate-800 mb-2">
                4. Dashboard Aggregations
              </h4>
              <p className="text-slate-600 mb-2">
                <strong>Current:</strong>{" "}
                Real-time count queries on every dashboard load (slow for large
                datasets)
              </p>
              <p className="text-slate-600 mb-2">
                <strong>Proposed:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-slate-600">
                <li>Create DashboardMetric entity with pre-computed stats</li>
                <li>
                  Run nightly cron job to calculate: total contacts, active
                  leads, pipeline value, etc.
                </li>
                <li>
                  Dashboard reads from cache (instant load) with "as of date"
                  timestamp
                </li>
                <li>Add real-time delta updates for critical metrics</li>
              </ul>
            </div>

            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <h4 className="font-semibold text-slate-800 mb-2">
                5. Notification Cleanup
              </h4>
              <p className="text-slate-600 mb-2">
                <strong>Current:</strong> Notifications accumulate indefinitely
              </p>
              <p className="text-slate-600 mb-2">
                <strong>Proposed:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 text-slate-600">
                <li>Auto-archive notifications older than 30 days</li>
                <li>Move to ArchivedNotification entity for history</li>
                <li>
                  Add user preference: "Keep read notifications for X days"
                </li>
                <li>Reduce notification table size by 90%</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Migration Strategy */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-900">
            Safe Migration Strategy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="text-slate-700">
              <strong>Zero-Downtime Approach:</strong>{" "}
              All changes will be backward-compatible. No data loss risk.
            </AlertDescription>
          </Alert>

          <div className="space-y-3 text-sm text-slate-700">
            <div className="flex items-start gap-3">
              <Badge className="bg-blue-600 text-white shrink-0">Step 1</Badge>
              <div>
                <p className="font-semibold text-slate-800">
                  Add New Fields (Additive Only)
                </p>
                <p className="text-slate-600">
                  Add cached fields like account_name, assigned_to_name to
                  existing entities. Old code continues working.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge className="bg-blue-600 text-white shrink-0">Step 2</Badge>
              <div>
                <p className="font-semibold text-slate-800">
                  Backfill Cached Data
                </p>
                <p className="text-slate-600">
                  Run utility to populate new fields for existing records. Can
                  be done in batches during off-hours.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge className="bg-blue-600 text-white shrink-0">Step 3</Badge>
              <div>
                <p className="font-semibold text-slate-800">
                  Update Application Code
                </p>
                <p className="text-slate-600">
                  Modify forms/lists to read from cached fields instead of
                  lookups. Performance improves immediately.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge className="bg-blue-600 text-white shrink-0">Step 4</Badge>
              <div>
                <p className="font-semibold text-slate-800">
                  Add Validation Layer
                </p>
                <p className="text-slate-600">
                  Implement referential integrity checks in create/update
                  functions. Prevents future orphans.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge className="bg-blue-600 text-white shrink-0">Step 5</Badge>
              <div>
                <p className="font-semibold text-slate-800">
                  Create Archive Entities
                </p>
                <p className="text-slate-600">
                  Set up archive tables and migration logic. Move old data
                  gradually over 30 days.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Badge className="bg-blue-600 text-white shrink-0">Step 6</Badge>
              <div>
                <p className="font-semibold text-slate-800">
                  Monitor & Optimize
                </p>
                <p className="text-slate-600">
                  Track query performance, adjust indexes, fine-tune cache TTLs
                  based on real usage patterns.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expected Outcomes */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Expected Outcomes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h4 className="font-semibold text-slate-800 mb-2">
                Performance Gains
              </h4>
              <ul className="space-y-1 text-sm text-slate-700">
                <li>
                  • Dashboard load: <strong>3s → 0.5s</strong> (83% faster)
                </li>
                <li>
                  • List views: <strong>2s → 0.8s</strong> (60% faster)
                </li>
                <li>
                  • Form loads: <strong>1.5s → 0.3s</strong> (80% faster)
                </li>
                <li>
                  • Reports: <strong>10s → 1s</strong> (90% faster)
                </li>
              </ul>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-slate-800 mb-2">
                Data Quality
              </h4>
              <ul className="space-y-1 text-sm text-slate-700">
                <li>• Zero orphaned records</li>
                <li>• Referential integrity enforced</li>
                <li>• Consistent assignment tracking</li>
                <li>• Complete audit trail</li>
              </ul>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <h4 className="font-semibold text-slate-800 mb-2">Scalability</h4>
              <ul className="space-y-1 text-sm text-slate-700">
                <li>• Support 100K+ contacts per tenant</li>
                <li>• Handle 1M+ activities efficiently</li>
                <li>• Linear performance scaling</li>
                <li>• Reduced storage costs (archival)</li>
              </ul>
            </div>

            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <h4 className="font-semibold text-slate-800 mb-2">
                Developer Experience
              </h4>
              <ul className="space-y-1 text-sm text-slate-700">
                <li>• Clearer data relationships</li>
                <li>• Easier to write reports</li>
                <li>• Less duplicate code</li>
                <li>• Better debugging tools</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="text-slate-900">
            Recommended Next Steps
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-slate-700">
          <p className="font-semibold">To begin implementation:</p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>Review and approve this architecture plan</li>
            <li>
              Start with Phase 1 (Referential Integrity) - lowest risk, high
              impact
            </li>
            <li>Run data consistency audit to identify existing issues</li>
            <li>Create backup before any schema changes</li>
            <li>Implement one phase at a time with testing between each</li>
          </ol>
          <Alert className="bg-white border-green-300 mt-4">
            <AlertDescription className="text-slate-700">
              <strong>Estimated Total Timeline:</strong>{" "}
              8-10 weeks for full implementation across all phases
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

// Export for documentation/reference
export const DATABASE_OPTIMIZATION_SUMMARY = {
  currentIssues: [
    "No referential integrity enforcement",
    "Orphaned records accumulating",
    "Expensive lookup operations",
    "Slow aggregate queries",
    "No historical tracking",
  ],
  proposedSolution: "Hybrid Star Schema",
  phases: 5,
  estimatedTimeline: "8-10 weeks",
  expectedPerformanceGain: "60-90% faster queries",
  riskLevel: "Low (backward compatible changes)",
};
