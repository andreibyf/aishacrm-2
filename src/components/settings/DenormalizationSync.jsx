
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, RefreshCw } from "lucide-react"; // Removed CheckCircle, AlertCircle, Zap
import { syncDenormalizedFields } from "@/api/functions";

export default function DenormalizationSync() {
  const [syncing, setSyncing] = useState(null); // Changed to null to indicate no specific mode syncing
  const [result, setResult] = useState(null);

  const handleSync = async (syncMode) => {
    setSyncing(syncMode); // Set to the mode currently syncing
    setResult(null);

    try {
      const payload = {
        mode: syncMode,
        // entityType is removed as per the new UI design, implying 'all' entities or backend default
      };

      const response = await syncDenormalizedFields(payload);
      // Assuming response.data might contain a message or we construct one
      setResult({
        status: 'success',
        message: response.data.message || `Denormalization sync (${syncMode}) completed successfully! Total records: ${response.data.totalSynced || 0}`
      });
    } catch (error) {
      console.error("Sync error:", error);
      setResult({
        status: 'error',
        message: error.message || "Denormalization sync failed"
      });
    } finally {
      setSyncing(null); // Reset to null after sync
    }
  };

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/30 border-blue-700/50">
        <RefreshCw className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          Keep cached data fields synchronized across entities for optimal performance.
        </AlertDescription>
      </Alert>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <RefreshCw className="w-5 h-5 text-cyan-400" />
            Denormalization Sync
          </CardTitle>
          <CardDescription className="text-slate-400">
            Synchronize denormalized fields across all entities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Button
              onClick={() => handleSync('incremental')}
              disabled={syncing !== null} // Disable if any sync is in progress
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {syncing === 'incremental' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                'Incremental Sync'
              )}
            </Button>
            <Button
              onClick={() => handleSync('full')}
              disabled={syncing !== null} // Disable if any sync is in progress
              variant="outline"
              className="bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600"
            >
              {syncing === 'full' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                'Full Sync'
              )}
            </Button>
          </div>

          {result && (
            <Alert className={result.status === 'success' ? 'bg-green-900/30 border-green-700/50' : 'bg-red-900/30 border-red-700/50'}>
              {result.status === 'success' ? (
                <RefreshCw className="h-4 w-4 text-green-400" /> // Using RefreshCw for success as well, based on common patterns
              ) : (
                <RefreshCw className="h-4 w-4 text-red-400" />
              )}
              <AlertDescription className={result.status === 'success' ? 'text-green-300' : 'text-red-300'}>
                {result.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
