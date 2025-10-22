import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { cleanupTestRecords } from "@/api/functions";
import { useApiManager } from "../shared/ApiManager";

export default function TestDataManager() {
  const [cleaning, setCleaning] = useState(false);
  const [lastCleanup, setLastCleanup] = useState(null);
  const { clearCache } = useApiManager();

  const handleCleanup = async () => {
    if (!confirm("Are you sure you want to delete ALL test data? This action cannot be undone.")) {
      return;
    }

    setCleaning(true);
    try {
      const result = await cleanupTestRecords();
      console.log("Cleanup result:", result);

      // Clear the frontend cache to force re-fetching on other pages
      clearCache();
      console.log("Frontend API cache cleared.");

      setLastCleanup(new Date().toISOString());
      toast.success("Test data cleaned up successfully! Dashboard stats will refresh on next load.");

    } catch (error) {
      console.error("Cleanup failed:", error);
      toast.error("Failed to cleanup test data. Please try again.");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <Trash2 className="w-6 h-6 text-orange-600" />
          Test Data Management
        </CardTitle>
        <CardDescription className="text-slate-400">
          Cleanup test records from your system to ensure data accuracy for production.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive" className="bg-red-900/30 border-red-700/50">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-500 text-sm [&_p]:leading-relaxed">
            <strong>Production Deployment Warning:</strong> Before publishing your app to production, 
            make sure to clean up all test data. Test data can confuse real users and affect analytics.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2 text-slate-200">What gets cleaned up:</h3>
            <ul className="list-disc list-inside text-sm text-slate-400 space-y-1">
              <li>All contacts marked as test data</li>
              <li>All accounts marked as test data</li>
              <li>All leads marked as test data</li>
              <li>All opportunities marked as test data</li>
              <li>All activities marked as test data</li>
              <li>Associated notes and documents</li>
            </ul>
          </div>

          {lastCleanup && (
            <Alert className="bg-green-900/30 border-green-700/50">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-300">
                Last cleanup performed: {new Date(lastCleanup).toLocaleString()}
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleCleanup}
            disabled={cleaning}
            variant="destructive"
            className="w-full bg-red-600 hover:bg-red-700 text-white"
          >
            {cleaning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Cleaning up test data...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Clean Up All Test Data
              </>
            )}
          </Button>

          <div className="text-xs text-slate-400 bg-slate-700/50 p-3 rounded border border-slate-600">
            <strong>Pro Tip:</strong> During development, always create test records with the "Test Data" 
            checkbox enabled. This makes cleanup much easier before going live.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}