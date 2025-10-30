import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Book, CheckCircle, Loader2 } from "lucide-react";
import { seedDocumentation } from "@/api/functions";

export default function DocumentationSeeder() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSeed = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await seedDocumentation();

      if (response.data?.success) {
        setResult(response.data);
      } else {
        setError(
          response.data?.error || response.data?.message ||
            "Failed to seed documentation",
        );
      }
    } catch (err) {
      console.error("Error seeding documentation:", err);
      setError(err.message || "An error occurred while seeding documentation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <Book className="w-6 h-6 text-blue-400" />
          AI Avatar Documentation
        </CardTitle>
        <CardDescription className="text-slate-400">
          Seed the documentation database to enable the AI Avatar to answer
          questions about system workflows, features, and best practices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-200">What gets seeded:</h3>
          <ul className="list-disc list-inside text-sm text-slate-400 space-y-1">
            <li>Getting Started Guide</li>
            <li>Contact Management workflows</li>
            <li>Lead Conversion process</li>
            <li>Sales Pipeline management</li>
            <li>Activity Tracking guide</li>
            <li>BizDev Sources workflow</li>
            <li>AI Features documentation</li>
            <li>Integrations setup</li>
            <li>Reports & Analytics guide</li>
            <li>Cash Flow management</li>
            <li>User Management & Permissions</li>
          </ul>
        </div>

        {result && (
          <Alert className="bg-green-900/30 border-green-700/50">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <AlertDescription className="text-green-300">
              <strong>Success!</strong> {result.message}
              <br />
              <span className="text-sm">
                Created {result.count} documentation records.
              </span>
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert
            variant="destructive"
            className="bg-red-900/30 border-red-700/50"
          >
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">
              <strong>Error:</strong> {error}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSeed}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading
              ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Seeding Documentation...
                </>
              )
              : (
                <>
                  <Book className="w-4 h-4 mr-2" />
                  Seed Documentation
                </>
              )}
          </Button>

          <div className="text-xs text-slate-400">
            This is safe to run multiple times - it won&apos;t create
            duplicates.
          </div>
        </div>

        <div className="text-xs text-slate-500 bg-slate-700/50 p-3 rounded border border-slate-600">
          <strong>Note:</strong>{" "}
          After seeding, users can ask the AI Avatar questions like:
          <ul className="mt-2 space-y-1 ml-4 list-disc">
            <li>&quot;How do I convert a lead?&quot;</li>
            <li>&quot;What are BizDev Sources?&quot;</li>
            <li>&quot;How does the calendar work?&quot;</li>
            <li>&quot;How do I set up integrations?&quot;</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
