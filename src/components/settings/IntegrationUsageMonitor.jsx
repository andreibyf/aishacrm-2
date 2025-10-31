
import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button"; // Button is no longer used in the Alert but might be elsewhere or kept for future expansion. Let's remove it if not used.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Loader2, ExternalLink } from 'lucide-react'; // ExternalLink is no longer used, Info replaced by TrendingUp.

export default function IntegrationUsageMonitor() {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState([]);

  useEffect(() => {
    // Simulate fetching data
    const fetchUsageData = async () => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay
      setUsage([
        { name: "CRM Integration", calls: 12450, status: "Active" },
        { name: "Analytics Service", calls: 8760, status: "Active" },
        { name: "Payment Gateway", calls: 5320, status: "Active" },
        { name: "Email Marketing", calls: 3100, status: "Active" },
        { name: "Customer Support Chat", calls: 1980, status: "Active" },
      ]);
      setLoading(false);
    };

    fetchUsageData();
  }, []);

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/30 border-blue-700/50">
        <TrendingUp className="h-4 w-4 text-blue-400" />
        <AlertTitle className="sr-only">Integration Usage Information</AlertTitle> {/* Added sr-only as the title text is moved to description */}
        <AlertDescription className="text-blue-300">
          Track API call volume and monitor integration health across all services.
        </AlertDescription>
      </Alert>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Integration Usage Statistics
          </CardTitle>
          <CardDescription className="text-slate-400">
            API calls in the last 30 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          ) : (
            <div className="space-y-3">
              {usage.map((service, idx) => (
                <div key={idx} className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-200">{service.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{service.calls} calls</p>
                    </div>
                    <Badge variant="outline" className="bg-slate-700 text-slate-300 border-slate-600">
                      {service.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {/* Add a button to Base44 dashboard if still desired for more detailed info */}
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="mb-3 text-slate-400 text-sm">
                  For detailed billing and credit information, please visit your Base44 dashboard.
                </p>
                <Button 
                  onClick={() => window.open('https://base44.com/dashboard', '_blank')}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Go to Base44 Dashboard
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
