
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Server,
  Activity,
  Clock,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Zap,
  Database,
  Eye,
  Loader2, // New icon for loading state
  CheckCircle2 // New icon for healthy state
} from "lucide-react";
// mcpHandler has been replaced with mcpServerPublic for diagnostic purposes.
import { mcpServerPublic } from "@/api/functions";
// mcpToolFinder has been removed as it was a diagnostic tool and is no longer needed.

export default function MCPServerMonitor() {
  const MCP_URL = import.meta.env.VITE_MCP_SERVER_URL || null;
  const localDev = import.meta.env.VITE_USE_BASE44_AUTH !== 'true';
  const usingRealMCP = !!MCP_URL; // If an MCP URL is configured we'll call it directly
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [logs, setLogs] = useState([]);
  const logIdCounter = React.useRef(0); // Counter to ensure unique IDs

  // New state variables for the 'MCP Server Status' card
  const [serverOverallStatus, setServerOverallStatus] = useState('unknown'); // 'healthy', 'offline', 'unknown'
  const [serverStatusLoading, setServerStatusLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState(null); // Timestamp for when the server was last checked

  const addLog = useCallback((level, message, data = null) => {
    logIdCounter.current += 1; // Increment counter for unique ID
    const newLog = {
      id: `log-${Date.now()}-${logIdCounter.current}`, // Unique ID combining timestamp and counter
      timestamp: new Date(),
      level,
      message,
      data,
    };
    setLogs(prev => [newLog, ...prev.slice(0, 49)]); // Keep last 50 logs
  }, []); // addLog does not depend on any external state/props, so an empty dependency array is fine.

  const testMCPConnection = useCallback(async () => {
    setIsTesting(true);
    setServerStatusLoading(true); // Indicate loading for the new status card
    setLastChecked(new Date().toLocaleTimeString()); // Update last checked time
    addLog('info', 'Starting MCP connection test...');

    let handlerToolsFound = 0;
    let newServerOverallStatus = 'offline'; // Assume offline until proven healthy

    // Log if using local mock vs real MCP server
    if (!MCP_URL) {
      addLog('info', 'No MCP URL configured - using local mock implementation for testing.');
    } else {
      addLog('info', `Testing real MCP server at: ${MCP_URL}`);
    }

    try {
      // Test 1: Initialize
      addLog('info', 'Testing MCP initialization (public)...');
      const initResponse = await mcpServerPublic({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize'
      });
      const initResult = initResponse.data; // Access the nested data object

      if (initResult.error) {
        throw new Error(`Init failed: ${initResult.error.message}`);
      }
      addLog('success', `MCP initialization successful.`);

      // Test 2: Tools list via public endpoint
      addLog('info', 'Testing tools list via public MCP endpoint...');
      const handlerToolsResponse = await mcpServerPublic({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      });
      const handlerToolsResult = handlerToolsResponse.data; // Access the nested data object

      if (handlerToolsResult.error) {
        throw new Error(`Public tools list failed: ${handlerToolsResult.error.message}`);
      }
      handlerToolsFound = handlerToolsResult.result?.tools?.length || 0;
      addLog(handlerToolsFound > 0 ? 'success' : 'warning', `Public MCP returned ${handlerToolsFound} tools.`);

      // Test 3: Tool call (public)
      addLog('info', 'Testing tool call (public)...');
      const callResponse = await mcpServerPublic({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_activities',
          arguments: { limit: 1 }
        }
      });
      const callResult = callResponse.data; // Access the nested data object

      if (callResult.error) {
        addLog('warning', `Tool call returned error: ${callResult.error.message}`);
      } else {
        addLog('success', `Tool call successful.`);
      }

      const isSuccess = handlerToolsFound > 0;
      setTestResults({
        status: isSuccess ? 'success' : 'error',
        toolsCount: handlerToolsFound,
        error: isSuccess ? null : 'No tools returned from public MCP'
      });
      newServerOverallStatus = isSuccess ? 'healthy' : 'offline'; // Update for the new card

    } catch (error) {
      addLog('error', `MCP test failed: ${error.message}`);
      setTestResults({
        status: 'error',
        error: error.message,
        toolsCount: handlerToolsFound // Ensure count is available even on error
      });
      newServerOverallStatus = 'offline'; // Set to offline on error
    } finally {
      setIsTesting(false);
      setServerStatusLoading(false); // End loading for the new status card
      setServerOverallStatus(newServerOverallStatus); // Set final status for the new card
    }
  }, [addLog, MCP_URL]); // testMCPConnection depends on addLog and MCP_URL

  const clearLogs = () => {
    setLogs([]);
    addLog('info', 'Logs cleared');
  };

  // Run initial connection test on component mount
  useEffect(() => {
    testMCPConnection();
  }, [testMCPConnection]); // useEffect now depends on testMCPConnection

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/30 border-blue-700/50">
        <Server className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          Monitor the Model Context Protocol (MCP) server health and availability.
        </AlertDescription>
      </Alert>

      {/* New MCP Server Status Card */}
      <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Server className="w-5 h-5 text-purple-400" />
              <div className="flex items-center gap-2">
                <span>MCP Server Status</span>
                {usingRealMCP ? (
                  <Badge className="bg-green-600 text-white">Real MCP</Badge>
                ) : (
                  <Badge className="bg-yellow-600 text-black">Mock MCP</Badge>
                )}
              </div>
            </CardTitle>
            <CardDescription className="text-slate-400">
              Real-time health check of the MCP server
              {localDev && !usingRealMCP && (
                <span className="ml-2 text-xs text-yellow-300">(Local mock active)</span>
              )}
            </CardDescription>
          </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-700">
            <div>
              <p className="font-medium text-slate-200">Server Status</p>
              <p className="text-xs text-slate-400 mt-1">Last checked: {lastChecked || 'Never'}</p>
            </div>
            <div className="flex items-center gap-2">
              {serverStatusLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              ) : serverOverallStatus === 'healthy' ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="text-green-400 font-medium">Healthy</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="text-red-400 font-medium">Offline</span>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing Connection Test and Server Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Test Controls */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Connection Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={testMCPConnection}
              disabled={isTesting}
              className="w-full"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4 mr-2" />
                  Test MCP Server
                </>
              )}
            </Button>

            {testResults && (
              <div className="p-3 bg-gray-700 rounded-lg">
                {testResults.status === 'success' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle className="w-4 h-4" />
                      <span className="font-medium">Tests Passed</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <div>Tools Found: {testResults.toolsCount}</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="font-medium">Test Failed</span>
                    </div>
                    <div className="text-sm space-y-1 text-red-300">
                        <div>Tools Found: {testResults.toolsCount}</div>
                        {testResults.error && <div>Error: {testResults.error}</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Server Info */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Database className="w-4 h-4" />
              Server Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Protocol</span>
              <span className="text-white">JSON-RPC 2.0</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Version</span>
              <span className="text-white">2024-11-05</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Available Tools</span>
              <span className="text-white">{testResults?.toolsCount ?? 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Server Name</span>
              <span className="text-white">ai-sha-crm-server</span>
            </div>
          </CardContent>
        </Card>
      </div>

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
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-center text-gray-400 py-4">
                No logs yet. Run a test to see activity.
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-3 p-2 rounded text-sm ${
                    log.level === 'success' ? 'bg-green-900/20 text-green-300' :
                    log.level === 'error' ? 'bg-red-900/20 text-red-300' :
                    log.level === 'warning' ? 'bg-yellow-900/20 text-yellow-300' :
                    'bg-gray-700 text-gray-300'
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
