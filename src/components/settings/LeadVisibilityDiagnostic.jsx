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
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";
import { diagnoseLeadVisibility } from "@/api/functions";
import { fixLeadVisibility } from "@/api/functions";
import { toast } from "sonner";

export default function LeadVisibilityDiagnostic() {
  const [leadId, setLeadId] = useState("");
  const [userEmail, setUserEmail] = useState("andrei.byfield@gmail.com");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fixing, setFixing] = useState(false);

  const handleDiagnose = async () => {
    if (!leadId || !userEmail) {
      toast.error("Please enter both lead ID and user email");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await diagnoseLeadVisibility({ leadId, userEmail });

      if (response.data) {
        setResult(response.data);
      } else {
        toast.error("Failed to diagnose lead visibility");
      }
    } catch (error) {
      console.error("Error diagnosing:", error);
      toast.error(error.message || "Failed to diagnose");
    } finally {
      setLoading(false);
    }
  };

  const handleFix = async () => {
    if (!result) {
      toast.error("Run diagnosis first");
      return;
    }

    // Get the CORRECT tenant ID (from the lead)
    const correctTenantId = result.lead_info.tenant_id;

    if (correctTenantId === "NOT SET ❌") {
      toast.error("Lead has no tenant_id set");
      return;
    }

    setFixing(true);
    try {
      const response = await fixLeadVisibility({
        leadId: result.lead_info.id, // Use lead ID from the result
        userEmail: result.target_user_info.email, // Use user email from the result
        tenantId: correctTenantId,
      });

      if (response.data?.success) {
        toast.success("Fixed! User's tenant_id updated to match the lead.");
        // Re-diagnose to confirm
        setTimeout(() => handleDiagnose(), 1000);
      } else {
        toast.error("Failed to apply fixes");
      }
    } catch (error) {
      console.error("Error fixing:", error);
      toast.error(error.message || "Failed to fix");
    } finally {
      setFixing(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-slate-100">
          Lead Visibility Diagnostic
        </CardTitle>
        <p className="text-sm text-slate-400">
          Diagnose why a user cannot see a specific lead
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-slate-300">Lead ID</Label>
          <Input
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            placeholder="Enter lead ID or unique_id (e.g., LEAD-000001)"
            className="bg-slate-700 border-slate-600 text-slate-200"
          />
        </div>

        <div>
          <Label className="text-slate-300">User Email</Label>
          <Input
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            placeholder="user@example.com"
            className="bg-slate-700 border-slate-600 text-slate-200"
          />
        </div>

        <Button
          onClick={handleDiagnose}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 w-full"
        >
          {loading
            ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Diagnosing...
              </>
            )
            : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Diagnose
              </>
            )}
        </Button>

        {result && (
          <div className="space-y-4 mt-4">
            {/* Lead Info */}
            <div className="bg-slate-700/50 p-3 rounded">
              <h4 className="font-semibold text-slate-200 mb-2">
                Lead Information
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-slate-400">Name:</span>
                <span className="text-slate-200">{result.lead_info.name}</span>

                <span className="text-slate-400">Unique ID:</span>
                <span className="text-slate-200 font-mono text-xs">
                  {result.lead_info.unique_id}
                </span>

                <span className="text-slate-400">Tenant ID:</span>
                <span
                  className={`${
                    result.lead_info.tenant_id === "NOT SET ❌"
                      ? "text-red-400 font-bold"
                      : "text-slate-200"
                  } font-mono text-xs`}
                >
                  {result.lead_info.tenant_id}
                </span>

                <span className="text-slate-400">Created By:</span>
                <span className="text-slate-200 text-xs">
                  {result.lead_info.created_by}
                </span>
              </div>
            </div>

            {/* User Info */}
            <div className="bg-slate-700/50 p-3 rounded">
              <h4 className="font-semibold text-slate-200 mb-2">
                User Information
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-slate-400">Email:</span>
                <span className="text-slate-200 text-xs">
                  {result.target_user_info.email}
                </span>

                <span className="text-slate-400">Tenant ID:</span>
                <span
                  className={`${
                    result.target_user_info.tenant_id === "NOT SET ❌"
                      ? "text-red-400 font-bold"
                      : "text-slate-200"
                  } font-mono text-xs`}
                >
                  {result.target_user_info.tenant_id}
                </span>

                <span className="text-slate-400">Employee Role:</span>
                <span className="text-slate-200">
                  {result.target_user_info.employee_role}
                </span>

                <span className="text-slate-400">Role:</span>
                <span className="text-slate-200">
                  {result.target_user_info.role}
                </span>
              </div>
            </div>

            {/* Visibility Result */}
            <Alert
              className={result.can_see_lead
                ? "bg-green-900/20 border-green-700"
                : "bg-red-900/20 border-red-700"}
            >
              {result.can_see_lead
                ? <CheckCircle2 className="h-4 h-4 text-green-400" />
                : <AlertCircle className="h-4 w-4 text-red-400" />}
              <AlertDescription
                className={result.can_see_lead
                  ? "text-green-300"
                  : "text-red-300"}
              >
                <div className="font-semibold mb-2">
                  {result.can_see_lead
                    ? "✅ User CAN see this lead"
                    : "❌ User CANNOT see this lead"}
                </div>
                <div className="text-xs space-y-1">
                  {result.explanation.map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>

            {/* Suggested Fixes */}
            {result.suggested_fixes && result.suggested_fixes.length > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded">
                <h4 className="font-semibold text-yellow-300 mb-2">
                  Suggested Fixes:
                </h4>
                <ul className="text-sm text-yellow-200 space-y-1 mb-3">
                  {result.suggested_fixes.map((fix, idx) => (
                    <li key={idx}>• {fix.fix}</li>
                  ))}
                </ul>
                <Button
                  onClick={handleFix}
                  disabled={fixing}
                  className="bg-yellow-600 hover:bg-yellow-700 w-full"
                  size="sm"
                >
                  {fixing
                    ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        Applying Fixes...
                      </>
                    )
                    : (
                      "Apply All Fixes"
                    )}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
