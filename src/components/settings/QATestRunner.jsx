
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TestReport } from "@/api/entities"; // Keep TestReport for potential future use or if backend still interacts
import { runComponentTests } from "@/api/functions";
import { testSuites as getTestSuites } from "@/api/functions";
import {
  Loader2,
  TestTube2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Play
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

const statusConfig = {
  success: { color: "text-green-500", icon: CheckCircle, label: "Success" },
  warning: { color: "text-yellow-500", icon: AlertTriangle, label: "Warning" },
  error: { color: "text-red-500", icon: XCircle, label: "Error" },
  running: { color: "text-blue-500", icon: Loader2, label: "Running" },
  untested: { color: "text-slate-500", icon: Clock, label: "Not recently tested" }
};

export default function QATestRunner() {
    const [running, setRunning] = useState(null); // Stores the id of the test currently running, or null
    // Stores an object { rawData: {}, overallStatus: 'success' | 'error' | 'warning' }
    const [result, setResult] = useState(null);

    const [availableSuites, setAvailableSuites] = useState([]);
    const [loadingSuites, setLoadingSuites] = useState(true);

    const loadSuites = useCallback(async () => {
        setLoadingSuites(true);
        try {
            const { data } = await getTestSuites();
            const raw = Array.isArray(data) ? data : (data?.suites || data?.tests || []);
            const normalized = (raw || [])
                .map(s => ({
                    id: s.id || s.key || s.name,
                    name: s.name || s.title || s.id || s.key,
                    description: s.description || s.desc || ""
                }))
                .filter(s => !!s.id);

            setAvailableSuites(normalized);
        } catch (e) {
            console.warn("Failed to load available test suites from backend, falling back to none:", e);
            setAvailableSuites([]);
        } finally {
            setLoadingSuites(false);
        }
    }, []);

    useEffect(() => {
        loadSuites();
    }, [loadSuites]);
    
    const handleRunTest = async (testId) => {
        setRunning(testId);
        setResult(null); // Clear previous results
        toast.info(`Running test suite: ${testId}...`);
        try {
            const { data } = await runComponentTests({ testNames: [testId] });

            let currentOverallStatus;
            let summaryMessage = '';

            // Prioritize a top-level status if present in the response
            if (data && data.status) {
                currentOverallStatus = data.status.toLowerCase();
                summaryMessage = data.summary || `Test suite '${testId}' completed with status: ${data.status}.`;
            } else if (Array.isArray(data?.reports) && data.reports.length > 0) {
                // If reports array exists and is not empty, derive status from reports
                if (data.reports.every((r) => r.status === 'success')) {
                    currentOverallStatus = 'success';
                    summaryMessage = `All ${data.reports.length} checks passed for '${testId}'.`;
                } else if (data.reports.some((r) => r.status === 'error')) {
                    currentOverallStatus = 'error';
                    const errorCount = data.reports.filter(r => r.status === 'error').length;
                    summaryMessage = `${errorCount} checks failed for '${testId}'.`;
                } else {
                    currentOverallStatus = 'warning';
                    const warningCount = data.reports.filter(r => r.status === 'warning').length;
                    summaryMessage = `${warningCount} checks with warnings for '${testId}'.`;
                }
            } else {
                // Default to error if no clear status or reports structure
                currentOverallStatus = 'error';
                summaryMessage = `Failed to get valid reports or status for '${testId}'.`;
            }

            // Ensure the rawData includes a summary for consistent display
            const processedRawData = {
                ...data,
                summary: data?.summary || summaryMessage // Keep existing summary if preferred, else use derived
            };

            setResult({ rawData: processedRawData, overallStatus: currentOverallStatus });

            // Show toast based on derived status
            if (currentOverallStatus === 'success') {
                toast.success(summaryMessage);
            } else if (currentOverallStatus === 'warning') {
                toast.warning(summaryMessage);
            } else { // 'error' or any other unexpected status
                toast.error(summaryMessage);
            }
        } catch (error) {
            console.error("Error running test suite:", error);
            const errorMessage = `Failed to run test suite: ${error.message}`;
            toast.error(errorMessage);
            setResult({
                rawData: { // Structure error details consistently
                    component_name: testId,
                    status: 'error',
                    summary: errorMessage,
                    report_data: [{ check: 'Execution', status: 'error', details: error.message }],
                    error: error.message,
                    timestamp: new Date().toISOString()
                },
                overallStatus: 'error' // Explicitly set error status for catch block
            });
        } finally {
            setRunning(null);
        }
    };
    
    return (
        <div className="space-y-6">
            <Alert className="bg-blue-900/30 border-blue-700/50">
                <TestTube2 className="h-4 w-4 text-blue-400" />
                <AlertDescription className="text-blue-300">
                    Run automated tests to validate system components and functionality.
                </AlertDescription>
            </Alert>

            <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-100">
                        <TestTube2 className="w-5 h-5 text-orange-400" />
                        Test Suites
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Select and run automated tests
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loadingSuites ? (
                        <div className="text-center text-slate-400 py-4">
                            <Loader2 className="w-6 h-6 animate-spin inline-block mr-2"/>
                            <span>Loading available tests…</span>
                        </div>
                    ) : availableSuites.length === 0 ? (
                        <div className="text-center text-slate-400 py-4">
                            No test suites available from server. Please try again later or check backend configuration.
                        </div>
                    ) : (
                        availableSuites.map((test) => (
                            <div key={test.id} className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium text-slate-200">{test.name}</p>
                                        <p className="text-xs text-slate-400 mt-1">{test.description}</p>
                                    </div>
                                    <Button
                                        onClick={() => handleRunTest(test.id)}
                                        disabled={running === test.id || running !== null} // Disable all other buttons if one is running
                                        variant="outline"
                                        size="sm"
                                        className="bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600"
                                    >
                                        {running === test.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                                        {running === test.id ? 'Running' : 'Run Test'}
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            {result && (
                <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-slate-100">
                            {/* Use statusConfig for icon and label based on overallStatus */}
                            {(() => {
                                const statusInfo = statusConfig[result.overallStatus] || statusConfig.untested;
                                const Icon = statusInfo.icon;
                                return (
                                    <>
                                        <Icon className={`h-5 w-5 ${statusInfo.color}`} />
                                        <span>Test Results: {statusInfo.label}</span>
                                    </>
                                );
                            })()}
                        </CardTitle>
                        {result.rawData?.summary && (
                            <CardDescription className="text-slate-400">
                                {result.rawData.summary}
                            </CardDescription>
                        )}
                    </CardHeader>
                    <CardContent>
                        <pre className="bg-slate-900 text-slate-300 p-4 rounded-lg text-xs overflow-auto border border-slate-700">
                            {JSON.stringify(result.rawData, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
