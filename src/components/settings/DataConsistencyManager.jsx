import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  Database, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  Info
} from "lucide-react";
import { detectOrphanedRecords } from "@/api/functions";

export default function DataConsistencyManager() {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);

  const handleScan = async () => {
    setScanning(true);
    try {
      const response = await detectOrphanedRecords();
      setResults(response.data);
    } catch (error) {
      console.error("Error scanning for orphans:", error);
      alert("Failed to scan for orphaned records: " + error.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Database className="w-5 h-5 text-pink-400" />
            Data Consistency Manager
          </CardTitle>
          <CardDescription className="text-slate-400">
            Detect and fix orphaned records and invalid foreign key references
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-900/30 border-blue-700/50">
            <Info className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300">
              <strong>Phase 1 Implementation:</strong> This tool helps maintain referential integrity by finding records with invalid references to accounts, employees, contacts, or leads.
            </AlertDescription>
          </Alert>

          <Button
            onClick={handleScan}
            disabled={scanning}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Scan for Orphans
              </>
            )}
          </Button>

          {results && (
            <div className="space-y-4 mt-4">
              <Alert className={results.totalOrphans > 0 ? "bg-amber-900/30 border-amber-700/50" : "bg-green-900/30 border-green-700/50"}>
                {results.totalOrphans > 0 ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <AlertDescription className="text-amber-300">
                      <strong>Found {results.totalOrphans} orphaned records</strong> across {Object.keys(results.orphanedRecords).length} entities.
                    </AlertDescription>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <AlertDescription className="text-green-300">
                      <strong>Data integrity check passed!</strong> No orphaned records found.
                    </AlertDescription>
                  </>
                )}
              </Alert>

              {results.totalOrphans > 0 && (
                <Card className="bg-slate-900 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100 text-base">Orphaned Records by Entity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(results.orphanedRecords).map(([entity, records]) => (
                        <div key={entity} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700">
                          <div>
                            <p className="font-medium text-slate-200">{entity}</p>
                            <p className="text-xs text-slate-400">
                              {records.length} record{records.length !== 1 ? 's' : ''} with invalid references
                            </p>
                          </div>
                          <Badge variant="destructive" className="bg-red-600 text-white">
                            {records.length}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {results.totalOrphans > 0 && (
                <Alert className="bg-slate-900 border-slate-700">
                  <Info className="h-4 w-4 text-blue-400" />
                  <AlertDescription className="text-slate-300">
                    <strong>Next Steps:</strong> Review the orphaned records in the Data Diagnostics page to clean them up or reassign valid references.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}