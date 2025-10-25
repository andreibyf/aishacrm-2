import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle2, AlertCircle, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SecuritySettings() {
  const [endpoints] = useState([
    { path: '/api/entities', method: 'ALL', protected: true, auth: 'Row-Level Security' },
    { path: '/api/functions', method: 'POST', protected: true, auth: 'User Token' },
    { path: '/api/webhooks', method: 'POST', protected: true, auth: 'API Key Header' },
  ]);

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/30 border-blue-700/50">
        <Shield className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          All API endpoints are protected by Base44&apos;s built-in authentication and RLS (Row-Level Security) policies.
        </AlertDescription>
      </Alert>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Lock className="w-5 h-5 text-green-400" />
            API Endpoint Protection
          </CardTitle>
          <CardDescription className="text-slate-400">
            Overview of authentication methods for your API endpoints
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {endpoints.map((endpoint, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-700">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="bg-slate-700 text-slate-300 border-slate-600">
                      {endpoint.method}
                    </Badge>
                    <code className="text-sm text-slate-200 font-mono">{endpoint.path}</code>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Auth: {endpoint.auth}</p>
                </div>
                <div className="flex items-center gap-2">
                  {endpoint.protected ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <span className="text-sm text-green-400 font-medium">Protected</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-amber-500" />
                      <span className="text-sm text-amber-400 font-medium">Public</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}