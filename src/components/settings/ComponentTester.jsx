
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  ListChecks,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { runComponentTests } from "@/api/functions";

const availableComponents = [
  { id: "ContactManagement", name: "Contact Management", description: "Tests contact CRUD operations and data handling.", lastUpdated: "2024-07-20" },
  { id: "AccountManagement", name: "Account Management", description: "Tests account creation, updates, and associations.", lastUpdated: "2024-07-20" },
  { id: "LeadManagement", name: "Lead Management", description: "Tests lead processing and conversion workflows.", lastUpdated: "2024-07-20" },
  { id: "OpportunityManagement", name: "Opportunity Management", description: "Tests sales pipeline and opportunity tracking.", lastUpdated: "2024-07-20" },
  { id: "ActivityTracking", name: "Activity Tracking", description: "Tests activity creation and status management.", lastUpdated: "2024-07-21" },
  { id: "ReportsAndAnalytics", name: "Reports & Analytics", description: "Tests dashboard statistics and reporting accuracy.", lastUpdated: "2024-07-20" },
  { id: "UserTagging", name: "User Tagging", description: "Tests adding, verifying, and removing user tags.", lastUpdated: "2024-07-22" }
];

export default function QATestRunner() {
    const [testResults, setTestResults] = useState(null);
    const [runningTest, setRunningTest] = useState(null);
    const [selectedComponent, setSelectedComponent] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [expandedTests, setExpandedTests] = useState({});
    const [systemStatus, setSystemStatus] = useState(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [statusError, setStatusError] = useState(null);
    const { toast } = useToast();

    useEffect(() => {
        loadSystemStatus();
    }, []);

    const loadSystemStatus = async () => {
        setStatusLoading(true);
        setStatusError(null);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            try {
                const { checkBackendStatus } = await import("@/api/functions");
                const { data } = await checkBackendStatus({}, { signal: controller.signal });
                
                clearTimeout(timeoutId);
                setSystemStatus(data);
            } catch (functionError) {
                clearTimeout(timeoutId);
                console.warn("Backend status check function not available:", functionError);
                
                setStatusError("Function not available");
                setSystemStatus({
                    overall_status: 'unknown',
                    authenticated: true, 
                    error: `Backend status check function is not available.`,
                    timestamp: new Date().toISOString(),
                    endpoints: {
                        general: { 
                            status: 'unknown', 
                            details: 'Status check function not deployed or failed to load.' 
                        }
                    }
                });
            }
            
        } catch (error) {
            console.warn("System status check failed:", error);
            
            let errorMessage = "Status check unavailable";
            if (error.name === 'AbortError') {
                errorMessage = "Status check timed out";
            } else if (error.message?.includes('Rate limit') || error.response?.status === 429) {
                errorMessage = "Rate limit exceeded";
            } else if (error.response?.status >= 500) {
                errorMessage = "Backend service temporarily unavailable";
            }
            
            setStatusError(errorMessage);
            
            setSystemStatus({
                overall_status: 'unknown',
                authenticated: true, 
                error: `Backend status check is not accessible: ${errorMessage}.`,
                timestamp: new Date().toISOString(),
                endpoints: {
                    general: { 
                        status: 'unknown', 
                        details: 'Status check function unavailable or failed.' 
                    }
                }
            });
        } finally {
            setStatusLoading(false);
        }
    };

    const handleRunTests = async () => {
        if (!selectedComponent) {
            toast({
                variant: "destructive",
                title: "No Component Selected",
                description: "Please select a component to test.",
            });
            return;
        }

        setIsLoading(true);
        setRunningTest(selectedComponent);
        setTestResults(null);
        try {
            const { data } = await runComponentTests({ componentName: selectedComponent });
            
            setTestResults({
                componentName: data.component_name || selectedComponent,
                results: data.report_data || [], // Directly use the results array
                error: data.error || (data.report_data?.length === 0 ? "The test ran but produced no specific result items. This can happen if test dependencies are not met." : null)
            });

            toast({
                title: "Tests Complete",
                description: `${data.component_name || selectedComponent} tests finished.`,
            });
        } catch (error) {
            console.error("Error running component tests:", error);
            toast({
                variant: "destructive",
                title: "Test Execution Error",
                description: error.message || "An unexpected error occurred.",
            });
        } finally {
            setIsLoading(false);
            setRunningTest(null);
        }
    };

    const toggleExpand = (index) => {
        setExpandedTests(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const getStatusColor = (status) => {
        if (status === 'ok' || status === 'healthy') return 'bg-green-500';
        if (status === 'warning' || status === 'degraded') return 'bg-yellow-500';
        if (status === 'error' || status === 'down') return 'bg-red-500';
        return 'bg-gray-500';
    };

    const getStatusText = (status) => {
        if (status === 'ok') return 'Operational';
        if (status === 'unknown') return 'Unknown';
        return status?.charAt(0).toUpperCase() + status?.slice(1) || 'Unknown';
    };

    return (
        <div className="space-y-6">
            {/* System Status Overview */}
            <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-100">
                        <Activity className="w-5 h-5 text-blue-400" />
                        System Status
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadSystemStatus}
                            disabled={statusLoading}
                            className="p-1 h-auto text-slate-300 hover:text-slate-100 hover:bg-slate-600"
                        >
                            {statusLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <RefreshCw className="w-4 h-4" />
                            )}
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {statusLoading ? (
                        <div className="flex items-center justify-center p-4">
                            <Loader2 className="w-6 h-6 animate-spin mr-2 text-slate-400" />
                            <span className="text-slate-300">Checking system status...</span>
                        </div>
                    ) : statusError ? (
                        <div className="p-4 bg-yellow-900/30 text-yellow-300 border border-yellow-700/50 rounded-md">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="font-medium">Status Check Issue</span>
                            </div>
                            <p className="text-sm">
                                {statusError}. The application should still function normally. This is often expected in staging or limited deployment environments.
                            </p>
                        </div>
                    ) : systemStatus ? (
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className={`w-3 h-3 rounded-full ${getStatusColor(systemStatus.overall_status)}`}></div>
                                <span className="text-lg font-semibold text-slate-200">{getStatusText(systemStatus.overall_status)}</span>
                            </div>
                            <p className="text-sm text-slate-400">{systemStatus.error || "All systems operational."}</p>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            {/* Component Test Runner */}
            <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-100">
                        <ListChecks className="w-5 h-5 text-blue-400" />
                        Internal Component Test Runner
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        Run automated tests against key CRM components to verify data handling and rendering.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <Select onValueChange={setSelectedComponent} value={selectedComponent}>
                                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                                    <SelectValue placeholder="Select a component to test..." />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    {availableComponents.map(comp => (
                                        <SelectItem key={comp.id} value={comp.id} className="text-slate-200 hover:bg-slate-700">
                                            <div className="flex flex-col">
                                                <span className="font-medium">{comp.name}</span>
                                                <span className="text-xs text-slate-400">{comp.description} (Updated: {comp.lastUpdated})</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            onClick={handleRunTests}
                            disabled={isLoading || !selectedComponent}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                            {isLoading && runningTest === selectedComponent ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Play className="w-4 h-4 mr-2" />
                            )}
                            {isLoading && runningTest === selectedComponent
                                ? `Running ${selectedComponent} Tests...`
                                : `Test ${selectedComponent || 'Selected'} Module`}
                        </Button>

                        {selectedComponent && (
                            <div className="p-3 bg-blue-900/30 rounded-lg border border-blue-700/50">
                                <h4 className="font-medium text-blue-200">
                                    {availableComponents.find(c => c.id === selectedComponent)?.name}
                                </h4>
                                <p className="text-sm text-blue-300">
                                    {availableComponents.find(c => c.id === selectedComponent)?.description}
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Test Results */}
            {testResults && (
                <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                        <CardTitle className="text-slate-100">Test Results for: {testResults.componentName}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {testResults.results && Array.isArray(testResults.results) && testResults.results.length > 0 ? (
                            testResults.results.map((result, index) => (
                                <Card key={index} className="bg-slate-700 border-slate-600">
                                    <CardHeader
                                        className="flex flex-row items-center justify-between cursor-pointer p-4"
                                        onClick={() => toggleExpand(index)}
                                    >
                                        <div className="flex items-center gap-3">
                                            {result.status === "Success" ? (
                                                <CheckCircle className="w-5 h-5 text-green-500" />
                                            ) : result.status === "Error" ? (
                                                <XCircle className="w-5 h-5 text-red-500" />
                                            ) : result.status === "Warning" ? (
                                                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                            ) : (
                                                <></>
                                            )}
                                            <p className="font-medium text-slate-200">{result.entity ? `${result.entity}: ` : ''}{typeof result.details === 'string' && result.details.length > 100 ? result.details.substring(0, 100) + '...' : typeof result.details === 'string' ? result.details : JSON.stringify(result.details)}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge variant={result.status === "Success" ? "default" : result.status === "Error" ? "destructive" : "secondary"} className="capitalize">
                                                {result.status}
                                            </Badge>
                                            {expandedTests[index] ? <ChevronDown className="w-4 h-4 text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
                                        </div>
                                    </CardHeader>
                                    {expandedTests[index] && (
                                        <CardContent className="p-4 pt-0">
                                            <pre className="text-xs bg-slate-900 text-slate-200 p-3 rounded-md overflow-x-auto">
                                                {JSON.stringify(result.details, null, 2)}
                                            </pre>
                                        </CardContent>
                                    )}
                                </Card>
                            ))
                        ) : (
                            <div className="text-center py-4">
                                <p className="text-slate-400">No test results available or invalid test data format.</p>
                                {testResults.error && (
                                    <Alert variant="default" className="mt-4 text-left bg-blue-900/30 border-blue-700/50">
                                        <AlertTriangle className="h-4 w-4 text-blue-400" />
                                        <AlertTitle className="text-blue-200">Note</AlertTitle>
                                        <AlertDescription className="text-blue-300">
                                            {testResults.error}
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
