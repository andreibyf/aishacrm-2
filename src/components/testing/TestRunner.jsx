import { useCallback, useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Play,
  XCircle,
} from "lucide-react";
import { getBackendUrl } from "@/api/backendUrl";

const BACKEND_URL = getBackendUrl();

const TEST_RESULTS_KEY = 'unit_test_results';

export default function TestRunner({ testSuites }) {
  // Initialize results from sessionStorage if available
  const [results, setResults] = useState(() => {
    try {
      const stored = sessionStorage.getItem(TEST_RESULTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [running, setRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState(null);
  const resultsRef = useRef([]);
  const [preflight, setPreflight] = useState({
    status: "unknown",
    message: null,
    database: "unknown",
  });
  const [checking, setChecking] = useState(true);

  // Preflight check function
  const checkBackend = useCallback(async () => {
    setChecking(true);
    try {
      // Prefer the deeper system status that actually hits the DB
      let resp = await fetch(`${BACKEND_URL}/api/system/status`);
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      const sys = await resp.json();
      const dbStatus = sys?.data?.database || "unknown";
      if (dbStatus === "connected") {
        setPreflight({
          status: "ok",
          message: "Backend online",
          database: "connected",
        });
      } else {
        setPreflight({
          status: "error",
          message: `Database not ready: ${dbStatus}`,
          database: dbStatus,
        });
      }
    } catch {
      try {
        // Fallback to lightweight health check
        const resp = await fetch(`${BACKEND_URL}/health`);
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        const data = await resp.json();
        // Health may say connected = based on pool exist; keep conservative
        setPreflight({
          status: data?.database === "connected" ? "ok" : "error",
          message: data?.database === "connected"
            ? "Backend online"
            : "Database not ready",
          database: data?.database || "unknown",
        });
      } catch {
        setPreflight({
          status: "error",
          message: `Backend not reachable at ${BACKEND_URL}`,
          database: "unknown",
        });
      }
    } finally {
      setChecking(false);
    }
  }, []);

  // Run preflight check on mount
  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  const runTests = async () => {
    setRunning(true);
    const allResults = [];
    resultsRef.current = [];
    setResults([]);
    sessionStorage.removeItem(TEST_RESULTS_KEY);

    console.log('[TestRunner] Starting test run with', testSuites.length, 'suites');
    let testIndex = 0;
    const TEST_TIMEOUT_MS = 15000; // prevent hangs that reduce completed count

    const flushResults = () => {
      // Batch UI/state updates to reduce flicker
      resultsRef.current = [...allResults];
      setResults([...allResults]);
      try {
        sessionStorage.setItem(TEST_RESULTS_KEY, JSON.stringify(allResults));
      } catch (e) {
        console.error('[TestRunner] Failed to store results:', e);
      }
    };

    try {
      for (const suite of testSuites) {
        console.log(`[TestRunner] Starting suite: ${suite.name} (${suite.tests.length} tests)`);

        for (const test of suite.tests) {
          testIndex++;
          setCurrentTest(`${suite.name} - ${test.name}`);
          const startTime = Date.now();
          const result = {
            suite: suite.name,
            test: test.name,
            status: 'running',
            duration: 0,
            error: null,
          };

            // Wrap test in timeout to avoid indefinite hangs
          const execPromise = (async () => { await test.fn(); })();
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Timeout after ${TEST_TIMEOUT_MS}ms`)), TEST_TIMEOUT_MS);
          });

          try {
            await Promise.race([execPromise, timeoutPromise]);
            result.status = 'passed';
          } catch (error) {
            result.status = 'failed';
            result.error = error.message;
            console.error(`[TestRunner] ✗ Test ${testIndex} failed:`, error.message);
          } finally {
            result.duration = Date.now() - startTime;
          }

          allResults.push(result);
          // Flush every 5 tests or at end to limit re-renders
          if (testIndex % 5 === 0 || testIndex === totalTests) {
            flushResults();
          }
        }

        console.log(`[TestRunner] Completed suite: ${suite.name}`);
        // Flush after each suite (in case suite size < 5)
        flushResults();
      }

      console.log('[TestRunner] All tests completed:', allResults.length, 'total');
    } catch (error) {
      console.error('[TestRunner] FATAL ERROR during test execution:', error);
      console.error('[TestRunner] Stack:', error.stack);
      alert(`Test runner crashed at test ${testIndex}: ${error.message}\n\nCheck console for details.`);
    } finally {
      flushResults();
      setCurrentTest(null);
      setRunning(false);
      console.log('[TestRunner] Test run finished. Results:', allResults.length);
    }
  };

  // Restore results from ref if component remounts during test run
  useEffect(() => {
    if (resultsRef.current.length > 0 && results.length === 0 && !running) {
      console.log('[TestRunner] Restoring results from ref:', resultsRef.current.length);
      setResults(resultsRef.current);
    }
  }, [results.length, running]);

  const totalTests = testSuites.reduce(
    (sum, suite) => sum + suite.tests.length,
    0,
  );
  const passedTests = results.filter((r) => r.status === "passed").length;
  const failedTests = results.filter((r) => r.status === "failed").length;
  const completedTests = results.length;
  const passRate = completedTests > 0
    ? ((passedTests / completedTests) * 100).toFixed(1)
    : 0;

  console.log('[TestRunner] Render - results.length:', results.length, 'passed:', passedTests, 'failed:', failedTests);

  const [cleaning, setCleaning] = useState(false);
  const clearResults = async () => {
    // Clear UI/test results first
    setResults([]);
    resultsRef.current = [];
    try {
      sessionStorage.removeItem(TEST_RESULTS_KEY);
      console.log('[TestRunner] Results cleared');
    } catch (e) {
      console.error('[TestRunner] Failed to clear results:', e);
    }

    // Proactively clean up test data created with test tenant
    // This helps when a run aborts before Delete tests execute
    const TEST_TENANT_ID = 'local-tenant-001';
    const BACKEND_URL = getBackendUrl();
    const cleanupSpecs = [
      {
        endpoint: 'contacts', key: 'contacts', matcher: (r) =>
          (r.email && r.email.includes('@unittest.local')) || r.first_name === 'Test'
      },
      {
        endpoint: 'leads', key: 'leads', matcher: (r) =>
          (r.email && r.email.includes('@unittest.local')) || r.first_name === 'Test'
      },
      {
        endpoint: 'accounts', key: 'accounts', matcher: (r) =>
          r.name && r.name.startsWith('Test Account ')
      },
      {
        endpoint: 'system-logs', key: 'system-logs', matcher: (r) =>
          r.source === 'UnitTests:SystemLogs'
      }
    ];

    setCleaning(true);
    const summary = [];
    for (const spec of cleanupSpecs) {
      try {
        const listResp = await fetch(`${BACKEND_URL}/api/${spec.endpoint}?tenant_id=${encodeURIComponent(TEST_TENANT_ID)}&limit=200`);
        if (!listResp.ok) {
          console.warn(`[Cleanup] Skip ${spec.endpoint}: status ${listResp.status}`);
          continue;
        }
        const listJson = await listResp.json();
        const raw = listJson?.data?.[spec.key] || [];
        const targets = raw.filter(spec.matcher);
        let deleted = 0;
        for (const item of targets) {
          if (!item.id) continue;
          try {
            const del = await fetch(`${BACKEND_URL}/api/${spec.endpoint}/${item.id}?tenant_id=${encodeURIComponent(TEST_TENANT_ID)}`, { method: 'DELETE' });
            if (del.ok) deleted++;
          } catch (e) {
            console.warn(`[Cleanup] Failed delete ${spec.endpoint} ${item.id}:`, e.message);
          }
        }
        summary.push(`${spec.endpoint}:${deleted}/${targets.length}`);
      } catch (e) {
        console.warn(`[Cleanup] Error processing ${spec.endpoint}:`, e.message);
      }
    }
    setCleaning(false);
    console.log('[Cleanup] Test data cleanup summary ->', summary.join(', '));
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center justify-between">
            <span>Test Suite Runner</span>
            <div className="flex items-center gap-2">
              <Button
                onClick={checkBackend}
                variant="outline"
                className="bg-slate-700 border-slate-600"
                disabled={checking}
              >
                {checking
                  ? <Clock className="w-4 h-4 mr-2 animate-spin" />
                  : <FileText className="w-4 h-4 mr-2" />}
                Check Backend
              </Button>
              {(results.length > 0 || !running) && (
                <Button
                  onClick={clearResults}
                  variant="outline"
                  className="bg-slate-700 border-slate-600 hover:bg-red-900/30"
                  disabled={running || cleaning}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  {cleaning ? 'Clearing…' : 'Clear Results + Data'}
                </Button>
              )}
              <Button
                onClick={runTests}
                disabled={running || checking || preflight.status !== "ok"}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {running
                  ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Running...
                    </>
                  )
                  : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run All Tests
                    </>
                  )}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Preflight banner */}
          {checking
            ? (
              <Alert className="mb-4 bg-blue-900/30 border-blue-700">
                <Clock className="h-4 w-4 animate-spin" />
                <AlertDescription className="text-blue-300">
                  Checking backend status…
                </AlertDescription>
              </Alert>
            )
            : preflight.status !== "ok"
            ? (
              <Alert className="mb-4 bg-red-900/30 border-red-700">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-300">
                  {preflight.message}. Tests are disabled until the backend is
                  reachable.
                </AlertDescription>
              </Alert>
            )
            : (
              <Alert className="mb-4 bg-green-900/30 border-green-700">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-300">
                  Backend online (database:{" "}
                  {preflight.database}). You can run the tests.
                </AlertDescription>
              </Alert>
            )}

          {running && currentTest && (
            <Alert className="mb-4 bg-blue-900/30 border-blue-700">
              <Clock className="h-4 w-4 animate-spin" />
              <AlertDescription className="text-blue-300">
                Running: {currentTest}
              </AlertDescription>
            </Alert>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Card className="bg-slate-700 border-slate-600">
                <CardContent className="p-4">
                  <div className="text-sm text-slate-400">Completed</div>
                  <div className="text-2xl font-bold text-slate-100">
                    {completedTests} / {totalTests}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-green-900/30 border-green-700">
                <CardContent className="p-4">
                  <div className="text-sm text-green-400">Passed</div>
                  <div className="text-2xl font-bold text-green-300">
                    {passedTests}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-red-900/30 border-red-700">
                <CardContent className="p-4">
                  <div className="text-sm text-red-400">Failed</div>
                  <div className="text-2xl font-bold text-red-300">
                    {failedTests}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-blue-900/30 border-blue-700">
                <CardContent className="p-4">
                  <div className="text-sm text-blue-400">Pass Rate</div>
                  <div className="text-2xl font-bold text-blue-300">
                    {passRate}%
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="space-y-2">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  result.status === "passed"
                    ? "bg-green-900/20 border-green-700"
                    : "bg-red-900/20 border-red-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {result.status === "passed"
                      ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                      : <XCircle className="w-5 h-5 text-red-400" />}
                    <div>
                      <div className="font-medium text-slate-200">
                        {result.suite} - {result.test}
                      </div>
                      {result.error && (
                        <div className="text-sm text-red-400 mt-1">
                          Error: {result.error}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-slate-400">
                    {result.duration}ms
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
