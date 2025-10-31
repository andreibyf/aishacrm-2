
import { useState, useEffect, useCallback } from 'react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Bot } from 'lucide-react'; // Added Bot, removed unused icons
import { format } from 'date-fns';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert"; // New import

import { listPerformanceLogs } from "@/api/functions";

const _LogDetailDialog = ({ log }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 bg-slate-700 border-slate-600 hover:bg-slate-600">Details</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl bg-slate-900 border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle>Log Details: {log.function_name}</DialogTitle>
          <DialogDescription>
            {format(new Date(log.created_date), 'PPP p')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
          {log.error_message && (
            <div>
              <h4 className="font-semibold text-red-400 mb-2">Error Message</h4>
              <pre className="bg-red-900/20 p-3 rounded-md text-sm text-red-300 whitespace-pre-wrap">{log.error_message}</pre>
            </div>
          )}
          {log.payload && (
            <div>
              <h4 className="font-semibold text-blue-400 mb-2">Request Payload</h4>
              <pre className="bg-slate-800 p-3 rounded-md text-sm text-slate-300 whitespace-pre-wrap">{JSON.stringify(log.payload, null, 2)}</pre>
            </div>
          )}
          {log.response && (
             <div>
              <h4 className="font-semibold text-green-400 mb-2">Final Response / Plan</h4>
              <pre className="bg-slate-800 p-3 rounded-md text-sm text-slate-300 whitespace-pre-wrap">{JSON.stringify(log.response, null, 2)}</pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function AIExecutionLogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Expanded list to capture all AI-related executions (and cron runner visibility)
      const functionNames = [
        // Core AI pipeline
        "mcpHandler",
        "generateAIPlan",
        "executeAIPlan",
        "processAICommand",
        "processChatCommand",
        // Chat/LLM wrappers
        "aiRun",
        "aiToken",
        "invokeTenantLLM",
        "invokeSystemOpenAI",
        "testSystemOpenAI",
        "generateEntitySummary",
        // Voice / MCP servers
        "voiceCommand",
        "handleVoiceCommand",
        "mcpServer",
        "mcpServerPublic",
        "mcpServerSimple",
        "mcpServerDebug",
        // Cron+Schedulers
        "cronHeartbeat",
        "cronHeartbeat.duration",
        "cronJobRunner",
        "processScheduledAICalls",
        "processScheduledAIEmails"
      ];

      // Use backend function to avoid entity GET network errors and respect admin auth
      const { data } = await listPerformanceLogs({ limit: 50, functionNames });
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
    } catch (error) {
      console.error("Failed to load execution logs:", error);
      // Fallback to empty logs and keep UI responsive
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Auto-refresh every 30s to keep logs up-to-date
  useEffect(() => {
    const id = setInterval(() => {
      loadLogs();
    }, 30000);
    return () => clearInterval(id);
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/30 border-blue-700/50">
        <Bot className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          View detailed logs of AI function calls and responses for debugging and optimization.
        </AlertDescription>
      </Alert>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Bot className="w-5 h-5 text-purple-400" />
            AI Execution Logs
          </CardTitle>
          <CardDescription className="text-slate-400">
            Recent AI function invocations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center p-8 text-slate-400">
              No AI execution logs available
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log, idx) => (
                <div key={idx} className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-slate-700 text-slate-300 border-slate-600">
                          {log.function_name}
                        </Badge>
                        <Badge className={log.status === 'success' ? 'bg-green-600' : 'bg-red-600'}>
                          {log.status}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-slate-300">
                        Response Time: {log.response_time_ms}ms
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {new Date(log.created_date).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
