import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Users, ClipboardList, Send, CheckCircle2, Info, AlertTriangle } from "lucide-react";

export default function GuideRequestAccessSection() {
  const copyEmailTemplate = () => {
    const subject = encodeURIComponent("New User Access Request");
    const body = encodeURIComponent([
      "Please review and approve a new user CRM access request.",
      "",
      "Requested User",
      "- Full Name: ",
      "- Email: ",
      "- Role: user",
      "- Tier: Tier1",
      "",
      "Requested Access Details",
      "- Can use softphone: No",
      "- Intended role: user",
      "- Navigation: Dashboard, Contacts, Leads, Opportunities, Activities",
      "",
      "Requested by",
      "- Name: ",
      "- Email: ",
      "- Tier: Tier3 or Tier4",
      "",
      "Notes:",
      "- Add any extra context here (team, manager, timeline)."
    ].join("\n"));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const iconAccent = { color: "var(--accent-color)" };
  const iconPrimary = { color: "var(--primary-color)" };

  return (
    <section id="requesting-access" className="mt-8">
      <div className="mb-4">
        <h2 className="text-xl lg:text-2xl font-bold text-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-700/50 border border-slate-600/50">
            <Users className="w-5 h-5" style={iconAccent} />
          </div>
          Requesting Access for New Users (Tier 3 & Tier 4)
        </h2>
        <p className="text-slate-400 mt-1 text-sm lg:text-base">
          Tier 3 and Tier 4 users can request CRM access for teammates directly from the Employees page. These requests include your
          authorization (your role and tier) and originate from your current tenant.
        </p>
      </div>

      <Alert className="bg-slate-800 border-slate-700 mb-6">
        <AlertDescription className="text-slate-300">
          Settings access is not required. Use the Employees page to submit the request. Only employees marked “has CRM access” and not yet linked will show the Request/Invite option.
        </AlertDescription>
      </Alert>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="border-b border-slate-700">
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <ClipboardList className="w-5 h-5" style={iconPrimary} />
            Step-by-step: Submit a request via Employees
          </CardTitle>
        </CardHeader>
        <CardContent className="text-slate-300 space-y-3">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Open the Employees page.
              <div className="mt-2">
                <Link to={createPageUrl("Employees")}>
                  <Button variant="outline" className="filter-trigger bg-transparent">
                    Go to Employees
                  </Button>
                </Link>
              </div>
            </li>
            <li>Find the employee who needs CRM access and ensure “has CRM access” is enabled on their record.</li>
            <li>In the row actions menu, choose “Request Invite” (Tier 3) or “Invite to CRM” (Tier 4/Admin).</li>
            <li>Confirm the email and name. Submit the request.</li>
          </ol>

          <div className="pt-3">
            <h4 className="font-semibold text-slate-100 mb-2 flex items-center gap-2">
              <Send className="w-4 h-4" style={iconAccent} />
              What gets sent
            </h4>
            <ul className="list-disc pl-5 space-y-2">
              <li>A structured email to admins including requested user details (name, email, requested tier/role).</li>
              <li>Your authorization context: your name, email, role, and tier (Tier 3 or Tier 4).</li>
              <li>Implicit tenant context: the request originates from your current tenant (no separate selection needed).</li>
              <li>Optional requested access flags (e.g., softphone), when provided.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="border-b border-slate-700">
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Info className="w-5 h-5" style={iconPrimary} />
              Tier quick guide
            </CardTitle>
          </CardHeader>
          <CardContent className="text-slate-300 space-y-2">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Tier 3 — Team Lead:</strong> Aggregated dashboards, broader team visibility, request CRM access for team.</li>
              <li><strong>Tier 4 — Power User:</strong> Broad data visibility, can directly invite (if permitted) or request on behalf of team.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="border-b border-slate-700">
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" style={iconAccent} />
              Troubleshooting and fallback
            </CardTitle>
          </CardHeader>
          <CardContent className="text-slate-300 space-y-2">
            <ul className="list-disc pl-5 space-y-1">
              <li>If the “Request/Invite” action isn’t visible, ensure the employee record has “has CRM access” enabled and a valid email.</li>
              <li>If Employees page is unavailable, use the email template below to notify admins manually.</li>
            </ul>
            <div className="pt-2">
              <Button variant="outline" onClick={copyEmailTemplate} className="filter-trigger bg-transparent">
                Use email template
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800 border-slate-700 mt-6">
        <CardHeader className="border-b border-slate-700">
          <CardTitle className="text-slate-100 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" style={iconPrimary} />
            Best practices
          </CardTitle>
        </CardHeader>
        <CardContent className="text-slate-300 space-y-2">
          <ul className="list-disc pl-5 space-y-1">
            <li>Confirm the employee’s email is correct before submitting.</li>
            <li>Include the desired Tier (usually Tier1 for standard users) and any special permissions like softphone.</li>
            <li>Follow up with admins if the user needs time-sensitive access.</li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}