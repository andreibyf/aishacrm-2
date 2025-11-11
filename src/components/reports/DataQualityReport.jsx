import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { analyzeDataQuality } from "@/api/functions";

export default function DataQualityReport({ tenantFilter }) {
  const [loading, setLoading] = useState(true);
  const [qualityData, setQualityData] = useState(null);
  const [error, setError] = useState(null);

  const loadQualityData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("DataQualityReport: Analyzing with filter:", tenantFilter);

      // Extract tenant_id from tenantFilter for the backend call
      const tenant_id = tenantFilter?.tenant_id || null;

      const result = await analyzeDataQuality({ tenant_id });
      console.log("DataQualityReport: Raw result:", result);

      // Check if we got a valid response
      if (!result || !result.data) {
        throw new Error("No data received from analysis");
      }

      const data = result.data;
      console.log("DataQualityReport: Analysis data:", data);

      // Validate the data structure
      if (!data.report) {
        throw new Error("Invalid response format: missing report data");
      }

      // Calculate overall score from entity scores
      const report = data.report;
      const entityScores = {
        Contacts: 100,
        Accounts: 100,
        Leads: 100,
        Opportunities: 100,
      };

      // Calculate scores based on issues
      if (report.contacts) {
        const contactIssues = report.contacts.issues_percentage || 0;
        entityScores.Contacts = Math.round(100 - contactIssues);
      }
      if (report.accounts) {
        const accountIssues = report.accounts.issues_percentage || 0;
        entityScores.Accounts = Math.round(100 - accountIssues);
      }
      if (report.leads) {
        const leadIssues = report.leads.issues_percentage || 0;
        entityScores.Leads = Math.round(100 - leadIssues);
      }

      // Calculate overall score
      const scores = Object.values(entityScores);
      const overallScore = Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length,
      );

      // Format issues for display
      const issues = {
        Contacts: [],
        Accounts: [],
        Leads: [],
        Opportunities: [],
      };

      // Process contacts issues
      if (report.contacts?.issues) {
        const contactIssues = report.contacts.issues;
        if (contactIssues.missing_first_name > 0) {
          issues.Contacts.push({
            field: "First Name",
            issue: "Missing first name",
            count: contactIssues.missing_first_name,
          });
        }
        if (contactIssues.missing_last_name > 0) {
          issues.Contacts.push({
            field: "Last Name",
            issue: "Missing last name",
            count: contactIssues.missing_last_name,
          });
        }
        if (contactIssues.invalid_email > 0) {
          issues.Contacts.push({
            field: "Email",
            issue: "Invalid email format",
            count: contactIssues.invalid_email,
          });
        }
        if (contactIssues.missing_contact_info > 0) {
          issues.Contacts.push({
            field: "Contact Info",
            issue: "Missing both phone and email",
            count: contactIssues.missing_contact_info,
          });
        }
        if (contactIssues.invalid_name_characters > 0) {
          issues.Contacts.push({
            field: "Name",
            issue: "Invalid characters in name",
            count: contactIssues.invalid_name_characters,
          });
        }
      }

      // Process accounts issues
      if (report.accounts?.issues) {
        const accountIssues = report.accounts.issues;
        if (accountIssues.invalid_email > 0) {
          issues.Accounts.push({
            field: "Email",
            issue: "Invalid email format",
            count: accountIssues.invalid_email,
          });
        }
        if (accountIssues.missing_contact_info > 0) {
          issues.Accounts.push({
            field: "Contact Info",
            issue: "Missing both phone and email",
            count: accountIssues.missing_contact_info,
          });
        }
        if (accountIssues.invalid_name_characters > 0) {
          issues.Accounts.push({
            field: "Name",
            issue: "Invalid characters in name",
            count: accountIssues.invalid_name_characters,
          });
        }
      }

      // Process leads issues
      if (report.leads?.issues) {
        const leadIssues = report.leads.issues;
        if (leadIssues.missing_first_name > 0) {
          issues.Leads.push({
            field: "First Name",
            issue: "Missing first name",
            count: leadIssues.missing_first_name,
          });
        }
        if (leadIssues.missing_last_name > 0) {
          issues.Leads.push({
            field: "Last Name",
            issue: "Missing last name",
            count: leadIssues.missing_last_name,
          });
        }
        if (leadIssues.invalid_email > 0) {
          issues.Leads.push({
            field: "Email",
            issue: "Invalid email format",
            count: leadIssues.invalid_email,
          });
        }
        if (leadIssues.missing_contact_info > 0) {
          issues.Leads.push({
            field: "Contact Info",
            issue: "Missing both phone and email",
            count: leadIssues.missing_contact_info,
          });
        }
        if (leadIssues.invalid_name_characters > 0) {
          issues.Leads.push({
            field: "Name",
            issue: "Invalid characters in name",
            count: leadIssues.invalid_name_characters,
          });
        }
      }

      // Generate recommendations
      const recommendations = [];
      if (overallScore < 80) {
        recommendations.push(
          "Review and clean up records with missing or invalid data",
        );
      }
      if (
        Object.values(issues).some((arr) =>
          arr.some((i) => i.field.includes("Email"))
        )
      ) {
        recommendations.push(
          "Validate email addresses to ensure they follow proper format",
        );
      }
      if (
        Object.values(issues).some((arr) =>
          arr.some((i) => i.field.includes("Name"))
        )
      ) {
        recommendations.push(
          "Ensure all contacts and leads have complete name information",
        );
      }
      if (
        Object.values(issues).some((arr) =>
          arr.some((i) => i.issue.includes("contact info"))
        )
      ) {
        recommendations.push(
          "Add phone numbers or emails for records missing contact information",
        );
      }

      setQualityData({
        overallScore,
        entityScores,
        issues,
        recommendations,
      });
    } catch (error) {
      console.error("Error analyzing data quality:", error);
      setError(error.message);
      setQualityData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantFilter]);

  useEffect(() => {
    loadQualityData();
  }, [loadQualityData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <span className="ml-3 text-slate-400">Analyzing data quality...</span>
      </div>
    );
  }

  if (error || !qualityData) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-300 mb-2">
            Unable to Load Data Quality Report
          </h3>
          <p className="text-slate-400 mb-4">
            {error || "Please try again later."}
          </p>
          <Button
            onClick={loadQualityData}
            variant="outline"
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const getScoreColor = (score) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreBadge = (score) => {
    if (score >= 80) {
      return (
        <Badge className="bg-green-900/30 text-green-400 border-green-700">
          Excellent
        </Badge>
      );
    }
    if (score >= 60) {
      return (
        <Badge className="bg-yellow-900/30 text-yellow-400 border-yellow-700">
          Good
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-900/30 text-red-400 border-red-700">
        Needs Improvement
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">
            Data Quality Report
          </h2>
          <p className="text-slate-400">
            Comprehensive analysis of your CRM data quality
          </p>
        </div>
        <Button
          onClick={loadQualityData}
          variant="outline"
          className="bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overall Score */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">
            Overall Data Quality Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div
                className={`text-6xl font-bold ${
                  getScoreColor(qualityData.overallScore)
                }`}
              >
                {qualityData.overallScore}%
              </div>
              <div className="mt-2">
                {getScoreBadge(qualityData.overallScore)}
              </div>
            </div>
            <div className="text-right text-slate-400">
              <p className="text-sm">
                Last analyzed: {new Date().toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entity Scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Object.entries(qualityData.entityScores || {}).map((
          [entity, score],
        ) => (
          <Card key={entity} className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-sm text-slate-300">{entity}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${getScoreColor(score)}`}>
                {score}%
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Issues by Entity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(qualityData.issues || {}).map((
          [entity, entityIssues],
        ) => (
          <Card key={entity} className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-slate-100">{entity} Issues</CardTitle>
              <CardDescription className="text-slate-400">
                {entityIssues.length}{" "}
                issue{entityIssues.length !== 1 ? "s" : ""} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {entityIssues.length === 0
                  ? (
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">No issues found</span>
                    </div>
                  )
                  : (
                    entityIssues.map((issue, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 bg-slate-700/50 rounded-lg"
                      >
                        <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-slate-200 font-medium">
                            {issue.field}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {issue.issue}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Affected records: {issue.count}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recommendations */}
      {qualityData.recommendations && qualityData.recommendations.length > 0 &&
        (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100">
                <Info className="w-5 h-5 text-blue-400" />
                Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {qualityData.recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="border-l-4 border-blue-400 pl-4 py-2"
                  >
                    <p className="text-sm text-slate-200">{rec}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
