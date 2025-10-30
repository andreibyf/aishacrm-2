import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Mail,
  Phone,
  RefreshCw,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { User } from "@/api/entities";
import { useTenant } from "../components/shared/tenantContext";
import { analyzeDataQuality } from "@/api/functions";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function DataQualityReport() {
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    contacts: false,
    accounts: false,
    leads: false,
  });

  const { selectedTenantId } = useTenant();

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (currentUser) {
      runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, selectedTenantId]);

  const loadUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Failed to load user:", error);
      setError("Failed to load user information");
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    setAnalyzing(true);
    setError(null);

    try {
      const tenantId = selectedTenantId || currentUser?.tenant_id;

      if (!tenantId && currentUser?.role !== "superadmin") {
        setError("No tenant selected");
        return;
      }

      const { data } = await analyzeDataQuality({ tenant_id: tenantId });

      if (data.success) {
        setReport(data.report);
      } else {
        setError(data.error || "Analysis failed");
      }
    } catch (error) {
      console.error("Error analyzing data quality:", error);
      setError(error.message || "Failed to analyze data quality");
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const getQualityColor = (percentage) => {
    if (percentage >= 90) return "text-green-400";
    if (percentage >= 70) return "text-yellow-400";
    return "text-red-400";
  };

  const getQualityBadge = (percentage) => {
    if (percentage >= 90) {
      return (
        <Badge className="bg-green-900/50 text-green-300 border-green-700">
          Excellent
        </Badge>
      );
    }
    if (percentage >= 70) {
      return (
        <Badge className="bg-yellow-900/50 text-yellow-300 border-yellow-700">
          Fair
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-900/50 text-red-300 border-red-700">
        Needs Attention
      </Badge>
    );
  };

  const renderEntitySection = (entityType, entityData, IconComponent) => {
    const qualityPercentage = 100 - entityData.issues_percentage;
    const isExpanded = expandedSections[entityType.toLowerCase()];

    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-700">
                <IconComponent className="w-5 h-5 text-slate-300" />
              </div>
              <div>
                <CardTitle className="text-slate-100">{entityType}</CardTitle>
                <CardDescription className="text-slate-400">
                  {entityData.total_records} total records
                </CardDescription>
              </div>
            </div>
            <div className="text-right">
              <div
                className={`text-3xl font-bold ${
                  getQualityColor(qualityPercentage)
                }`}
              >
                {qualityPercentage.toFixed(1)}%
              </div>
              {getQualityBadge(qualityPercentage)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>Data Quality Score</span>
              <span>{entityData.records_with_issues} issues found</span>
            </div>
            <Progress
              value={qualityPercentage}
              className="h-2"
            />
          </div>

          {/* Issues Summary */}
          <Collapsible
            open={isExpanded}
            onOpenChange={() => toggleSection(entityType.toLowerCase())}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between text-slate-300 hover:text-slate-100 hover:bg-slate-700"
              >
                <span>View Detailed Issues</span>
                {isExpanded
                  ? <ChevronUp className="w-4 h-4" />
                  : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 mt-4">
              {entityData.issues.missing_first_name > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50 border border-slate-600">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-slate-300">Missing First Name</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-slate-800 text-slate-200 border-slate-600"
                  >
                    {entityData.issues.missing_first_name} records
                  </Badge>
                </div>
              )}

              {entityData.issues.missing_last_name > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50 border border-slate-600">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-slate-300">Missing Last Name</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-slate-800 text-slate-200 border-slate-600"
                  >
                    {entityData.issues.missing_last_name} records
                  </Badge>
                </div>
              )}

              {entityData.issues.invalid_name_characters > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50 border border-slate-600">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-slate-300">
                      Invalid Name Characters
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-slate-800 text-slate-200 border-slate-600"
                  >
                    {entityData.issues.invalid_name_characters} records
                  </Badge>
                </div>
              )}

              {entityData.issues.invalid_email > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50 border border-slate-600">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-red-400" />
                    <span className="text-slate-300">Invalid Email Format</span>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-slate-800 text-slate-200 border-slate-600"
                  >
                    {entityData.issues.invalid_email} records
                  </Badge>
                </div>
              )}

              {entityData.issues.missing_contact_info > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-700/50 border border-slate-600">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-red-400" />
                    <span className="text-slate-300">
                      No Contact Info (Email & Phone)
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-slate-800 text-slate-200 border-slate-600"
                  >
                    {entityData.issues.missing_contact_info} records
                  </Badge>
                </div>
              )}

              {entityData.records_with_issues === 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-900/20 border border-green-700/50">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-green-300">
                    No data quality issues found!
                  </span>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    );
  };

  if (loading && !report) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-300">Analyzing data quality...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="bg-red-900/20 border-red-700/50">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <AlertDescription className="text-red-300">
          {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (!report) {
    return (
      <Alert className="bg-slate-800 border-slate-700">
        <AlertTriangle className="w-4 h-4 text-slate-400" />
        <AlertDescription className="text-slate-300">
          No data quality report available.
        </AlertDescription>
      </Alert>
    );
  }

  const overallQuality = 100 - report.overall.issues_percentage;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-blue-900/30 border border-blue-700/50">
              <FileText className="w-7 h-7 text-blue-400" />
            </div>
            Data Quality Report
          </h1>
          <p className="text-slate-400 mt-2">
            Analyze and monitor data quality across your CRM entities
          </p>
        </div>
        <Button
          onClick={runAnalysis}
          disabled={analyzing}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {analyzing
            ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            )
            : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh Report
              </>
            )}
        </Button>
      </div>

      {/* Overall Summary */}
      <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Overall Data Quality</CardTitle>
          <CardDescription className="text-slate-400">
            Aggregated score across all entities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div
                className={`text-6xl font-bold ${
                  getQualityColor(overallQuality)
                }`}
              >
                {overallQuality.toFixed(1)}%
              </div>
              <p className="text-slate-400 mt-2">
                {report.overall.total_records} total records analyzed
              </p>
              <p className="text-slate-500 text-sm">
                {report.overall.records_with_issues} records with issues
              </p>
            </div>
            <div className="text-right">
              {getQualityBadge(overallQuality)}
              <div className="mt-4 space-y-2">
                {overallQuality >= 90 && (
                  <p className="text-sm text-green-400">
                    ✓ Excellent data quality!
                  </p>
                )}
                {overallQuality < 90 && overallQuality >= 70 && (
                  <p className="text-sm text-yellow-400">
                    ⚠ Some issues need attention
                  </p>
                )}
                {overallQuality < 70 && (
                  <p className="text-sm text-red-400">
                    ✗ Critical issues detected
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entity-Specific Reports */}
      <div className="grid gap-6">
        {report.contacts &&
          renderEntitySection("Contacts", report.contacts, Users)}
        {report.accounts &&
          renderEntitySection("Accounts", report.accounts, Building2)}
        {report.leads && renderEntitySection("Leads", report.leads, TrendingUp)}
      </div>

      {/* Recommendations */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Recommendations</CardTitle>
          <CardDescription className="text-slate-400">
            Actions to improve your data quality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-900/20 border border-blue-700/50">
            <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-300 font-medium">
                Review Records with Missing Names
              </p>
              <p className="text-slate-400 text-sm mt-1">
                Update records that are missing first or last names to ensure
                complete contact information.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-900/20 border border-blue-700/50">
            <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-300 font-medium">
                Validate Email Addresses
              </p>
              <p className="text-slate-400 text-sm mt-1">
                Correct or remove invalid email addresses to improve
                communication reliability.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-900/20 border border-blue-700/50">
            <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-300 font-medium">
                Add Contact Information
              </p>
              <p className="text-slate-400 text-sm mt-1">
                Ensure all records have at least one method of contact (email or
                phone number).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-900/20 border border-blue-700/50">
            <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-300 font-medium">
                Clean Invalid Name Characters
              </p>
              <p className="text-slate-400 text-sm mt-1">
                Remove numbers and special characters from name fields (except
                hyphens, apostrophes, and language-specific characters).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
