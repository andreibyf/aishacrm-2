import TestRunner from '../components/testing/TestRunner';
import { errorLoggerTests } from '../components/testing/errorLoggerTests';
import { formValidationTests } from '../components/testing/formValidationTests';
import { dataIntegrityTests } from '../components/testing/dataIntegrityTests';
import { utilityFunctionTests } from '../components/testing/utilityFunctionTests';
import { employeeScopeTests } from '../components/testing/employeeScopeTests';
import { apiHealthMonitorTests } from '../components/testing/apiHealthMonitorTests';
import { crudTests } from '../components/testing/crudTests';
import { systemLogsTests } from '../components/testing/systemLogsTests';
import { userContextTests } from '../components/testing/userContextTests.jsx';
import { userMigrationIntegrationTests } from '../components/testing/userMigrationIntegrationTests.jsx';
import { schemaValidationTests } from '../components/testing/schemaValidationTests';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, TestTube } from "lucide-react";

  const testSuites = [
    schemaValidationTests, // New comprehensive schema validation tests
    userContextTests,
    userMigrationIntegrationTests,
    errorLoggerTests,
    formValidationTests,
    dataIntegrityTests,
    utilityFunctionTests,
    employeeScopeTests,
    apiHealthMonitorTests,
    crudTests,
    systemLogsTests
  ];export default function UnitTestsPage() {
  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 flex items-center justify-center rounded-full bg-blue-900/30 border border-blue-700/50">
            <TestTube className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-100">Unit Tests</h1>
            <p className="text-slate-400">Automated testing suite for application components</p>
          </div>
        </div>

        <Alert className="bg-blue-900/30 border-blue-700">
          <Info className="h-4 w-4 text-blue-400" />
          <AlertTitle className="text-blue-300">Testing Information</AlertTitle>
          <AlertDescription className="text-blue-400">
            This test suite validates core functionality including schema validation (minimal required fields),
            CRUD operations, error logging, form validation, data integrity, utility functions, employee scope filtering,
            and API health monitoring. Click &quot;Run All Tests&quot; to execute the full suite.
          </AlertDescription>
        </Alert>

        <Alert className="bg-green-900/30 border-green-700">
          <Info className="h-4 w-4 text-green-400" />
          <AlertTitle className="text-green-300">✅ Full Database Testing Enabled</AlertTitle>
          <AlertDescription className="text-green-400">
            Backend is connected to Supabase Cloud PostgreSQL with full CRUD operations implemented. 
            All tests run against real database operations for comprehensive validation.
          </AlertDescription>
        </Alert>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">Test Suites ({testSuites.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {testSuites.map((suite) => (
                <Card key={suite.name} className="bg-slate-700 border-slate-600">
                  <CardContent className="p-4">
                    <div className="font-medium text-slate-200 mb-1">{suite.name}</div>
                    <div className="text-sm text-slate-400">{suite.tests.length} tests</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <TestRunner testSuites={testSuites} />

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-100">Coverage Areas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-700 rounded-lg">
                <div className="font-medium text-slate-200 mb-1 flex items-center gap-2">
                  ✅ Schema Validation
                  <span className="text-xs px-2 py-0.5 bg-green-900/40 text-green-300 border border-green-700/60 rounded">30+ Tests</span>
                </div>
                <div className="text-sm text-slate-400">
                  Validates minimal required fields, optional fields, metadata storage, email uniqueness, and UI indicators for all entities (Employees, Accounts, Contacts, Leads, Opportunities).
                </div>
              </div>
              <div className="p-3 bg-slate-700 rounded-lg">
                <div className="font-medium text-slate-200 mb-1 flex items-center gap-2">
                  🔧 CRUD Operations
                  <span className="text-xs px-2 py-0.5 bg-green-900/40 text-green-300 border border-green-700/60 rounded">Live DB</span>
                </div>
                <div className="text-sm text-slate-400">
                  End-to-end Create, Read, Update, Delete tests running against Supabase Cloud PostgreSQL.
                </div>
              </div>
              <div className="p-3 bg-slate-700 rounded-lg">
                <div className="font-medium text-slate-200 mb-1">Error Logging</div>
                <div className="text-sm text-slate-400">
                  Error creation, HTTP status mapping, structured error handling
                </div>
              </div>
              <div className="p-3 bg-slate-700 rounded-lg">
                <div className="font-medium text-slate-200 mb-1">Form Validation</div>
                <div className="text-sm text-slate-400">
                  Required fields, data types, enum values, format validation
                </div>
              </div>
              <div className="p-3 bg-slate-700 rounded-lg">
                <div className="font-medium text-slate-200 mb-1">Data Integrity</div>
                <div className="text-sm text-slate-400">
                  Tenant isolation, entity relationships, referential integrity
                </div>
              </div>
              <div className="p-3 bg-slate-700 rounded-lg">
                <div className="font-medium text-slate-200 mb-1">Utility Functions</div>
                <div className="text-sm text-slate-400">
                  Phone formatting, email validation, filter generation
                </div>
              </div>
              <div className="p-3 bg-slate-700 rounded-lg">
                <div className="font-medium text-slate-200 mb-1">Employee Scope</div>
                <div className="text-sm text-slate-400">
                  Permission checks, record filtering, role-based access control
                </div>
              </div>
              <div className="p-3 bg-slate-700 rounded-lg">
                <div className="font-medium text-slate-200 mb-1">API Health Monitor</div>
                <div className="text-sm text-slate-400">
                  Error tracking (404, 500, 401/403, 429, timeout, network), health reporting
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}