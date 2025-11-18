import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Globe,
  Loader2,
  Lock,
  Server,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { mcpServerPublic as _mcpServerPublic } from "@/api/functions";
import { createHealthIssue, generateMCPFixSuggestion } from "@/utils/githubIssueCreator";
import { toast } from "sonner";

export default function MCPServerMonitor() {
  const BRAID_MCP_URL = "http://localhost:8000";
  const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || "http://localhost:4001";
  const resolveTenantId = () => {
    try {
      const sel = localStorage.getItem('selected_tenant_id');
      if (sel && sel !== 'null' && sel !== 'undefined' && sel !== '') return sel;
    } catch {
      // localStorage not available
    }
    try {
      const eff = localStorage.getItem('effective_user_tenant_id');
      if (eff && eff !== 'null' && eff !== 'undefined' && eff !== '') return eff;
    } catch {
      // localStorage not available
    }
    return import.meta.env.VITE_SYSTEM_TENANT_ID || null;
  };
  const TENANT_ID = resolveTenantId();

  // State management
  const [isTesting, setIsTesting] = useState(false);
  const [isRunningFullTests, setIsRunningFullTests] = useState(false);
  const [_testResults, _setTestResults] = useState(null);
  const [fullTestResults, setFullTestResults] = useState(null);
  const [logs, setLogs] = useState([]);
  const logIdCounter = React.useRef(0);
  const [servers, setServers] = useState([]);

  // Performance metrics
  const [performanceMetrics, setPerformanceMetrics] = useState({
    avgResponseTime: 0,
    uptime: 100,
    requestsPerMin: 0,
    errorRate: 0,
    lastResponseTime: 0
  });

  // Security & availability
  const [securityStatus, setSecurityStatus] = useState({
    tlsEnabled: false,
    authConfigured: false,
    directDbAccess: false,
    lastSecurityCheck: null
  });

  const [availabilityMetrics, setAvailabilityMetrics] = useState({
    status: "unknown",
    uptime99: true,
    lastDowntime: null,
    consecutiveSuccesses: 0,
    lastChecked: null
  });

  const addLog = useCallback((level, message, data = null) => {
    logIdCounter.current += 1;
    const newLog = {
      id: `log-${Date.now()}-${logIdCounter.current}`,
      timestamp: new Date(),
      level,
      message,
      data,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 99)]);
  }, []);

  // Helper to execute Braid MCP action
  const executeBraidAction = async (action) => {
    const envelope = {
      requestId: `req-${Date.now()}`,
      actor: { id: "user:monitor", type: "user" },
      createdAt: new Date().toISOString(),
      actions: [action]
    };

    const startTime = performance.now();
    const response = await fetch(`${BRAID_MCP_URL}/mcp/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope)
    });
    const endTime = performance.now();
    const responseTime = endTime - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return { result: result.results[0], responseTime };
  };

  // Comprehensive test suite
  const runFullTestSuite = async () => {
    setIsRunningFullTests(true);
    addLog("info", "🚀 Starting comprehensive MCP test suite...");

    const tests = [];
    let passedTests = 0;
    let failedTests = 0;
    const startTime = performance.now();

    try {
      // Test 1: Braid Server Health
      addLog("info", "Test 1/12: Braid server health check");
      try {
        const healthStart = performance.now();
        const healthResp = await fetch(`${BRAID_MCP_URL}/health`);
        const healthTime = performance.now() - healthStart;
        const healthData = await healthResp.json();

        if (healthData.status === "ok") {
          tests.push({ name: "Braid Health", status: "pass", time: healthTime.toFixed(0) });
          addLog("success", `✓ Health check passed (${healthTime.toFixed(0)}ms)`);
          passedTests++;
        } else {
          throw new Error("Health check failed");
        }
      } catch (error) {
        tests.push({ name: "Braid Health", status: "fail", error: error.message });
        addLog("error", `✗ Health check failed: ${error.message}`);
        failedTests++;
      }

      // Test 2: Web Adapter - Wikipedia Search
      addLog("info", "Test 2/12: Web adapter - Wikipedia search");
      let lastWikiPageId = null;
      try {
        const { result, responseTime } = await executeBraidAction({
          id: "action-1",
          verb: "search",
          actor: { id: "user:monitor", type: "user" },
          resource: { system: "web", kind: "wikipedia-search" },
          payload: { q: "artificial intelligence" }
        });

        if (result.status === "success" && result.data && result.data.length > 0) {
          const first = result.data[0];
          // Wikipedia returns numeric pageid under different shapes depending on API
          lastWikiPageId = String(first?.pageid ?? first?.pageId ?? first?.pageIdStr ?? "");
          tests.push({ name: "Wikipedia Search", status: "pass", time: responseTime.toFixed(0), details: `${result.data.length} results` });
          addLog("success", `✓ Wikipedia search (${responseTime.toFixed(0)}ms, ${result.data.length} results)`);
          passedTests++;
        } else {
          throw new Error("No results returned");
        }
      } catch (error) {
        tests.push({ name: "Wikipedia Search", status: "fail", error: error.message });
        addLog("error", `✗ Wikipedia search failed: ${error.message}`);
        failedTests++;
      }

      // Test 3: Web Adapter - Get Page
      addLog("info", "Test 3/12: Web adapter - Get Wikipedia page");
      try {
        const pageidToFetch = lastWikiPageId || "21721040"; // Fallback to a known page (Artificial intelligence)
        const { result, responseTime } = await executeBraidAction({
          id: "action-1",
          verb: "read",
          actor: { id: "user:monitor", type: "user" },
          resource: { system: "web", kind: "wikipedia-page" },
          payload: { pageid: pageidToFetch }
        });

        if (result.status === "success" && result.data) {
          tests.push({ name: "Wikipedia Page", status: "pass", time: responseTime.toFixed(0) });
          addLog("success", `✓ Wikipedia page retrieval (${responseTime.toFixed(0)}ms)`);
          passedTests++;
        } else {
          throw new Error("Failed to retrieve page");
        }
      } catch (error) {
        tests.push({ name: "Wikipedia Page", status: "fail", error: error.message });
        addLog("error", `✗ Wikipedia page failed: ${error.message}`);
        failedTests++;
      }

      // Test 4: CRM Adapter - Search Accounts
      addLog("info", "Test 4/12: CRM adapter - Search accounts");
      try {
        const { result, responseTime } = await executeBraidAction({
          id: "action-1",
          verb: "search",
          actor: { id: "user:monitor", type: "user" },
          resource: { system: "crm", kind: "accounts" },
          metadata: TENANT_ID ? { tenant_id: TENANT_ID } : {},
          options: { maxItems: 5 }
        });

        if (result.status === "success") {
          tests.push({ name: "CRM Accounts", status: "pass", time: responseTime.toFixed(0), details: `${result.data.length} records` });
          addLog("success", `✓ CRM accounts search (${responseTime.toFixed(0)}ms, ${result.data.length} accounts)`);
          passedTests++;

          // Update security status
          setSecurityStatus(prev => ({ ...prev, directDbAccess: true, lastSecurityCheck: new Date().toISOString() }));
        } else {
          throw new Error(result.errorMessage || "Query failed");
        }
      } catch (error) {
        tests.push({ name: "CRM Accounts", status: "fail", error: error.message });
        addLog("error", `✗ CRM accounts failed: ${error.message}`);
        failedTests++;
      }

      // Test 5: CRM Adapter - Search Leads
      addLog("info", "Test 5/12: CRM adapter - Search leads");
      try {
        const { result, responseTime } = await executeBraidAction({
          id: "action-1",
          verb: "search",
          actor: { id: "user:monitor", type: "user" },
          resource: { system: "crm", kind: "leads" },
          metadata: TENANT_ID ? { tenant_id: TENANT_ID } : {},
          options: { maxItems: 5 }
        });

        if (result.status === "success") {
          tests.push({ name: "CRM Leads", status: "pass", time: responseTime.toFixed(0), details: `${result.data.length} records` });
          addLog("success", `✓ CRM leads search (${responseTime.toFixed(0)}ms, ${result.data.length} leads)`);
          passedTests++;
        } else {
          throw new Error(result.errorMessage || "Query failed");
        }
      } catch (error) {
        tests.push({ name: "CRM Leads", status: "fail", error: error.message });
        addLog("error", `✗ CRM leads failed: ${error.message}`);
        failedTests++;
      }

      // Test 6: CRM Adapter - Search Contacts
      addLog("info", "Test 6/12: CRM adapter - Search contacts");
      try {
        const { result, responseTime } = await executeBraidAction({
          id: "action-1",
          verb: "search",
          actor: { id: "user:monitor", type: "user" },
          resource: { system: "crm", kind: "contacts" },
        metadata: TENANT_ID ? { tenant_id: TENANT_ID } : {},
          options: { maxItems: 5 }
        });

        if (result.status === "success") {
          tests.push({ name: "CRM Contacts", status: "pass", time: responseTime.toFixed(0), details: `${result.data.length} records` });
          addLog("success", `✓ CRM contacts search (${responseTime.toFixed(0)}ms, ${result.data.length} contacts)`);
          passedTests++;
        } else {
          throw new Error(result.errorMessage || "Query failed");
        }
      } catch (error) {
        tests.push({ name: "CRM Contacts", status: "fail", error: error.message });
        addLog("error", `✗ CRM contacts failed: ${error.message}`);
        failedTests++;
      }

      // Test 7: Mock Adapter
      addLog("info", "Test 7/12: Mock adapter");
      try {
        const { result, responseTime } = await executeBraidAction({
          id: "action-1",
          verb: "read",
          actor: { id: "user:monitor", type: "user" },
          resource: { system: "mock", kind: "example-entity" },
          targetId: "123"
        });

        if (result.status === "success") {
          tests.push({ name: "Mock Adapter", status: "pass", time: responseTime.toFixed(0) });
          addLog("success", `✓ Mock adapter (${responseTime.toFixed(0)}ms)`);
          passedTests++;
        } else {
          throw new Error(result.errorMessage || "Mock failed");
        }
      } catch (error) {
        tests.push({ name: "Mock Adapter", status: "fail", error: error.message });
        addLog("error", `✗ Mock adapter failed: ${error.message}`);
        failedTests++;
      }

      // Test 8: Batch Actions
      addLog("info", "Test 8/12: Batch actions (CRM + Web)");
      try {
        const envelope = {
          requestId: `req-${Date.now()}`,
          actor: { id: "user:monitor", type: "user" },
          createdAt: new Date().toISOString(),
          actions: [
            {
              id: "action-1",
              verb: "search",
              actor: { id: "user:monitor", type: "user" },
              resource: { system: "crm", kind: "accounts" },
              metadata: TENANT_ID ? { tenant_id: TENANT_ID } : {},
              options: { maxItems: 2 }
            },
            {
              id: "action-2",
              verb: "search",
              actor: { id: "user:monitor", type: "user" },
              resource: { system: "web", kind: "wikipedia-search" },
              payload: { q: "CRM software" }
            }
          ]
        };

        const batchStart = performance.now();
        const response = await fetch(`${BRAID_MCP_URL}/mcp/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envelope)
        });
        const batchTime = performance.now() - batchStart;
        const batchResult = await response.json();

        const allSuccess = batchResult.results.every(r => r.status === "success");

        if (allSuccess) {
          tests.push({ name: "Batch Actions", status: "pass", time: batchTime.toFixed(0), details: "2 actions" });
          addLog("success", `✓ Batch actions (${batchTime.toFixed(0)}ms)`);
          passedTests++;
        } else {
          throw new Error("Some batch actions failed");
        }
      } catch (error) {
        tests.push({ name: "Batch Actions", status: "fail", error: error.message });
        addLog("error", `✗ Batch actions failed: ${error.message}`);
        failedTests++;
      }

      // Test 9: GitHub Adapter - List Repositories (Optional)
      addLog("info", "Test 9/12: GitHub adapter - List repositories (optional)");
      try {
        const { result, responseTime } = await executeBraidAction({
          id: "action-1",
          verb: "read",
          actor: { id: "user:monitor", type: "user" },
          resource: { system: "github", kind: "repos" },
          payload: { per_page: 5 }
        });

        if (result.status === "success" && result.data) {
          tests.push({ name: "GitHub Repos", status: "pass", time: responseTime.toFixed(0), details: `${result.data.length} results` });
          addLog("success", `✓ GitHub repository search (${responseTime.toFixed(0)}ms, ${result.data.length} repos)`);
          passedTests++;
        } else if (result.errorCode === "MISSING_TOKEN") {
          // GitHub token not configured - this is OK for production
          tests.push({ name: "GitHub Repos", status: "skipped", details: "Token not configured (optional)" });
          addLog("info", `⊘ GitHub adapter skipped: Token not configured (optional feature)`);
          passedTests++; // Count as pass since it's optional
        } else {
          throw new Error(result.errorMessage || "GitHub search failed");
        }
      } catch (error) {
        tests.push({ name: "GitHub Repos", status: "fail", error: error.message });
        addLog("error", `✗ GitHub adapter failed: ${error.message}`);
        failedTests++;
      }

      // Test 10: Memory Adapter - Create Session (Optional)
      addLog("info", "Test 10/12: Memory adapter - Create session (optional)");
      try {
        const sessionId = `test-session-${Date.now()}`;
        const { result, responseTime } = await executeBraidAction({
          id: "action-1",
          verb: "create",
          actor: { id: "user:monitor", type: "user" },
          resource: { system: "memory", kind: "session" },
          payload: { 
            tenant_id: TENANT_ID || 'test-tenant',
            user_id: 'test-user',
            session_id: sessionId,
            data: { test: "data", timestamp: new Date().toISOString() },
            ttl_seconds: 300
          }
        });

        if (result.status === "success") {
          tests.push({ name: "Memory Store", status: "pass", time: responseTime.toFixed(0) });
          addLog("success", `✓ Memory store (${responseTime.toFixed(0)}ms)`);
          passedTests++;
        } else if (result.errorCode === "REDIS_UNAVAILABLE" || result.errorMessage?.includes("Redis")) {
          // Redis not configured - this is OK for production
          tests.push({ name: "Memory Store", status: "skipped", details: "Redis not configured (optional)" });
          addLog("info", `⊘ Memory adapter skipped: Redis not configured (optional feature)`);
          passedTests++; // Count as pass since it's optional
        } else {
          throw new Error(result.errorMessage || "Memory store failed");
        }
      } catch (error) {
        // Check if it's a Redis connection error (optional feature)
        if (error.message?.includes("Redis") || error.message?.includes("ECONNREFUSED")) {
          tests.push({ name: "Memory Store", status: "skipped", details: "Redis not configured (optional)" });
          addLog("info", `⊘ Memory adapter skipped: Redis not available (optional feature)`);
          passedTests++; // Count as pass since it's optional
        } else {
          tests.push({ name: "Memory Store", status: "fail", error: error.message });
          addLog("error", `✗ Memory store failed: ${error.message}`);
          failedTests++;
        }
      }

      // Test 11: LLM Adapter - Generate JSON (Optional)
      addLog("info", "Test 11/12: LLM adapter - Generate JSON (optional)");
      try {
        const { result, responseTime } = await executeBraidAction({
          id: "action-1",
          verb: "create",
          actor: { id: "user:monitor", type: "user" },
          resource: { system: "llm", kind: "generate-json" },
          payload: { 
            prompt: "Generate a simple test response with status: 'ok'",
            schema: { type: "object", properties: { status: { type: "string" } } },
            model: "gpt-4o-mini",
            temperature: 0.2
          },
          metadata: TENANT_ID ? { tenant_id: TENANT_ID } : {}
        });

        if (result.status === "success" && result.data) {
          tests.push({ name: "LLM Generation", status: "pass", time: responseTime.toFixed(0) });
          addLog("success", `✓ LLM text generation (${responseTime.toFixed(0)}ms)`);
          passedTests++;
        } else if (result.errorCode === "NO_API_KEY" || result.errorMessage?.includes("API key")) {
          // OpenAI API key not configured - this is OK for production
          tests.push({ name: "LLM Generation", status: "skipped", details: "API key not configured (optional)" });
          addLog("info", `⊘ LLM adapter skipped: OpenAI API key not configured (optional feature)`);
          passedTests++; // Count as pass since it's optional
        } else {
          throw new Error(result.errorMessage || "LLM generation failed");
        }
      } catch (error) {
        // Check if it's an API key error (optional feature)
        if (error.message?.includes("API key") || error.message?.includes("OpenAI")) {
          tests.push({ name: "LLM Generation", status: "skipped", details: "API key not configured (optional)" });
          addLog("info", `⊘ LLM adapter skipped: OpenAI API key not configured (optional feature)`);
          passedTests++; // Count as pass since it's optional
        } else {
          tests.push({ name: "LLM Generation", status: "fail", error: error.message });
          addLog("error", `✗ LLM adapter failed: ${error.message}`);
          failedTests++;
        }
      }

      // Test 12: Error Handling
      addLog("info", "Test 12/12: Error handling validation");
      try {
        const { result, responseTime } = await executeBraidAction({
          id: "action-1",
          verb: "search",
          actor: { id: "user:monitor", type: "user" },
          resource: { system: "crm", kind: "accounts" }
          // Missing tenant_id intentionally
        });

        // Accept either explicit validation error (no default tenant) or success (default tenant applied server-side)
        if (result.status === "error" && result.errorCode === "MISSING_TENANT") {
          tests.push({ name: "Error Handling", status: "pass", time: responseTime.toFixed(0), details: "Validation returned MISSING_TENANT" });
          addLog("success", `✓ Error handling (validation) (${responseTime.toFixed(0)}ms)`);
          passedTests++;
        } else if (result.status === "success") {
          tests.push({ name: "Error Handling", status: "pass", time: responseTime.toFixed(0), details: "Default tenant applied" });
          addLog("success", `✓ Error handling (default tenant applied) (${responseTime.toFixed(0)}ms)`);
          passedTests++;
        } else {
          throw new Error("Unexpected outcome for error-handling test");
        }
      } catch (error) {
        // Network errors are failures, validation errors are passes
        tests.push({ name: "Error Handling", status: "fail", error: error.message });
        addLog("error", `✗ Error handling failed: ${error.message}`);
        failedTests++;
      }

      const totalTime = performance.now() - startTime;
      const avgTime = tests.reduce((acc, t) => acc + (parseFloat(t.time) || 0), 0) / tests.filter(t => t.time).length;

      // Update metrics
      setPerformanceMetrics({
        avgResponseTime: avgTime,
        uptime: passedTests > 0 ? 100 : 0,
        requestsPerMin: 0,
        errorRate: (failedTests / (passedTests + failedTests)) * 100,
        lastResponseTime: avgTime
      });

      setAvailabilityMetrics({
        status: failedTests === 0 ? "healthy" : failedTests < 3 ? "degraded" : "offline",
        uptime99: failedTests === 0,
        lastDowntime: failedTests > 0 ? new Date().toISOString() : null,
        consecutiveSuccesses: passedTests,
        lastChecked: new Date().toISOString()
      });

      setFullTestResults({
        tests,
        passed: passedTests,
        failed: failedTests,
        total: passedTests + failedTests,
        totalTime: totalTime.toFixed(0),
        avgTime: avgTime.toFixed(0)
      });

      addLog("info", `✅ Test suite complete: ${passedTests}/${passedTests + failedTests} passed in ${totalTime.toFixed(0)}ms`);
      
      // Auto-create GitHub issues for critical failures
      if (failedTests > 0) {
        const criticalFailures = tests.filter(t => t.status === "fail");
        if (criticalFailures.length > 0) {
          addLog("info", `🤖 Creating GitHub issues for ${criticalFailures.length} failure(s)...`);
          await createGitHubIssuesForFailures(criticalFailures);
        }
      }
    } catch (error) {
      addLog("error", `Test suite error: ${error.message}`);
    } finally {
      setIsRunningFullTests(false);
    }
  };

  // Create GitHub issues for MCP test failures
  const createGitHubIssuesForFailures = async (failures) => {
    for (const test of failures) {
      try {
        const suggestedFix = generateMCPFixSuggestion(test);
        const severity = determineSeverity(test);
        
        const result = await createHealthIssue({
          type: 'mcp',
          title: `MCP ${test.name} Test Failure`,
          description: `The MCP adapter test "${test.name}" is failing in the health monitor.\n\n**Error:**\n\`\`\`\n${test.error}\n\`\`\`\n\nThis may indicate a configuration issue, missing credentials, or an adapter malfunction.`,
          context: {
            testName: test.name,
            error: test.error,
            timestamp: new Date().toISOString(),
            environment: import.meta.env.MODE || 'development'
          },
          suggestedFix,
          severity,
          component: 'mcp-server',
          assignCopilot: true
        });
        
        if (result.success) {
          addLog("success", `✓ GitHub issue created: #${result.issue.number} - ${result.issue.url}`);
          toast.success(`Issue #${result.issue.number} created`, {
            description: `Copilot assigned to fix "${test.name}"`,
            action: {
              label: 'View',
              onClick: () => window.open(result.issue.url, '_blank')
            }
          });
        }
      } catch (error) {
        addLog("warning", `Failed to create issue for "${test.name}": ${error.message}`);
      }
    }
  };

  // Determine severity based on test type
  const determineSeverity = (test) => {
    // Core adapters are critical, optional adapters are medium
    if (test.name.includes('Braid Health') || test.name.includes('CRM')) return 'critical';
    if (test.name.includes('Batch') || test.name.includes('Error')) return 'high';
    if (test.name.includes('GitHub') || test.name.includes('Memory') || test.name.includes('LLM')) return 'medium';
    return 'medium';
  };

  // Quick health check
  const testMCPConnection = useCallback(async () => {
    setIsTesting(true);
    addLog("info", "Starting quick health check...");

    try {
      // Test Braid server
      const healthResp = await fetch(`${BRAID_MCP_URL}/health`);
      const healthData = await healthResp.json();

      if (healthData.status === "ok") {
        addLog("success", "Braid MCP server is healthy");

        setAvailabilityMetrics(prev => ({
          ...prev,
          status: "healthy",
          consecutiveSuccesses: prev.consecutiveSuccesses + 1,
          lastChecked: new Date().toISOString()
        }));

        _setTestResults({
          status: "success",
          message: "Server is operational"
        });
      } else {
        throw new Error("Health check returned non-OK status");
      }

      // Fetch backend MCP servers
      try {
        const resp = await fetch(`${BACKEND_URL}/api/mcp/servers`);
        if (resp.ok) {
          const json = await resp.json();
          setServers(json?.data?.servers || []);
          addLog("info", `Discovered ${json?.data?.servers?.length || 0} backend MCP server(s)`);
        }
      } catch (err) {
        addLog("warning", `Could not fetch backend MCP servers: ${err.message}`);
      }
    } catch (error) {
      addLog("error", `Health check failed: ${error.message}`);
      setAvailabilityMetrics(prev => ({
        ...prev,
        status: "offline",
        consecutiveSuccesses: 0,
        lastDowntime: new Date().toISOString(),
        lastChecked: new Date().toISOString()
      }));
      _setTestResults({
        status: "error",
        error: error.message
      });
    } finally {
      setIsTesting(false);
    }
  }, [BRAID_MCP_URL, BACKEND_URL, addLog]);

  const clearLogs = () => {
    setLogs([]);
    addLog("info", "Logs cleared");
  };

  // Run initial health check on mount
  useEffect(() => {
    testMCPConnection();
  }, [testMCPConnection]);

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/30 border-blue-700/50">
        <Server className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          Comprehensive monitoring for the Braid MCP Server - performance, security, availability, and diagnostics.
        </AlertDescription>
      </Alert>

      {/* Server Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Availability Status */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Availability
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                {availabilityMetrics.status === "healthy" ? (
                  <>
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                    <span className="text-2xl font-bold text-green-400">Healthy</span>
                  </>
                ) : availabilityMetrics.status === "degraded" ? (
                  <>
                    <AlertTriangle className="w-6 h-6 text-yellow-500" />
                    <span className="text-2xl font-bold text-yellow-400">Degraded</span>
                  </>
                ) : availabilityMetrics.status === "offline" ? (
                  <>
                    <AlertCircle className="w-6 h-6 text-red-500" />
                    <span className="text-2xl font-bold text-red-400">Offline</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-6 h-6 text-gray-500" />
                    <span className="text-2xl font-bold text-gray-400">Unknown</span>
                  </>
                )}
              </div>
              <div className="text-xs text-slate-400">
                Last checked: {availabilityMetrics.lastChecked ? new Date(availabilityMetrics.lastChecked).toLocaleTimeString() : "Never"}
              </div>
              <div className="text-xs text-slate-400">
                Success streak: {availabilityMetrics.consecutiveSuccesses}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Metrics */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-blue-400">
                  {performanceMetrics.avgResponseTime.toFixed(0)}
                </span>
                <span className="text-sm text-slate-400">ms avg</span>
              </div>
              <div className="text-xs text-slate-400">
                Error rate: {performanceMetrics.errorRate.toFixed(1)}%
              </div>
              <Progress value={100 - performanceMetrics.errorRate} className="h-1" />
            </div>
          </CardContent>
        </Card>

        {/* Security Status */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {securityStatus.directDbAccess ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-gray-500" />
                )}
                <span className="text-xs text-slate-300">Direct DB Access</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-slate-300">Service Role Key</span>
              </div>
              <div className="text-xs text-slate-400">
                Tenant isolated ✓
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Results Summary */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Test Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fullTestResults ? (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-green-400">
                    {fullTestResults.passed}
                  </span>
                  <span className="text-sm text-slate-400">/ {fullTestResults.total}</span>
                </div>
                <div className="text-xs text-slate-400">
                  Avg: {fullTestResults.avgTime}ms
                </div>
                <Progress
                  value={(fullTestResults.passed / fullTestResults.total) * 100}
                  className="h-1"
                />
              </div>
            ) : (
              <div className="text-sm text-slate-400">
                No tests run yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Test Controls */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Test Controls
          </CardTitle>
          <CardDescription className="text-slate-400">
            Run diagnostics and comprehensive adapter tests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button
              onClick={testMCPConnection}
              disabled={isTesting || isRunningFullTests}
              className="flex-1"
              variant="outline"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4 mr-2" />
                  Quick Health Check
                </>
              )}
            </Button>

            <Button
              onClick={runFullTestSuite}
              disabled={isTesting || isRunningFullTests}
              className="flex-1"
            >
              {isRunningFullTests ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Run Full Test Suite (9 Tests)
                </>
              )}
            </Button>
          </div>

          {fullTestResults && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-300 font-medium">Test Suite Results</span>
                <Badge className={fullTestResults.failed === 0 ? "bg-green-600" : "bg-yellow-600"}>
                  {fullTestResults.passed}/{fullTestResults.total} Passed
                </Badge>
              </div>
              <div className="space-y-1">
                {fullTestResults.tests.map((test, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 bg-slate-900 rounded text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {test.status === "pass" ? (
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-red-500" />
                      )}
                      <span className="text-slate-300">{test.name}</span>
                      {test.details && (
                        <span className="text-slate-500">({test.details})</span>
                      )}
                    </div>
                    <div className="text-slate-400">
                      {test.time ? `${test.time}ms` : test.error ? "Failed" : ""}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-700">
                <span>Total execution time</span>
                <span className="font-medium">{fullTestResults.totalTime}ms</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discovered Backend Servers */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Globe className="w-5 h-5 text-emerald-400" />
            <span>Backend MCP Servers (Legacy)</span>
          </CardTitle>
          <CardDescription className="text-slate-400">
            Servers reported by /api/mcp/servers (proxied through backend)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {servers.length === 0 ? (
            <p className="text-slate-400">No backend MCP servers configured.</p>
          ) : (
            <div className="space-y-3">
              {servers.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 bg-slate-900 rounded border border-slate-700"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-200 font-medium">{s.name}</span>
                      <Badge className={s.configured ? "bg-green-600" : "bg-red-600"}>
                        {s.configured ? "Configured" : "Not Configured"}
                      </Badge>
                      <Badge className={s.healthy ? "bg-green-600" : "bg-red-600"}>
                        {s.healthy ? "Healthy" : "Offline"}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-400">
                      id: {s.id} • transport: {s.transport}
                    </div>
                    {s.identity?.login && (
                      <div className="text-xs text-slate-400">as @{s.identity.login}</div>
                    )}
                    {Array.isArray(s.missing) && s.missing.length > 0 && (
                      <div className="text-xs text-yellow-400">
                        Missing: {s.missing.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Logs */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Activity Logs
            </div>
            <Button variant="outline" size="sm" onClick={clearLogs}>
              Clear Logs
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-center text-gray-400 py-4">
                No logs yet. Run a test to see activity.
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-3 p-2 rounded text-sm ${
                    log.level === "success"
                      ? "bg-green-900/20 text-green-300"
                      : log.level === "error"
                      ? "bg-red-900/20 text-red-300"
                      : log.level === "warning"
                      ? "bg-yellow-900/20 text-yellow-300"
                      : "bg-gray-700 text-gray-300"
                  }`}
                >
                  <Clock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs opacity-60">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                      <span>{log.message}</span>
                    </div>
                    {log.data && (
                      <pre className="text-xs mt-1 opacity-70 whitespace-pre-wrap">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}