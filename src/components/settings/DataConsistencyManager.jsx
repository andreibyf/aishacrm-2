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
import { useTenant } from '@/components/shared/tenantContext';
import { BACKEND_URL } from '@/api/entities';

export default function DataConsistencyManager() {
  const { selectedTenantId } = useTenant();
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);

  const handleScan = async () => {
    setScanning(true);
    setResults(null);
    
    try {
      // Scan all entity types for duplicates
      const entityTypes = [
        { name: 'Contact', fields: ['email'] },
        { name: 'Account', fields: ['name'] },
        { name: 'Lead', fields: ['email'] },
        { name: 'Opportunity', fields: ['name'] },
      ];

      const duplicateResults = {};
      let totalDuplicates = 0;

      for (const entity of entityTypes) {
        const response = await fetch(`${BACKEND_URL}/api/validation/find-duplicates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: selectedTenantId,
            entity_type: entity.name,
            fields: entity.fields,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to scan ${entity.name}`);
        }

        const data = await response.json();
        if (data.status === 'success' && data.data.total > 0) {
          duplicateResults[entity.name] = data.data.groups;
          totalDuplicates += data.data.total;
        }
      }

      setResults({
        success: true,
        totalOrphans: totalDuplicates,
        orphanedRecords: duplicateResults,
      });
    } catch (error) {
      console.error("Error scanning for duplicates:", error);
      alert("Failed to scan for duplicate records: " + error.message);
      setResults({
        success: false,
        totalOrphans: 0,
        orphanedRecords: {},
      });
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
            Detect duplicate records and data quality issues
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-900/30 border-blue-700/50">
            <Info className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300">
              Scans for duplicate records across Contacts, Accounts, Leads, and Opportunities based on key fields like email and name.
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
                Scan for Duplicates
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
                      <strong>Found {results.totalOrphans} duplicate record groups</strong> across {Object.keys(results.orphanedRecords).length} entity types.
                    </AlertDescription>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <AlertDescription className="text-green-300">
                      <strong>Data integrity check passed!</strong> No duplicate records found.
                    </AlertDescription>
                  </>
                )}
              </Alert>

              {results.totalOrphans > 0 && (
                <Card className="bg-slate-900 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100 text-base">Duplicate Record Groups by Entity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(results.orphanedRecords).map(([entity, groups]) => (
                        <div key={entity} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700">
                          <div>
                            <p className="font-medium text-slate-200">{entity}</p>
                            <p className="text-xs text-slate-400">
                              {groups.length} duplicate group{groups.length !== 1 ? 's' : ''} found
                            </p>
                          </div>
                          <Badge variant="destructive" className="bg-red-600 text-white">
                            {groups.length}
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
                    <strong>Next Steps:</strong> Review the duplicate records in your entity lists and merge or delete duplicates as needed.
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