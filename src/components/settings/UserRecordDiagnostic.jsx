import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";
import { checkUserRecord } from "@/api/functions";
import { toast } from "sonner";

export default function UserRecordDiagnostic() {
  const [email, setEmail] = useState("andrei.byfield@gmail.com");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleCheck = async () => {
    if (!email) {
      toast.error("Please enter an email");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await checkUserRecord({ email });

      if (response.data) {
        setResult(response.data);
      } else {
        toast.error("Failed to check user record");
      }
    } catch (error) {
      console.error("Error checking user:", error);
      toast.error(error.message || "Failed to check user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-slate-100">User Record Diagnostic</CardTitle>
        <p className="text-sm text-slate-400">
          Check what's actually stored in a User's database record
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-slate-300">Email Address</Label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="bg-slate-700 border-slate-600 text-slate-200"
          />
        </div>

        <Button
          onClick={handleCheck}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 w-full"
        >
          {loading
            ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            )
            : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Check
              </>
            )}
        </Button>

        {result && (
          <div className="space-y-4 mt-4">
            {/* User Database Record */}
            <div className="bg-slate-700/50 p-4 rounded">
              <h4 className="font-semibold text-slate-200 mb-3">
                User Database Record
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <span className="text-slate-400">Email:</span>
                <span className="text-slate-200 font-mono text-xs">
                  {result.user_record.email}
                </span>

                <span className="text-slate-400">Full Name:</span>
                <span className="text-slate-200">
                  {result.user_record.full_name}
                </span>

                <span className="text-slate-400">Role:</span>
                <span className="text-cyan-400 font-mono font-bold">
                  {result.user_record.role}
                </span>

                <span className="text-slate-400">Employee Role:</span>
                <span className="text-cyan-400 font-mono">
                  {result.user_record.employee_role || "null"}
                </span>

                <span className="text-slate-400">Tenant ID:</span>
                <span className="text-slate-200 font-mono text-xs">
                  {result.user_record.tenant_id}
                </span>

                <span className="text-slate-400">Access Level:</span>
                <span className="text-slate-200">
                  {result.user_record.access_level || "N/A"}
                </span>
              </div>
            </div>

            {/* RLS Evaluation */}
            <div className="bg-slate-700/50 p-4 rounded">
              <h4 className="font-semibold text-slate-200 mb-3">
                RLS Evaluation
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Is Admin/Superadmin:</span>
                  {result.rls_evaluation.is_admin
                    ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                    : <XCircle className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">
                    Is Power User (role = "power-user"):
                  </span>
                  {result.rls_evaluation.is_power_user
                    ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                    : <XCircle className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">
                    Is Manager (employee_role):
                  </span>
                  {result.rls_evaluation.is_manager
                    ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                    : <XCircle className="w-4 h-4 text-red-400" />}
                </div>
              </div>
            </div>

            {/* Tenant Leads */}
            <div className="bg-slate-700/50 p-4 rounded">
              <h4 className="font-semibold text-slate-200 mb-3">
                Leads in Tenant ({result.tenant_leads_count})
              </h4>
              {result.tenant_leads.length > 0
                ? (
                  <div className="space-y-2">
                    {result.tenant_leads.map((lead) => (
                      <div
                        key={lead.id}
                        className="bg-slate-800/50 p-2 rounded text-xs"
                      >
                        <div className="font-semibold text-slate-200">
                          {lead.name}
                        </div>
                        <div className="text-slate-400">
                          ID: {lead.unique_id}
                        </div>
                        <div className="text-slate-400">
                          Assigned: {lead.assigned_to || "Unassigned"}
                        </div>
                      </div>
                    ))}
                  </div>
                )
                : (
                  <p className="text-slate-400 text-xs">
                    No leads in this tenant
                  </p>
                )}
            </div>

            {/* Verdict */}
            <Alert
              className={result.should_see_leads
                ? "bg-green-900/20 border-green-700"
                : "bg-red-900/20 border-red-700"}
            >
              {result.should_see_leads
                ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                : <AlertTriangle className="h-4 w-4 text-red-400" />}
              <AlertDescription
                className={result.should_see_leads
                  ? "text-green-300"
                  : "text-red-300"}
              >
                <div className="font-semibold mb-1">
                  {result.should_see_leads
                    ? "✅ User SHOULD see all tenant leads"
                    : "❌ User CANNOT see tenant leads"}
                </div>
                {!result.should_see_leads && (
                  <div className="text-xs mt-2">
                    User needs one of: role="admin/superadmin/power-user" OR
                    employee_role="manager"
                  </div>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
