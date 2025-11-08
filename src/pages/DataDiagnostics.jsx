import { useState } from "react";
import { Account, Contact, Lead, Opportunity } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Database, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ActivityVisibilityDebug from "../components/settings/ActivityVisibilityDebug"; // New import for ActivityVisibilityDebug
import { useUser } from "../components/shared/useUser.js";

/**
 * Component for General Database Diagnostics tab.
 * Contains the original diagnostic logic for record counts, tenant distribution, etc.
 */
function GeneralDiagnosticsPanel({ user }) {
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      // Fetch ALL records without any filter
      const [allContacts, allAccounts, allLeads, allOpportunities] =
        await Promise.all([
          Contact.filter({}),
          Account.filter({}),
          Lead.filter({}),
          Opportunity.filter({}),
        ]);

      // Analyze tenant_id distribution
      const contactTenants = {};
      const accountTenants = {};
      const leadTenants = {};
      const oppTenants = {};

      allContacts.forEach((c) => {
        const tid = c.tenant_id || "NULL";
        contactTenants[tid] = (contactTenants[tid] || 0) + 1;
      });

      allAccounts.forEach((a) => {
        const tid = a.tenant_id || "NULL";
        accountTenants[tid] = (accountTenants[tid] || 0) + 1;
      });

      allLeads.forEach((l) => {
        const tid = l.tenant_id || "NULL";
        leadTenants[tid] = (leadTenants[tid] || 0) + 1;
      });

      allOpportunities.forEach((o) => {
        const tid = o.tenant_id || "NULL";
        oppTenants[tid] = (oppTenants[tid] || 0) + 1;
      });

      // Analyze is_test_data distribution
      const contactTestData = {
        true: allContacts.filter((c) => c.is_test_data === true).length,
        false: allContacts.filter((c) => c.is_test_data === false).length,
        null: allContacts.filter((c) =>
          c.is_test_data === null || c.is_test_data === undefined
        ).length,
      };

      setDiagnostics({
        totalCounts: {
          contacts: allContacts.length,
          accounts: allAccounts.length,
          leads: allLeads.length,
          opportunities: allOpportunities.length,
        },
        tenantDistribution: {
          contacts: contactTenants,
          accounts: accountTenants,
          leads: leadTenants,
          opportunities: oppTenants,
        },
        testDataDistribution: {
          contacts: contactTestData,
        },
        currentUserTenantId: user?.tenant_id,
        sampleRecords: {
          contact: allContacts[0],
          account: allAccounts[0],
          lead: allLeads[0],
          opportunity: allOpportunities[0],
        },
      });
    } catch (error) {
      console.error("Diagnostic error:", error);
      // TODO: Add user-facing error message
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <Database className="w-6 h-6 text-blue-400" />
          General Database Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200">
            <p className="font-semibold mb-1">Admin Tool</p>
            <p>
              This tool analyzes your entire database to identify data integrity
              issues like tenant ID distribution.
            </p>
          </div>
        </div>

        <Button
          onClick={runDiagnostics}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loading
            ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Diagnostics...
              </>
            )
            : (
              "Run Full Database Diagnostic"
            )}
        </Button>

        {diagnostics && (
          <div className="space-y-6 mt-6">
            <Card className="bg-slate-700 border-slate-600">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">
                  Total Record Counts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Contacts</p>
                    <p className="text-2xl font-bold text-slate-100">
                      {diagnostics.totalCounts.contacts}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Accounts</p>
                    <p className="text-2xl font-bold text-slate-100">
                      {diagnostics.totalCounts.accounts}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Leads</p>
                    <p className="text-2xl font-bold text-slate-100">
                      {diagnostics.totalCounts.leads}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Opportunities</p>
                    <p className="text-2xl font-bold text-slate-100">
                      {diagnostics.totalCounts.opportunities}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-700 border-slate-600">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">
                  Your Tenant ID
                </CardTitle>
              </CardHeader>
              <CardContent>
                <code className="text-green-400 bg-slate-900 px-3 py-2 rounded">
                  {diagnostics.currentUserTenantId}
                </code>
              </CardContent>
            </Card>

            <Card className="bg-slate-700 border-slate-600">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">
                  Tenant ID Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-300 mb-2">
                    Contacts by Tenant:
                  </p>
                  <div className="bg-slate-900 rounded p-3 max-h-48 overflow-auto">
                    {Object.entries(diagnostics.tenantDistribution.contacts)
                      .map(([tid, count]) => (
                        <div key={tid} className="flex justify-between py-1">
                          <code
                            className={`text-sm ${
                              tid === diagnostics.currentUserTenantId
                                ? "text-green-400 font-bold"
                                : "text-slate-400"
                            }`}
                          >
                            {tid === "NULL" ? "[NO TENANT_ID]" : tid}
                          </code>
                          <span className="text-slate-300">
                            {count} records
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-300 mb-2">
                    Accounts by Tenant:
                  </p>
                  <div className="bg-slate-900 rounded p-3 max-h-48 overflow-auto">
                    {Object.entries(diagnostics.tenantDistribution.accounts)
                      .map(([tid, count]) => (
                        <div key={tid} className="flex justify-between py-1">
                          <code
                            className={`text-sm ${
                              tid === diagnostics.currentUserTenantId
                                ? "text-green-400 font-bold"
                                : "text-slate-400"
                            }`}
                          >
                            {tid === "NULL" ? "[NO TENANT_ID]" : tid}
                          </code>
                          <span className="text-slate-300">
                            {count} records
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-700 border-slate-600">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">
                  Test Data Distribution (Contacts)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-slate-400">is_test_data: true</p>
                    <p className="text-xl font-bold text-slate-100">
                      {diagnostics.testDataDistribution.contacts.true}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">
                      is_test_data: false
                    </p>
                    <p className="text-xl font-bold text-slate-100">
                      {diagnostics.testDataDistribution.contacts.false}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">is_test_data: null</p>
                    <p className="text-xl font-bold text-slate-100">
                      {diagnostics.testDataDistribution.contacts.null}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-700 border-slate-600">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">
                  Sample Records
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-slate-900 rounded p-4 text-xs text-slate-300 overflow-auto max-h-96">
                  {JSON.stringify(diagnostics.sampleRecords, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Placeholder component for the User Record tab.
 */
function UserRecordDebug({ user }) {
  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          User Record Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-slate-300">
          This section will provide detailed diagnostics related to the current
          user&apos;s record.
        </p>
        {user
          ? (
            <pre className="bg-slate-900 rounded p-4 text-xs text-slate-300 overflow-auto max-h-96 mt-4">{JSON.stringify(user, null, 2)}</pre>
          )
          : <p className="text-slate-400 mt-4">User data is not available.</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Placeholder component for the Lead Visibility tab.
 */
function LeadVisibilityDebug() {
  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          Lead Visibility Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-slate-300">
          This section will contain diagnostics to investigate lead visibility
          issues.
        </p>
        <p className="text-slate-400 mt-2">Implementation pending.</p>
      </CardContent>
    </Card>
  );
}

export default function DataDiagnosticsPage() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState("activity-visibility"); // Changed default to activity-visibility

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-slate-100 mb-6">
          Data Diagnostics Admin Panel
        </h1>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800 border-slate-700">
            <TabsTrigger value="activity-visibility">
              Activity Visibility
            </TabsTrigger>
            <TabsTrigger value="general-diagnostics">
              General Diagnostics
            </TabsTrigger>
            <TabsTrigger value="user-record">User Record</TabsTrigger>
            <TabsTrigger value="lead-visibility">Lead Visibility</TabsTrigger>
          </TabsList>

          <TabsContent value="activity-visibility" className="mt-4">
            <ActivityVisibilityDebug />
          </TabsContent>

          <TabsContent value="general-diagnostics" className="mt-4">
            <GeneralDiagnosticsPanel user={user} />
          </TabsContent>

          <TabsContent value="user-record" className="mt-4">
            <UserRecordDebug user={user} />
          </TabsContent>

          <TabsContent value="lead-visibility" className="mt-4">
            <LeadVisibilityDebug />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
