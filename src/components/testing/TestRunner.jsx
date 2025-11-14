import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { useUser } from '@/components/shared/useUser.js';

const BACKEND_URL = getBackendUrl();

const TEST_RESULTS_KEY = 'unit_test_results';
const TEST_CONFIG_KEY = 'unit_test_config';

export default function TestRunner({ testSuites }) {
  // Initialize results from sessionStorage to survive remounts during test run
  const [results, setResults] = useState(() => {
    try {
      const stored = sessionStorage.getItem(TEST_RESULTS_KEY);
      if (stored) {
        console.log('[TestRunner] Initialized from sessionStorage');
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('[TestRunner] Failed to restore from sessionStorage:', e);
    }
    return [];
  });
  // Declare state/refs used by effects BEFORE effects to avoid TDZ/minifier issues
  const [running, setRunning] = useState(false);
  const resultsRef = useRef([]);
  const { user } = useUser();
  const isSuperadmin = (user?.role || '').toLowerCase() === 'superadmin';
  const [config, setConfig] = useState(() => {
    try {
      const ls = typeof window !== 'undefined' ? window.localStorage?.getItem(TEST_CONFIG_KEY) : null;
      if (ls) return JSON.parse(ls);
      const ss = sessionStorage.getItem(TEST_CONFIG_KEY);
      if (ss) return JSON.parse(ss);
    } catch (e) { /* ignore config restore error */ }
    return { workers: 1, rate: 0, delayMs: 0 };
  });
  // Named profiles: save/load/delete (persisted to localStorage)
  const [profiles, setProfiles] = useState(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage?.getItem('unit_test_profiles') : null;
      if (raw) return JSON.parse(raw) || {};
    } catch (e) { /* ignore */ }
    return {};
  });
  const [activeProfile, setActiveProfile] = useState('');
  const [profileNameInput, setProfileNameInput] = useState('');
  const [hasStoredResults, setHasStoredResults] = useState(false);
  const syncIntervalRef = useRef(null);
  const runIdRef = useRef(0);
  const pollIntervalRef = useRef(null);
  const startAtRef = useRef(0);
  const rateLimited429Ref = useRef(0);
  const [uiStats, setUiStats] = useState({ avgRps: 0, rateLimited429: 0 });

  // Category selection (suites) with persistence
  const allSuiteNames = useMemo(() => testSuites.map((s) => s.name), [testSuites]);
  const [selectedCategories, setSelectedCategories] = useState(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage?.getItem('unit_test_selected_categories') : null;
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr);
      }
    } catch (e) { /* ignore */ }
    return new Set(allSuiteNames);
  });
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem('unit_test_selected_categories', JSON.stringify(Array.from(selectedCategories)));
      }
    } catch (e) { /* ignore */ }
  }, [selectedCategories]);
  // Keep selection in sync if suites change
  useEffect(() => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      // Add any new suites
      for (const n of allSuiteNames) next.add(n);
      // Remove suites that no longer exist
      for (const n of Array.from(next)) if (!allSuiteNames.includes(n)) next.delete(n);
      return next;
    });
  }, [allSuiteNames.join('|')]);

  const effectiveSuites = useMemo(() => testSuites.filter((s) => selectedCategories.has(s.name)), [testSuites, selectedCategories]);

  // Detect presence of stored results (for manual restore)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(TEST_RESULTS_KEY);
      setHasStoredResults(!!stored);
    } catch {
      setHasStoredResults(false);
    }
  }, [results.length]);

  // Persist test config locally for convenience
  useEffect(() => {
    try {
      sessionStorage.setItem(TEST_CONFIG_KEY, JSON.stringify(config));
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem(TEST_CONFIG_KEY, JSON.stringify(config));
      }
    } catch (e) { /* ignore config persist error */ }
  }, [config]);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage?.setItem('unit_test_profiles', JSON.stringify(profiles));
      }
    } catch (e) { /* ignore */ }
  }, [profiles]);

  const loadProfile = useCallback((name) => {
    try {
      const p = profiles?.[name];
      if (!p) return;
      setConfig((c) => ({ ...c, workers: p.workers ?? c.workers, rate: p.rate ?? c.rate, delayMs: p.delayMs ?? c.delayMs }));
      if (Array.isArray(p.categories) && p.categories.length > 0) {
        setSelectedCategories(new Set(p.categories));
      }
      setActiveProfile(name);
    } catch (e) { /* ignore */ }
  }, [profiles]);

  const saveProfile = useCallback(() => {
    const name = profileNameInput?.trim();
    if (!name) return;
    const payload = { workers: config.workers, rate: config.rate, delayMs: config.delayMs, categories: Array.from(selectedCategories) };
    setProfiles((prev) => ({ ...prev, [name]: payload }));
    setActiveProfile(name);
  }, [profileNameInput, config, selectedCategories]);

  const deleteProfile = useCallback(() => {
    const name = activeProfile?.trim();
    if (!name) return;
    setProfiles((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setActiveProfile('');
  }, [activeProfile]);

  // Poll for test run completion if we detect an active run on mount
  useEffect(() => {
    const runningFlag = sessionStorage.getItem('test_runner_active');
    if (runningFlag === 'true' && !running) {
      console.log('[TestRunner] Detected active test run in another component instance, polling for updates...');
      
      // Poll sessionStorage for updates
      const pollInterval = setInterval(() => {
        try {
          const stillRunning = sessionStorage.getItem('test_runner_active');
          if (stillRunning !== 'true') {
            console.log('[TestRunner] Test run completed, syncing final results');
            const stored = sessionStorage.getItem(TEST_RESULTS_KEY);
            if (stored) {
              const parsed = JSON.parse(stored);
              setResults(parsed);
              resultsRef.current = parsed;
            }
            clearInterval(pollInterval);
            if (pollIntervalRef.current) {
              pollIntervalRef.current = null;
            }
          } else {
            // Sync intermediate results
            const stored = sessionStorage.getItem(TEST_RESULTS_KEY);
            if (stored) {
              const parsed = JSON.parse(stored);
              setResults((currentResults) => {
                if (parsed.length !== currentResults.length) {
                  console.log('[TestRunner] Polling sync: updating to', parsed.length, 'tests');
                  resultsRef.current = parsed;
                  return parsed;
                }
                return currentResults;
              });
            }
          }
        } catch (e) {
          console.error('[TestRunner] Polling error:', e);
        }
      }, 500); // Poll every 500ms

      pollIntervalRef.current = pollInterval;
      
      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }
  }, [running]); // Only depend on running state

  const restoreResults = () => {
    try {
      const stored = sessionStorage.getItem(TEST_RESULTS_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        resultsRef.current = parsed;
        setResults(parsed);
        console.log('[TestRunner] Restored previous results from sessionStorage:', parsed.length);
      }
    } catch (e) {
      console.warn('[TestRunner] Failed to restore previous results:', e.message);
    }
  };
  const [currentTest, setCurrentTest] = useState(null);
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

  // Compute totals from selected suites
  const totalTests = effectiveSuites.reduce(
    (sum, suite) => sum + suite.tests.length,
    0,
  );

  const runTests = async () => {
    // Prevent concurrent runs - check both state AND sessionStorage
    const runningFlag = sessionStorage.getItem('test_runner_active');
    if (running || runningFlag === 'true') {
      console.log('[TestRunner] Already running (running=' + running + ', sessionStorage=' + runningFlag + '), ignoring duplicate runTests call');
      return;
    }
    
    // Mark as running in BOTH locations
    setRunning(true);
    sessionStorage.setItem('test_runner_active', 'true');
    
    const allResults = [];
    resultsRef.current = [];
    console.log('[TestRunner] CLEARING results at start of run');
    setResults([]);
    sessionStorage.removeItem(TEST_RESULTS_KEY);
    // Flag unit test mode for API monitor suppression
    if (typeof window !== 'undefined') {
      window.__UNIT_TEST_MODE = true;
      window.__UNIT_TEST_SUPPRESS_CODES = ['400']; // suppress validation error noise
    }
    runIdRef.current += 1;
    console.log('[TestRunner] Starting run ID:', runIdRef.current);

    console.log('[TestRunner] Starting test run with', effectiveSuites.length, 'suites');
    let testIndex = 0;
    let completed = 0;
    const TEST_TIMEOUT_MS = 15000; // prevent hangs that reduce completed count

    // Live stats instrumentation
    startAtRef.current = Date.now();
    const originalFetch = (typeof window !== 'undefined' && window.fetch) ? window.fetch : null;
    rateLimited429Ref.current = 0;
    try {
      if (typeof window !== 'undefined' && originalFetch) {
        window.fetch = async (...args) => {
          const res = await originalFetch(...args);
          try {
            if (res && res.status === 429) {
              rateLimited429Ref.current = (rateLimited429Ref.current || 0) + 1;
            }
          } catch (_) { /* ignore */ }
          return res;
        };
      }
    } catch (_) { /* ignore */ }

    const flushResults = () => {
      // Batch UI/state updates to reduce flicker
      resultsRef.current = [...allResults];
      console.log('[TestRunner] flushResults called - setting results to length:', allResults.length);
      setResults([...allResults]);
      try {
        sessionStorage.setItem(TEST_RESULTS_KEY, JSON.stringify(allResults));
      } catch (e) {
        console.error('[TestRunner] Failed to store results:', e);
      }
      const elapsed = Math.max(1, Date.now() - (startAtRef.current || Date.now()));
      const avgRpsNum = Number((allResults.length / (elapsed / 1000)).toFixed(1));
      setUiStats({ avgRps: avgRpsNum, rateLimited429: rateLimited429Ref.current || 0 });
    };
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

    // Flatten jobs for scheduling
    const jobs = [];
    for (const suite of effectiveSuites) {
      for (const test of suite.tests) {
        jobs.push({ suite, test });
      }
    }

    const maxWorkers = Math.max(1, Number(config.workers) || 1);
    const rate = Math.max(0, Number(config.rate) || 0); // ops/sec, 0 = unlimited
    const startGapMs = rate > 0 ? Math.floor(1000 / rate) : 0;
    const delayAfterMs = Math.max(0, Number(config.delayMs) || 0);
    let queueIndex = 0;
    let nextAllowedStart = 0;

    setCurrentTest(`Running with ${maxWorkers} worker${maxWorkers > 1 ? 's' : ''}${rate ? ` @ ${rate}/s` : ''}${delayAfterMs ? ` + ${delayAfterMs}ms delay` : ''}`);

    const runOne = async (_workerId) => {
      while (true) {
        if (queueIndex >= jobs.length) return;
        const myIdx = queueIndex++;
        const { suite, test } = jobs[myIdx];

        // Rate gate across workers
        const now = Date.now();
        if (startGapMs > 0 && now < nextAllowedStart) {
          await sleep(nextAllowedStart - now);
        }
        nextAllowedStart = (Date.now()) + startGapMs;

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
        completed++;
        if (completed <= 5 || completed % 5 === 0 || completed === totalTests) {
          flushResults();
        }

        if (delayAfterMs > 0) {
          await sleep(delayAfterMs);
        }
      }
    };

    try {
      const workers = Array.from({ length: maxWorkers }, (_, i) => runOne(i + 1));
      await Promise.all(workers);
      console.log('[TestRunner] All tests completed:', allResults.length, 'total');
    } catch (error) {
      console.error('[TestRunner] FATAL ERROR during test execution:', error);
      console.error('[TestRunner] Stack:', error.stack);
      alert(`Test runner crashed at test ${testIndex}: ${error.message}\n\nCheck console for details.`);
    } finally {
      // Restore fetch and log simple stats
      try {
        if (typeof window !== 'undefined' && originalFetch && window.fetch !== originalFetch) {
          window.fetch = originalFetch;
        }
      } catch (_) { /* ignore */ }
      const elapsed = Math.max(1, Date.now() - (startAtRef.current || Date.now()));
      const avgRps = (allResults.length / (elapsed / 1000)).toFixed(1);
      console.log(`[TestRunner] Stats: completed=${allResults.length}, rps_avg=${avgRps}, rate_limited_429=${rateLimited429Ref.current || 0}`);
      setUiStats({ avgRps: Number(avgRps), rateLimited429: rateLimited429Ref.current || 0 });
      flushResults();
      setCurrentTest(null);
      setRunning(false);
      sessionStorage.removeItem('test_runner_active'); // Clear running flag
      console.log('[TestRunner] Test run finished. Results:', allResults.length);
      // Remove suppression flags
      if (typeof window !== 'undefined') {
        delete window.__UNIT_TEST_MODE;
        delete window.__UNIT_TEST_SUPPRESS_CODES;
      }
      if (allResults.length !== totalTests) {
        console.warn(`[TestRunner] WARNING: Expected ${totalTests} tests, but only ${allResults.length} completed.`);
      }
    }
  };

  // Periodic sync to recover from accidental unmount/remount or lost state during a run
  // DISABLED: This was causing double-run issues by restoring state mid-run
  // If we need recovery, use the manual restore button instead
  useEffect(() => {
    // Cleanup any existing interval on unmount
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, []);

  // REMOVED: Auto-restore was causing double-run issues
  // Use the manual "Restore Previous Results" button instead
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
    console.log('[TestRunner] CLEARING results via clearResults button');
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
              {isSuperadmin && (
                <div className="flex items-center gap-2 mr-2">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-xs">Workers</span>
                    <Input
                      type="number"
                      min={1}
                      max={32}
                      value={config.workers}
                      disabled={running}
                      onChange={(e) => setConfig((c) => ({ ...c, workers: Math.max(1, Number(e.target.value) || 1) }))}
                      className="w-20 bg-slate-700 border-slate-600 h-8 text-slate-100"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-xs">Rate/s</span>
                    <Input
                      type="number"
                      min={0}
                      max={1000}
                      value={config.rate}
                      disabled={running}
                      onChange={(e) => setConfig((c) => ({ ...c, rate: Math.max(0, Number(e.target.value) || 0) }))}
                      className="w-24 bg-slate-700 border-slate-600 h-8 text-slate-100"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-xs">Delay(ms)</span>
                    <Input
                      type="number"
                      min={0}
                      max={60000}
                      value={config.delayMs}
                      disabled={running}
                      onChange={(e) => setConfig((c) => ({ ...c, delayMs: Math.max(0, Number(e.target.value) || 0) }))}
                      className="w-28 bg-slate-700 border-slate-600 h-8 text-slate-100"
                    />
                  </div>
                </div>
              )}
              {isSuperadmin && (
                <div className="hidden xl:flex items-center gap-2 mr-2">
                  <select
                    className="bg-slate-700 border border-slate-600 text-slate-100 text-xs h-8 px-2 rounded"
                    value={activeProfile}
                    onChange={(e) => loadProfile(e.target.value)}
                    disabled={running}
                  >
                    <option value="">Profiles…</option>
                    {Object.keys(profiles).map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Profile name"
                    className="bg-slate-700 border border-slate-600 text-slate-100 text-xs h-8 px-2 rounded w-36"
                    value={profileNameInput}
                    onChange={(e) => setProfileNameInput(e.target.value)}
                    disabled={running}
                  />
                  <Button
                    variant="outline"
                    className="bg-slate-700 border-slate-600 h-8 px-2 text-xs"
                    disabled={running || !profileNameInput.trim()}
                    onClick={saveProfile}
                  >Save</Button>
                  <Button
                    variant="outline"
                    className="bg-slate-700 border-slate-600 h-8 px-2 text-xs"
                    disabled={running || !activeProfile}
                    onClick={deleteProfile}
                  >Delete</Button>
                </div>
              )}
              {isSuperadmin && (
                <div className="hidden md:flex items-center gap-2 mr-2">
                  <Button
                    variant="outline"
                    className="bg-slate-700 border-slate-600 h-8 px-2 text-xs"
                    disabled={running}
                    onClick={() => setConfig({ workers: 2, rate: 5, delayMs: 25 })}
                  >Balanced</Button>
                  <Button
                    variant="outline"
                    className="bg-slate-700 border-slate-600 h-8 px-2 text-xs"
                    disabled={running}
                    onClick={() => setConfig({ workers: 4, rate: 15, delayMs: 0 })}
                  >Fast</Button>
                  <Button
                    variant="outline"
                    className="bg-slate-700 border-slate-600 h-8 px-2 text-xs"
                    disabled={running}
                    onClick={() => setConfig({ workers: 8, rate: 0, delayMs: 0 })}
                  >Max</Button>
                </div>
              )}
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
              {results.length === 0 && !running && hasStoredResults && (
                <Button
                  onClick={restoreResults}
                  variant="outline"
                  className="bg-slate-700 border-slate-600"
                  disabled={running}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Restore Last Results
                </Button>
              )}
              <Button
                onClick={runTests}
                disabled={running || checking || preflight.status !== "ok" || effectiveSuites.length === 0}
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

          {isSuperadmin && (
            <div className="mb-4 p-3 rounded border border-slate-700 bg-slate-800/60">
              <div className="flex items-center justify-between mb-2">
                <div className="text-slate-300 text-sm font-medium">Suites</div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="bg-slate-700 border-slate-600 h-7 px-2 text-xs"
                    disabled={running}
                    onClick={() => setSelectedCategories(new Set(allSuiteNames))}
                  >Select All</Button>
                  <Button
                    variant="outline"
                    className="bg-slate-700 border-slate-600 h-7 px-2 text-xs"
                    disabled={running}
                    onClick={() => setSelectedCategories(new Set())}
                  >Select None</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {testSuites.map((suite) => (
                  <label key={suite.name} className="flex items-center gap-2 text-slate-200 text-sm">
                    <input
                      type="checkbox"
                      className="accent-blue-500 h-4 w-4"
                      checked={selectedCategories.has(suite.name)}
                      disabled={running}
                      onChange={(e) => {
                        const next = new Set(selectedCategories);
                        if (e.target.checked) next.add(suite.name); else next.delete(suite.name);
                        setSelectedCategories(next);
                      }}
                    />
                    <span>{suite.name}</span>
                    <span className="text-xs text-slate-400">({suite.tests.length})</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {running && currentTest && (
            <Alert className="mb-4 bg-blue-900/30 border-blue-700">
              <Clock className="h-4 w-4 animate-spin" />
              <AlertDescription className="text-blue-300">
                Running: {currentTest}
              </AlertDescription>
            </Alert>
          )}

          {(running || results.length > 0) && (
            <div className="mb-4 grid grid-cols-3 gap-2">
              <Card className="bg-slate-700 border-slate-600">
                <CardContent className="p-3">
                  <div className="text-xs text-slate-400">Avg RPS</div>
                  <div className="text-lg font-semibold text-slate-100">{uiStats.avgRps}</div>
                </CardContent>
              </Card>
              <Card className="bg-slate-700 border-slate-600">
                <CardContent className="p-3">
                  <div className="text-xs text-slate-400">429 Count</div>
                  <div className="text-lg font-semibold text-slate-100">{uiStats.rateLimited429}</div>
                </CardContent>
              </Card>
              <Card className="bg-slate-700 border-slate-600">
                <CardContent className="p-3">
                  <div className="text-xs text-slate-400">Config</div>
                  <div className="text-xs text-slate-200">w:{config.workers} r:{config.rate}/s d:{config.delayMs}ms</div>
                </CardContent>
              </Card>
            </div>
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
              {completedTests > 0 && completedTests !== totalTests && !running && (
                <Card className="bg-yellow-900/30 border-yellow-700 col-span-4">
                  <CardContent className="p-4">
                    <div className="text-sm text-yellow-400">Integrity Warning</div>
                    <div className="text-sm text-yellow-300 mt-1">Missing tests detected: expected {totalTests} but only {completedTests} completed. This usually indicates a component remount or early abort. Results were auto-recovered from storage if possible.</div>
                  </CardContent>
                </Card>
              )}
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
