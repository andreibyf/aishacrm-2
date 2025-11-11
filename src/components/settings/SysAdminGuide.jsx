import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Book, Cog, Shield, Users, Database, Lock, Activity, Eye, FileText } from "lucide-react";

export default function SysAdminGuide() {
  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/30 border-blue-700/50">
        <Cog className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          Comprehensive guide for administrators managing the Aisha CRM independent backend system.
        </AlertDescription>
      </Alert>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Book className="w-5 h-5 text-indigo-400" />
            System Administrator Guide
          </CardTitle>
          <CardDescription className="text-slate-400">
            Essential knowledge for CRM administration and maintenance
          </CardDescription>
        </CardHeader>
        <CardContent className="prose prose-invert prose-slate max-w-none">
          <div className="space-y-6 text-slate-300">
            
            <h2 className="text-slate-100 text-xl font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              1. System Architecture Overview
            </h2>
            
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-4">
              <h3 className="text-slate-200 text-lg font-medium">Independent Backend System</h3>
              
              <p className="text-sm">
                Aisha CRM operates with a fully independent architecture:
              </p>
              
              <div className="space-y-3">
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="text-blue-400 font-semibold">Frontend (Port 4000)</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                    <li>React + Vite application</li>
                    <li>Domain-organized components (accounts, activities, ai, contacts, leads, opportunities)</li>
                    <li>API clients with automatic Ai-SHA → local backend failover</li>
                    <li>Browser-side functions in <code>src/functions/</code> for offline capability</li>
                  </ul>
                </div>

                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="text-green-400 font-semibold">Backend (Port 4001)</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                    <li>Node.js Express server in <code>backend/server.js</code></li>
                    <li>197 API endpoints across 26 categories</li>
                    <li>PostgreSQL database via Supabase</li>
                    <li>Routes in <code>backend/routes/</code></li>
                    <li>Health monitoring at <code>http://localhost:4001/health</code></li>
                  </ul>
                </div>

                <div className="border-l-4 border-yellow-500 pl-4">
                  <h4 className="text-yellow-400 font-semibold">Database</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                    <li>Supabase PostgreSQL cloud instance</li>
                    <li>Migrations in <code>backend/migrations/</code></li>
                    <li>Row-Level Security (RLS) enabled for data isolation</li>
                    <li>Critical: Use <code>tenant_id</code> (not UUID) for filtering</li>
                  </ul>
                </div>
              </div>
            </div>

            <h2 className="text-slate-100 text-xl font-semibold mt-8 flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              2. User Roles & Permissions
            </h2>

            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 space-y-4">
              <h3 className="text-slate-200 text-lg font-medium">Role System</h3>
              
              <p className="text-sm">
                The CRM uses a simple role-based access control system:
              </p>

              <div className="space-y-3">
                <div className="border-l-4 border-purple-500 pl-4">
                  <h4 className="text-purple-400 font-semibold">Admin</h4>
                  <p className="text-sm mt-2">
                    Full system access including:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm mt-1">
                    <li>All CRM data across all tenants</li>
                    <li>Settings and configuration management</li>
                    <li>User and tenant management</li>
                    <li>Diagnostics and health monitoring</li>
                    <li>API endpoint configuration</li>
                  </ul>
                </div>

                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="text-blue-400 font-semibold">Manager</h4>
                  <p className="text-sm mt-2">
                    Department or team lead access:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm mt-1">
                    <li>All records within assigned tenant</li>
                    <li>Team dashboards and reports</li>
                    <li>Opportunity and pipeline management</li>
                    <li>Cannot access Settings or system configuration</li>
                  </ul>
                </div>

                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="text-green-400 font-semibold">Employee</h4>
                  <p className="text-sm mt-2">
                    Individual contributor access:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm mt-1">
                    <li>Only records they created or are assigned to</li>
                    <li>Personal dashboard and activities</li>
                    <li>Cannot view other employees&apos; records</li>
                    <li>Cannot access team reports or Settings</li>
                  </ul>
                </div>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-3 mt-4">
                <p className="text-yellow-300 text-sm">
                  <strong>Important:</strong> Permissions are enforced at the database level via Row-Level Security (RLS) policies. Users cannot bypass restrictions through the UI or API.
                </p>
              </div>
            </div>

            <h2 className="text-slate-100 text-xl font-semibold mt-8 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              3. Tenant (Client) Management
            </h2>
            
            <h3 className="text-slate-200 text-lg font-medium">3.1 Multi-Tenant Architecture</h3>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
              <p className="text-sm">
                Each tenant (client organization) has:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                <li><strong>Isolated Data:</strong> All records filtered by <code>tenant_id</code></li>
                <li><strong>Custom Branding:</strong> Logo, colors, and display name</li>
                <li><strong>Separate Users:</strong> Each user belongs to one tenant</li>
                <li><strong>Independent Settings:</strong> Module settings per tenant</li>
              </ul>
            </div>

            <h3 className="text-slate-200 text-lg font-medium mt-6">3.2 Managing Tenants</h3>
            <p className="text-sm">
              Access tenant management through <strong>Settings → Client Management</strong>:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm mt-2">
              <li>View all tenants and their active user counts</li>
              <li>Create new tenants with industry and branding settings</li>
              <li>Edit existing tenant information</li>
              <li>Deactivate tenants (preserves data but disables access)</li>
            </ol>

            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3 mt-3">
              <p className="text-blue-300 text-sm">
                <strong>Best Practice:</strong> Use tenant switching in the top navigation to test from different client perspectives. Admin users can view all tenants.
              </p>
            </div>

            <h2 className="text-slate-100 text-xl font-semibold mt-8 flex items-center gap-2">
              <Activity className="w-5 h-5 text-orange-400" />
              4. Monitoring & Diagnostics
            </h2>

            <h3 className="text-slate-200 text-lg font-medium">4.1 Available Diagnostic Tools</h3>
            <div className="space-y-3 text-sm">
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                <h4 className="text-slate-100 font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-400" />
                  API Health Monitor
                </h4>
                <p className="mt-1">
                  Real-time tracking of API endpoints. Automatically detects missing endpoints and provides fix suggestions. Updates every 5 seconds.
                </p>
                <p className="mt-1 text-slate-400">
                  <strong>Location:</strong> Settings → Diagnostics → API Health Monitor
                </p>
              </div>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                <h4 className="text-slate-100 font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-400" />
                  Audit Log
                </h4>
                <p className="mt-1">
                  Tracks all user actions (create, update, delete, login, logout) with full change history and user context.
                </p>
                <p className="mt-1 text-slate-400">
                  <strong>Location:</strong> Sidebar → Audit Log
                </p>
              </div>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                <h4 className="text-slate-100 font-semibold">AI Execution Logs</h4>
                <p className="mt-1">
                  View detailed logs of AI function calls and responses for debugging AI features.
                </p>
                <p className="mt-1 text-slate-400">
                  <strong>Location:</strong> Settings → Diagnostics → AI Execution Logs
                </p>
              </div>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                <h4 className="text-slate-100 font-semibold">System Health Dashboard</h4>
                <p className="mt-1">
                  Monitor server uptime, database connections, API response times, and error rates.
                </p>
                <p className="mt-1 text-slate-400">
                  <strong>Location:</strong> Settings → Diagnostics → System Health Dashboard
                </p>
              </div>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                <h4 className="text-slate-100 font-semibold">User Record Diagnostic</h4>
                <p className="mt-1">
                  Debug user authentication, permissions, and data visibility issues.
                </p>
                <p className="mt-1 text-slate-400">
                  <strong>Location:</strong> Settings → Diagnostics → User Record Diagnostic
                </p>
              </div>
            </div>

            <h3 className="text-slate-200 text-lg font-medium mt-6">4.2 Backend Server Management</h3>
            <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
              <p className="text-sm mb-2">
                <strong>Health Check:</strong> <code>http://localhost:4001/health</code>
              </p>
              <p className="text-sm mb-2">
                <strong>API Status:</strong> <code>http://localhost:4001/api/status</code>
              </p>
              <p className="text-sm">
                Server logs display startup banner with:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm mt-1">
                <li>Port and environment</li>
                <li>Database connection status</li>
                <li>Total registered endpoints (197)</li>
                <li>Health check URLs</li>
              </ul>
            </div>

            <h2 className="text-slate-100 text-xl font-semibold mt-8 flex items-center gap-2">
              <Lock className="w-5 h-5 text-red-400" />
              5. Security Best Practices
            </h2>
            
            <ul className="list-disc list-inside space-y-2 text-sm">
              <li><strong>Least Privilege:</strong> Assign minimum required role (most users should be Employee, not Manager)</li>
              <li><strong>Regular Audits:</strong> Review Audit Log monthly for unusual patterns or unauthorized access attempts</li>
              <li><strong>Tenant Isolation:</strong> Verify RLS policies prevent cross-tenant data leaks</li>
              <li><strong>API Monitoring:</strong> Check API Health Monitor daily for new missing endpoints or server errors</li>
              <li><strong>Environment Variables:</strong> Never commit <code>.env</code> files; rotate secrets quarterly</li>
              <li><strong>Database Backups:</strong> Supabase automatic backups enabled; test restore procedures monthly</li>
              <li><strong>User Deactivation:</strong> Deactivate (don&apos;t delete) departing users to preserve audit trails</li>
            </ul>

            <h2 className="text-slate-100 text-xl font-semibold mt-8">6. Common Administrative Tasks</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-slate-200 text-lg font-medium">6.1 Restarting Services</h3>
                <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 mt-2">
                  <p className="text-sm mb-2"><strong>Frontend (Docker):</strong></p>
                  <code className="text-xs bg-slate-800 p-2 rounded block">docker-compose up -d --build frontend</code>
                  
                  <p className="text-sm mt-3 mb-2"><strong>Backend (Docker):</strong></p>
                  <code className="text-xs bg-slate-800 p-2 rounded block">docker-compose up -d --build backend</code>
                  
                  <p className="text-sm mt-3 mb-2"><strong>Full Stack:</strong></p>
                  <code className="text-xs bg-slate-800 p-2 rounded block">.\\start-all.ps1</code>
                </div>
              </div>

              <div>
                <h3 className="text-slate-200 text-lg font-medium">6.2 Clearing Audit Logs</h3>
                <p className="text-sm">
                  Go to <strong>Audit Log</strong> page and click <strong>&quot;Clear All Logs&quot;</strong> to remove old entries. Recommended for production systems after exporting logs for archival.
                </p>
              </div>

              <div>
                <h3 className="text-slate-200 text-lg font-medium">6.3 Database Migrations</h3>
                <p className="text-sm">
                  Migrations are stored in <code>backend/migrations/</code>. Apply new schema changes through Supabase dashboard or use migration scripts.
                </p>
                <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 mt-2">
                  <p className="text-red-300 text-sm">
                    <strong>Warning:</strong> Always backup database before running migrations. Test in development environment first.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-slate-200 text-lg font-medium">6.4 Adding New API Endpoints</h3>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Create route file in <code>backend/routes/</code></li>
                  <li>Import and register in <code>backend/server.js</code></li>
                  <li>Add pluralization rule in <code>src/api/entities.js</code> if needed</li>
                  <li>Restart backend server</li>
                  <li>Verify in API Health Monitor</li>
                </ol>
              </div>
            </div>

            <h2 className="text-slate-100 text-xl font-semibold mt-8">7. Troubleshooting</h2>
            
            <div className="space-y-3 text-sm">
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                <h4 className="text-slate-100 font-semibold">Backend Won&apos;t Start</h4>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li>Check port 3001 isn&apos;t already in use</li>
                  <li>Verify <code>.env</code> file exists with database credentials</li>
                  <li>Review <code>backend/TROUBLESHOOTING_NODE_ESM.md</code> for ESM-specific issues</li>
                  <li>Check database connection with <code>node backend/check-schema.js</code></li>
                </ul>
              </div>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                <h4 className="text-slate-100 font-semibold">User Can&apos;t See Data</h4>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li>Verify user has correct <code>tenant_id</code> assigned</li>
                  <li>Check employee role (Manager vs Employee)</li>
                  <li>Run User Record Diagnostic tool</li>
                  <li>Review RLS policies in Supabase dashboard</li>
                </ul>
              </div>

              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                <h4 className="text-slate-100 font-semibold">Missing API Endpoint Error</h4>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  <li>Check API Health Monitor for specific endpoint</li>
                  <li>Copy auto-generated fix from health monitor</li>
                  <li>Verify route is registered in <code>server.js</code></li>
                  <li>Restart backend after adding routes</li>
                </ul>
              </div>
            </div>

            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 mt-8">
              <p className="text-blue-300 text-sm">
                <strong>Need Help?</strong> Check <code>README.md</code> and <code>backend/README.md</code> for detailed setup instructions. For legacy Ai-SHA issues, contact app@base44.com.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}