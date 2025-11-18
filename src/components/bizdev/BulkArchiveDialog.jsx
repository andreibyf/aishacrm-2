import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Archive,
  X,
  AlertTriangle,
  Loader2,
  Database,
  FileSpreadsheet
} from "lucide-react";
import { toast } from "sonner";
import { callBackendAPI } from "@/api/entities";

export default function BulkArchiveDialog({ sources, onClose, onComplete }) {
  const [archiving, setArchiving] = useState(false);
  const [format, setFormat] = useState('csv');
  const [compress, setCompress] = useState(true);
  const [minimizeRecords, setMinimizeRecords] = useState(false);

  if (!sources || sources.length === 0) return null;

  const handleArchive = async () => {
    setArchiving(true);

    try {
      const response = await callBackendAPI('/api/bizdevsources/archive', {
        method: 'POST',
        body: JSON.stringify({
          bizdev_source_ids: sources.map(s => s.id),
          tenant_id: sources[0]?.tenant_id, // Use tenant_id from first source
          format: format,
          compress: compress,
          remove_after_archive: minimizeRecords
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(
          data.message || `Successfully archived ${sources.length} record(s) to cloud storage`
        );
        
        if (onComplete) {
          onComplete(data.data);
        }
        
        onClose();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || 'Failed to archive records');
      }
    } catch (error) {
      console.error('Archive error:', error);
      toast.error(error.message || 'Failed to archive records. Please try again or contact support.');
    } finally {
      setArchiving(false);
    }
  };

  // Group by batch for display
  const batches = sources.reduce((acc, source) => {
    const batchId = source.batch_id || 'No Batch';
    if (!acc[batchId]) {
      acc[batchId] = [];
    }
    acc[batchId].push(source);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700">
        <CardHeader className="border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Archive className="w-6 h-6 text-blue-400" />
              <div>
                <CardTitle className="text-slate-100">Archive Records</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  Archiving {sources.length} record{sources.length > 1 ? 's' : ''} to secure cloud storage
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={archiving}
              className="text-slate-400 hover:text-slate-300 hover:bg-slate-700"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Information Alert */}
          <Alert className="bg-blue-900/30 border-blue-700">
            <AlertTriangle className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300">
              <p className="font-semibold mb-1">What happens when you archive?</p>
              <p className="text-sm">
                Your records will be safely saved to cloud storage and marked as &quot;Archived&quot; in your system. 
                You can retrieve them later if needed.
              </p>
            </AlertDescription>
          </Alert>

          {/* Batch Summary */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Records to Archive</h3>
            <div className="space-y-2">
              {Object.entries(batches).map(([batchId, batchSources]) => (
                <div key={batchId} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                  <div>
                    <Badge variant="outline" className="border-slate-600 text-slate-300 mb-1">
                      {batchId}
                    </Badge>
                    <p className="text-xs text-slate-400">
                      {batchSources[0].source}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-200">
                      {batchSources.length} record{batchSources.length > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <Label className="text-slate-300 mb-3 block">Save Format</Label>
            <RadioGroup value={format} onValueChange={setFormat} className="space-y-2">
              <div className="flex items-center space-x-2 p-3 bg-slate-700 rounded-lg hover:bg-slate-600 cursor-pointer">
                <RadioGroupItem value="csv" id="format-csv" />
                <Label htmlFor="format-csv" className="flex items-center gap-2 cursor-pointer flex-1">
                  <FileSpreadsheet className="w-4 h-4 text-green-400" />
                  <div>
                    <p className="text-slate-200 font-medium">Spreadsheet (CSV)</p>
                    <p className="text-xs text-slate-400">Easy to open in Excel or Google Sheets</p>
                  </div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Compression Option */}
          <div className="p-4 bg-slate-700 rounded-lg">
            <div className="flex items-start gap-3">
              <Checkbox
                id="compress"
                checked={compress}
                onCheckedChange={setCompress}
                disabled={archiving}
              />
              <div className="flex-1">
                <Label 
                  htmlFor="compress" 
                  className="text-slate-200 cursor-pointer font-medium"
                >
                  Compress files to save storage space
                </Label>
                <p className="text-xs text-slate-400 mt-1">
                  Recommended: Reduces file size by 60-80%
                </p>
              </div>
            </div>
          </div>

          {/* Cleanup Option */}
          <div className="p-4 bg-slate-700 rounded-lg">
            <div className="flex items-start gap-3">
              <Checkbox
                id="minimize-records"
                checked={minimizeRecords}
                onCheckedChange={setMinimizeRecords}
                disabled={archiving}
              />
              <div className="flex-1">
                <Label 
                  htmlFor="minimize-records" 
                  className="text-slate-200 cursor-pointer font-medium"
                >
                  Clean up records after archiving
                </Label>
                <p className="text-xs text-slate-400 mt-1">
                  Removes detailed notes and large text fields to free up space. 
                  Key information stays in the system for easy reference.
                </p>
              </div>
            </div>
          </div>

          {/* Storage Path Info */}
          <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
            <div className="flex items-start gap-2">
              <Database className="w-4 h-4 text-blue-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-300 mb-1">Storage Location</p>
                <p className="text-xs text-blue-400">
                  Your files will be securely stored in the cloud and organized by date
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-slate-700">
            <Button
              onClick={onClose}
              variant="outline"
              disabled={archiving}
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleArchive}
              disabled={archiving}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {archiving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Archiving...
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  Archive Now
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}