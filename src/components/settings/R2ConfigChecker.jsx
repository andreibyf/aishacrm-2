import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from "react-hot-toast"; // Assuming react-hot-toast for toast notifications
import { checkR2Config } from "@/api/functions";

const StatusBadge = ({ status }) => {
    const isSet = status === 'SET';
    return (
        <Badge variant={isSet ? "default" : "destructive"} className={isSet ? "bg-green-100 text-green-800" : ""}>
            {isSet ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
            {status}
        </Badge>
    );
};

export default function R2ConfigChecker() {
    const [checking, setChecking] = useState(false);
    const [results, setResults] = useState(null);

    const runDiagnostics = async () => {
        setChecking(true);
        try {
            const { data: result } = await checkR2Config();
            setResults(result);
            
            if (result.current_env_status.CLOUDFLARE_ACCOUNT_ID === 'MISSING') {
                toast.error('R2 environment variables are missing!');
            } else {
                toast.success('R2 configuration checked successfully');
            }
        } catch (error) {
            console.error('Error checking R2 config:', error);
            toast.error('Failed to check R2 configuration: ' + error.message);
        } finally {
            setChecking(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-blue-600" />
                    R2 Storage Configuration Check
                </CardTitle>
                <CardDescription>
                    Verify that your Cloudflare R2 environment variables are properly configured
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={runDiagnostics} disabled={checking}>
                    {checking ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Checking...</>
                    ) : (
                        "Check R2 Configuration"
                    )}
                </Button>

                {results && (
                    <div className="mt-4 space-y-4">
                        <div className="border rounded-lg p-4">
                            <h3 className="font-semibold mb-2">Environment Variables Status</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between items-center">
                                    <span>CLOUDFLARE_ACCOUNT_ID:</span>
                                    <StatusBadge status={results.current_env_status?.CLOUDFLARE_ACCOUNT_ID || 'MISSING'} />
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>R2_ACCESS_KEY_ID:</span>
                                    <StatusBadge status={results.current_env_status?.R2_ACCESS_KEY_ID || 'MISSING'} />
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>R2_SECRET_ACCESS_KEY:</span>
                                    <StatusBadge status={results.current_env_status?.R2_SECRET_ACCESS_KEY || 'MISSING'} />
                                </div>
                            </div>
                        </div>

                        {results.current_env_status?.CLOUDFLARE_ACCOUNT_ID === 'MISSING' && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                    <strong>Missing R2 Configuration!</strong>
                                    <br />
                                    Please add the missing environment variables in your Base44 Dashboard → App Settings → Environment Variables.
                                    <br />
                                    <strong>Message:</strong> {results.message}
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}