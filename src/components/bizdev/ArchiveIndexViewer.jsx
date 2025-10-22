import React, { useState, useEffect } from "react";
import { ArchiveIndex } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Archive,
  Search,
  Download,
  RotateCcw,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { retrieveArchiveFromR2 } from "@/api/functions";

export default function ArchiveIndexViewer({ tenantId, onClose, onRetrieved }) {
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retrieving, setRetrieving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [reactivateMode, setReactivateMode] = useState('all');
  
  const [searchTerm, setSearchTerm] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");

  useEffect(() => {
    loadArchives();
  }, [tenantId]);

  const loadArchives = async () => {
    if (!tenantId) return;

    setLoading(true);
    try {
      const filter = {
        tenant_id: tenantId,
        entity_type: "BizDevSource"
      };
      
      const fetchedArchives = await ArchiveIndex.filter(filter, '-archived_at', 100);
      setArchives(fetchedArchives || []);
    } catch (error) {
      console.error("Failed to load archives:", error);
      toast.error("Failed to load archive index");
    } finally {
      setLoading(false);
    }
  };

  const handleRetrieveClick = (archive) => {
    setSelectedArchive(archive);
    setShowConfirmDialog(true);
  };

  const handleConfirmRetrieve = async () => {
    if (!selectedArchive) return;

    setRetrieving(true);
    setShowConfirmDialog(false);

    try {
      const response = await retrieveArchiveFromR2({
        archive_index_id: selectedArchive.id,
        reactivate_mode: reactivateMode
      });

      if (response.status === 200) {
        const result = response.data;
        toast.success(
          `Retrieved ${result.rehydrated_count} records from archive`,
          {
            description: result.skipped_count > 0 
              ? `${result.skipped_count} records were skipped (already exist)`
              : undefined
          }
        );
        
        // Callback to refresh the main page
        if (onRetrieved) {
          onRetrieved();
        }
      } else {
        throw new Error(response.data?.error || 'Retrieval failed');
      }
    } catch (error) {
      console.error("Archive retrieval failed:", error);
      toast.error("Failed to retrieve archive", {
        description: error.message || 'An error occurred'
      });
    } finally {
      setRetrieving(false);
      setSelectedArchive(null);
    }
  };

  const filteredArchives = archives.filter((archive) => {
    const matchesSearch = !searchTerm ||
      archive.batch_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      archive.source_description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      archive.archive_path?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesBatch = batchFilter === "all" || archive.batch_id === batchFilter;
    const matchesFormat = formatFilter === "all" || archive.file_format === formatFilter;

    return matchesSearch && matchesBatch && matchesFormat;
  });

  const uniqueBatches = [...new Set(archives.map(a => a.batch_id).filter(Boolean))];

  const formatFileSize = (bytes) => {
    if (!bytes) return "N/A";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-lg p-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
          <p className="text-slate-300 mt-4">Loading archives...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
          <CardHeader className="border-b border-slate-700 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Archive className="w-5 h-5 text-blue-400" />
                Archive Index
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-300"
                disabled={retrieving}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6 flex-1 overflow-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search archives..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              <Select value={batchFilter} onValueChange={setBatchFilter}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                  <SelectValue placeholder="Filter by batch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Batches</SelectItem>
                  {uniqueBatches.map(batch => (
                    <SelectItem key={batch} value={batch}>{batch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={formatFilter} onValueChange={setFormatFilter}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                  <SelectValue placeholder="Filter by format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Formats</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredArchives.length === 0 ? (
              <div className="text-center py-12">
                <Archive className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-300 mb-2">
                  No archives found
                </h3>
                <p className="text-slate-400">
                  {archives.length === 0
                    ? "No BizDev sources have been archived yet."
                    : "Try adjusting your filters or search term."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredArchives.map((archive) => (
                  <Card key={archive.id} className="bg-slate-700 border-slate-600 hover:border-blue-500 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-slate-100">
                              {archive.source_description || "BizDev Archive"}
                            </h3>
                            <Badge variant="outline" className="text-xs">
                              {archive.file_format?.toUpperCase()}
                            </Badge>
                            {archive.is_accessible ? (
                              <Badge variant="outline" className="text-xs text-green-400 border-green-600">
                                Accessible
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-red-400 border-red-600">
                                Unavailable
                              </Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-slate-400">Batch ID</p>
                              <p className="text-slate-200 font-mono text-xs">
                                {archive.batch_id || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400">Records</p>
                              <p className="text-slate-200 font-medium">
                                {archive.record_count}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400">File Size</p>
                              <p className="text-slate-200 font-medium">
                                {formatFileSize(archive.file_size_bytes)}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400">Archived</p>
                              <p className="text-slate-200">
                                {format(new Date(archive.archived_at), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>

                          <div className="mt-2">
                            <p className="text-xs text-slate-400">
                              <span className="font-mono">{archive.archive_path}</span>
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Archived by: {archive.archived_by}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetrieveClick(archive)}
                            disabled={!archive.is_accessible || retrieving}
                            className="border-green-600 text-green-400 hover:bg-green-900/30"
                          >
                            {retrieving && selectedArchive?.id === archive.id ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4 mr-2" />
                            )}
                            Retrieve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>

          <div className="border-t border-slate-700 p-4 flex-shrink-0">
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>Showing {filteredArchives.length} of {archives.length} archives</span>
              <Button
                variant="outline"
                onClick={loadArchives}
                disabled={retrieving}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Confirm Archive Retrieval
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              You are about to retrieve{" "}
              <span className="font-semibold text-slate-100">
                {selectedArchive?.record_count} records
              </span>{" "}
              from archive:
              <div className="mt-2 p-3 bg-slate-700 rounded-lg">
                <p className="text-sm font-medium text-slate-200">
                  {selectedArchive?.source_description}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Batch: {selectedArchive?.batch_id}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                Reactivation Mode
              </label>
              <Select value={reactivateMode} onValueChange={setReactivateMode}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    Reactivate existing + Create new
                  </SelectItem>
                  <SelectItem value="new_only">
                    Only create new records (skip existing)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-2">
                {reactivateMode === 'all' 
                  ? "This will reactivate archived records and create any that don't exist."
                  : "This will only create records that don't already exist in the database."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              className="border-slate-600 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmRetrieve}
              className="bg-green-600 hover:bg-green-700"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Retrieve Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}