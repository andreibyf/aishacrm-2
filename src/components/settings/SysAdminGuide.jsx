import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Book, Cog, Shield, Users, Database, Lock } from "lucide-react";

export default function SysAdminGuide() {
  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/30 border-blue-700/50">
        <Cog className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          Comprehensive documentation for system administrators to manage and maintain the CRM.
        </AlertDescription>
      </Alert>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Book className="w-5 h-5 text-indigo-400" />
            System Administrator Guide
          </CardTitle>
          <CardDescription className="text-slate-400">
            Essential knowledge for CRM administration
          </CardDescription>
        </CardHeader>
        <CardContent className="prose prose-invert prose-slate max-w-none">
          <div className="space-y-6 text-slate-300">
            
            <h2 className="text-slate-100 text-xl font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              1. Understanding Roles and Permissions
            </h2>
            
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-4">
              <h3 className="text-slate-200 text-lg font-medium">Two-Tier Role System</h3>
              
              <div className="space-y-3">
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="text-blue-400 font-semibold">Layer 1: Base44 Platform Role</h4>
                  <p className="text-sm mt-2">
                    The Base44 platform provides two built-in roles:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                    <li><strong className="text-blue-300">admin</strong>: Platform administrators (typically the app owner/developer). Full access to all data across all tenants, all settings, and system configuration.</li>
                    <li><strong className="text-blue-300">user</strong>: Standard Base44 users. This is the default role for anyone logging into the app who is not a platform admin.</li>
                  </ul>
                  <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-2 mt-2">
                    <p className="text-yellow-300 text-xs">
                      <strong>Important:</strong> The Base44 platform role cannot be "Power User" or "Superadmin" - these do not exist in Base44. Only <code>admin</code> and <code>user</code> are valid.
                    </p>
                  </div>
                </div>

                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="text-green-400 font-semibold">Layer 2: CRM Application Employee Role</h4>
                  <p className="text-sm mt-2">
                    The CRM application uses a custom <code>employee_role</code> field to define internal access levels:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                    <li><strong className="text-green-300">manager</strong>: Team leads, supervisors, or department heads. Can view and edit <strong>all</strong> CRM data within their assigned tenant (full tenant visibility).</li>
                    <li><strong className="text-green-300">employee</strong>: Individual contributors (sales reps, CSRs). Can only view and edit records they created or that are assigned to them (restricted to own records).</li>
                  </ul>
                  <div className="bg-green-900/20 border border-green-700/50 rounded p-2 mt-2">
                    <p className="text-green-300 text-xs">
                      <strong>Best Practice:</strong> Use <code>employee_role</code> to control CRM data visibility. Most users will be Base44 <code>user</code>s with either <code>manager</code> or <code>employee</code> as their employee_role.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <h3 className="text-slate-200 text-lg font-medium mt-6">1.1 How Permissions are Evaluated</h3>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
              <p className="text-sm">
                When a user attempts to access CRM data (Leads, Contacts, Accounts, Opportunities, Activities):
              </p>
              <ol className="list-decimal list-inside space-y-2 text-sm mt-3">
                <li><strong>If user.role is <code>admin</code>:</strong> Full access to all data across all tenants. No restrictions.</li>
                <li><strong>If user.role is <code>user</code>:</strong> Check their <code>employee_role</code>:
                  <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                    <li><strong>If employee_role is <code>manager</code>:</strong> Can see all records within their <code>tenant_id</code>.</li>
                    <li><strong>If employee_role is <code>employee</code>:</strong> Can only see records where <code>created_by</code> or <code>assigned_to</code> equals their email, within their <code>tenant_id</code>.</li>
                  </ul>
                </li>
              </ol>
            </div>

            <h3 className="text-slate-200 text-lg font-medium mt-6">1.2 Row-Level Security (RLS)</h3>
            <p>
              RLS rules are defined on each entity (Lead, Contact, Account, Opportunity, Activity, Employee) and enforce these permissions at the database level. This ensures:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Managers see tenant-wide data in dashboards, reports, and lists</li>
              <li>Employees only see their assigned data, even when viewing shared dashboards</li>
              <li>Data isolation is automatic and cannot be bypassed through the UI</li>
            </ul>

            <h2 className="text-slate-100 text-xl font-semibold mt-8 flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              2. User Management
            </h2>
            
            <h3 className="text-slate-200 text-lg font-medium">2.1 Creating and Inviting Users</h3>
            <p>
              To add new users to the CRM:
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Navigate to <strong>Settings &gt; User Management</strong></li>
              <li>Click <strong>"Invite User"</strong></li>
              <li>Fill in:
                <ul className="list-disc list-inside ml-6 mt-1">
                  <li><strong>Email:</strong> The user's work email (used for login)</li>
                  <li><strong>Full Name:</strong> Display name</li>
                  <li><strong>Client:</strong> Assign them to a tenant organization</li>
                  <li><strong>Employee Role:</strong> Choose <code>Manager</code> or <code>Employee</code></li>
                </ul>
              </li>
              <li>The user will receive an invitation email to set up their account</li>
            </ol>
            <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-3 mt-2">
              <p className="text-orange-300 text-sm">
                <strong>Note:</strong> New users are automatically assigned Base44 role <code>user</code>. Only the app owner should have Base44 role <code>admin</code>.
              </p>
            </div>

            <h3 className="text-slate-200 text-lg font-medium mt-6">2.2 Editing User Permissions</h3>
            <p>
              To modify an existing user's access:
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Go to <strong>Settings &gt; User Management</strong></li>
              <li>Click the <strong>Edit</strong> button (pencil icon) next to the user</li>
              <li>Adjust their settings:
                <ul className="list-disc list-inside ml-6 mt-1">
                  <li><strong>Employee Role:</strong> Change between Manager and Employee</li>
                  <li><strong>Access Level:</strong> Read or Read/Write</li>
                  <li><strong>CRM Access:</strong> Toggle whether they can access the CRM at all</li>
                  <li><strong>Navigation Permissions:</strong> Control which menu items they see</li>
                </ul>
              </li>
              <li>Click <strong>Save</strong> to apply changes</li>
            </ol>

            <h3 className="text-slate-200 text-lg font-medium mt-6">2.3 Deactivating Users</h3>
            <p>
              To temporarily disable a user's access without deleting their account:
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Edit the user in <strong>User Management</strong></li>
              <li>Toggle <strong>"Active"</strong> to OFF</li>
              <li>The user will no longer be able to log in, but their data and history remain intact</li>
            </ol>

            <h2 className="text-slate-100 text-xl font-semibold mt-8 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              3. Tenant (Client) Management
            </h2>
            
            <h3 className="text-slate-200 text-lg font-medium">3.1 Creating Tenants</h3>
            <p>
              Tenants represent separate client organizations within your CRM. To create a new tenant:
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>Navigate to <strong>Settings &gt; Client Management</strong> (admins only)</li>
              <li>Click <strong>"Add Client"</strong></li>
              <li>Provide:
                <ul className="list-disc list-inside ml-6 mt-1">
                  <li>Client Name</li>
                  <li>Industry</li>
                  <li>Branding settings (logo, colors)</li>
                </ul>
              </li>
              <li>Each tenant gets isolated data storage and custom branding</li>
            </ol>

            <h3 className="text-slate-200 text-lg font-medium mt-6">3.2 Assigning Users to Tenants</h3>
            <p>
              Users must be assigned to a tenant to access CRM data:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Set the <strong>Client</strong> field when inviting or editing a user</li>
              <li>Users with <code>employee_role: manager</code> will see all data for that tenant</li>
              <li>Users with <code>employee_role: employee</code> will see only their assigned records within that tenant</li>
            </ul>

            <h2 className="text-slate-100 text-xl font-semibold mt-8 flex items-center gap-2">
              <Lock className="w-5 h-5 text-red-400" />
              4. Security Best Practices
            </h2>
            
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Principle of Least Privilege:</strong> Assign users the minimum role needed for their job. Most users should be <code>employee</code>, not <code>manager</code>.</li>
              <li><strong>Regular Access Reviews:</strong> Periodically review user permissions in Settings &gt; User Management to ensure they're still appropriate.</li>
              <li><strong>Audit Logging:</strong> Check Settings &gt; Diagnostics &gt; QA Test Runner and monitor the Audit Log for unusual activity.</li>
              <li><strong>Tenant Isolation:</strong> Never assign users to multiple tenants unless they genuinely need cross-client access (rare).</li>
              <li><strong>Deactivate, Don't Delete:</strong> When users leave, deactivate their accounts instead of deleting them to preserve data integrity and audit trails.</li>
            </ul>

            <h2 className="text-slate-100 text-xl font-semibold mt-8">5. Common Administrative Tasks</h2>
            
            <h3 className="text-slate-200 text-lg font-medium">5.1 Bulk User Updates</h3>
            <p className="text-sm">
              Currently, bulk user updates must be done individually through the User Management interface. For large changes, contact support or use the API.
            </p>

            <h3 className="text-slate-200 text-lg font-medium mt-4">5.2 Data Cleanup</h3>
            <p className="text-sm">
              Use <strong>Settings &gt; Diagnostics &gt; Test Data Manager</strong> to remove test records. Always back up data before cleanup operations.
            </p>

            <h3 className="text-slate-200 text-lg font-medium mt-4">5.3 Performance Monitoring</h3>
            <p className="text-sm">
              Monitor system health via <strong>Settings &gt; Performance</strong> and <strong>Integration Usage</strong> tabs.
            </p>

            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 mt-8">
              <p className="text-blue-300 text-sm">
                <strong>Need Help?</strong> Contact your system administrator or refer to the base44 platform documentation for additional support.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}