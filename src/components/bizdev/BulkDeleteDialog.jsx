import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { BizDevSource } from "@/api/entities";

export default function BulkDeleteDialog({ sources, onClose, onComplete }) {
  const [deleting, setDeleting] = useState(false);

  if (!sources || sources.length === 0) return null;

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to permanently delete ${sources.length} BizDev Source(s)? This action cannot be undone.`)) {
      return;
    }

    setDeleting(true);

    try {
      const results = {
        successful: 0,
        failed: 0,
        errors: []
      };

      // Delete each source individually
      for (const source of sources) {
        try {
          await BizDevSource.delete(source.id);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            id: source.id,
            name: source.company_name || source.source || source.source_name,
            error: error.message
          });
        }
      }

      if (results.failed === 0) {
        toast.success(`Successfully deleted ${results.successful} BizDev Source(s)`);
      } else if (results.successful > 0) {
        toast.warning(`Deleted ${results.successful} of ${sources.length} sources`, {
          description: `${results.failed} record(s) failed to delete`
        });
      } else {
        toast.error('Failed to delete BizDev Sources');
      }

      if (onComplete) {
        onComplete(results);
      }

      onClose();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error.message || 'Failed to delete BizDev Sources');
    } finally {
      setDeleting(false);
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
              <Trash2 className="w-6 h-6 text-red-400" />
              <div>
                <CardTitle className="text-slate-100">Delete BizDev Sources</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  Permanently delete {sources.length} BizDev Source{sources.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              disabled={deleting}
              className="text-slate-400 hover:text-slate-300 hover:bg-slate-700"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Warning Alert */}
          <Alert className="bg-red-900/30 border-red-700">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">
              <p className="font-semibold mb-1">Permanent Deletion</p>
              <p className="text-sm">
                This action cannot be undone. All selected records will be permanently deleted from the database.
                Consider using &quot;Archive&quot; instead if you want to preserve the data.
              </p>
            </AlertDescription>
          </Alert>

          {/* Batch Summary */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Records to Delete</h3>
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

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-slate-700">
            <Button
              onClick={onClose}
              variant="outline"
              disabled={deleting}
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Permanently
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}