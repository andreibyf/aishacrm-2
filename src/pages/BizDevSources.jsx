import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { BizDevSource } from "@/api/entities";
import { Account } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Plus,
  Search,
  Upload,
  Loader2,
  Archive,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "../components/shared/tenantContext";
import { useApiManager } from "../components/shared/ApiManager";
import { useErrorLog, handleApiError } from "../components/shared/ErrorLogger";
import BizDevSourceForm from "../components/bizdev/BizDevSourceForm";
import BizDevSourceCard from "../components/bizdev/BizDevSourceCard";
import BizDevSourceDetailPanel from "../components/bizdev/BizDevSourceDetailPanel";
import CsvImportDialog from "../components/shared/CsvImportDialog";
import CsvExportButton from "../components/shared/CsvExportButton";
import Pagination from "../components/shared/Pagination";
import RefreshButton from "../components/shared/RefreshButton";
import BulkArchiveDialog from "../components/bizdev/BulkArchiveDialog";
import ArchiveIndexViewer from "../components/bizdev/ArchiveIndexViewer";
import BulkDeleteDialog from "../components/bizdev/BulkDeleteDialog";
import StatusHelper from "../components/shared/StatusHelper";
import { useUser } from "../components/shared/useUser.js";

export default function BizDevSourcesPage() {
  const [sources, setSources] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [selectedSource, setSelectedSource] = useState(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedSources, setSelectedSources] = useState([]);
  const [showBulkArchive, setShowBulkArchive] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showArchiveIndex, setShowArchiveIndex] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [licenseStatusFilter, setLicenseStatusFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { user } = useUser();
  const [bizdevSchema, setBizdevSchema] = useState(null);

  const { selectedTenantId } = useTenant();
  const { cachedRequest, clearCache } = useApiManager();
  const { logError } = useErrorLog();
  const loadingRef = useRef(false);

  useEffect(() => {
    const loadSchema = async () => {
      try {
        const schema = await BizDevSource.schema();
        setBizdevSchema({
          name: 'BizDevSource',
          properties: schema.properties || {},
          required: schema.required || []
        });
      } catch (error) {
        console.error("Failed to load BizDevSource schema:", error);
      }
    };
    loadSchema();
  }, []);

  const loadSources = useCallback(async () => {
    if (!user || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setSelectedSources([]);

    try {
      const filter = { tenant_id: user.tenant_id || selectedTenantId };
      if (!filter.tenant_id) {
        setSources([]);
        setAccounts([]);
        return;
      }

      const [fetchedSources, fetchedAccounts] = await Promise.all([
        cachedRequest(
          'BizDevSource',
          'filter',
          { filter },
          () => BizDevSource.filter(filter, '-created_date', 5000)
        ).catch(err => {
          if (logError) {
            logError(handleApiError('BizDev Sources Page', err));
          }
          return [];
        }),
        cachedRequest(
          'Account',
          'filter',
          { filter },
          () => Account.filter(filter, null, 1000)
        ).catch(err => {
          if (logError) {
            logError(handleApiError('BizDev Sources Page - Accounts', err));
          }
          return [];
        })
      ]);

      setSources(fetchedSources || []);
      setAccounts(fetchedAccounts || []);

      if (fetchedSources && fetchedSources.length >= 5000) {
        toast.warning(`Loaded 5,000 BizDev Sources. There may be more records not displayed. Use filters to narrow your search.`, {
          duration: 5000,
        });
      }

    } catch (error) {
      if (logError) {
        logError(handleApiError('BizDev Sources Page', error));
      }
      toast.error("Failed to load BizDev sources");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [user, selectedTenantId, cachedRequest, logError]);

  useEffect(() => {
    if (user) {
      loadSources();
    }
  }, [user, loadSources]);

  const handleRefresh = () => {
    clearCache();
    loadSources();
  };

  const handleCreate = () => {
    setEditingSource(null);
    setShowForm(true);
  };

  const handleEdit = (source) => {
    setEditingSource(source);
    setShowForm(true);
  };

  // Updated to unified form contract: form now persists record directly and passes result
  const handleFormSubmit = async (result) => {
    try {
      // Optimistically update sources list if editing
      if (result?.id) {
        setSources(prev => {
          const exists = prev.some(s => s.id === result.id);
            return exists ? prev.map(s => s.id === result.id ? result : s) : [result, ...prev];
        });
      }
      toast.success(`BizDev source ${editingSource ? 'updated' : 'created'} successfully`);
    } catch (error) {
      if (logError) logError(handleApiError('BizDev Source Form (post-submit)', error));
    } finally {
      setShowForm(false);
      setEditingSource(null);
      handleRefresh();
    }
  };

  const handleArchive = async (source) => {
    if (!confirm(`Archive "${source.company_name}"? This will mark it as archived but not delete it.`)) {
      return;
    }

    try {
      await BizDevSource.update(source.id, {
        status: "Archived",
        archived_at: new Date().toISOString(),
      });
      toast.success("BizDev source archived");
      handleRefresh();
      if (selectedSource?.id === source.id) {
        setSelectedSource(prev => ({ ...prev, status: "Archived", archived_at: new Date().toISOString() }));
      }
      setShowDetailPanel(false);
    } catch (error) {
      if (logError) {
        logError(handleApiError('BizDev Source Archive', error));
      }
      toast.error("Failed to archive BizDev source");
    }
  };

  const handleViewDetails = (source) => {
    setSelectedSource(source);
    setShowDetailPanel(true);
  };

  const handleImportComplete = () => {
    setShowImportDialog(false);
    handleRefresh();
    toast.success("Import completed successfully");
  };

  const handleUpdate = (updatedSource) => {
    setSources(prev => prev.map(s =>
      s.id === updatedSource.id ? updatedSource : s
    ));
    if (selectedSource?.id === updatedSource.id) {
      setSelectedSource(updatedSource);
    }
  };

  const handlePromote = async (sourceToPromote) => {
    if (!confirm(`Are you sure you want to promote "${sourceToPromote.company_name}" to an Account?`)) {
      return;
    }

    try {
      const result = await BizDevSource.promote(sourceToPromote.id, selectedTenantId);

      toast.success('BizDev source promoted to account', {
        description: `Created account: ${result.account.name}`
      });

      handleRefresh();
      setShowDetailPanel(false);
    } catch (error) {
      if (logError) {
        logError(handleApiError('BizDev Source Promotion', error));
      }
      toast.error(`Failed to promote BizDev source to Account.`);
    }
  };

  const handleSelectSource = (sourceId) => {
    setSelectedSources(prevSelected =>
      prevSelected.includes(sourceId)
        ? prevSelected.filter(id => id !== sourceId)
        : [...prevSelected, sourceId]
    );
  };

  const handleBulkArchive = () => {
    if (selectedSources.length === 0) {
      toast.error("Please select sources to archive");
      return;
    }
    setShowBulkArchive(true);
  };

  const handleArchiveComplete = (result) => {
    setSelectedSources([]);
    handleRefresh();

    if (result && result.archived_count > 0) {
      toast.success(`Archived ${result.archived_count} source(s) to R2`);
    }
  };

  const handleBulkDelete = () => {
    if (selectedSources.length === 0) {
      toast.error("Please select sources to delete");
      return;
    }
    setShowBulkDelete(true);
  };

  const handleDeleteComplete = (result) => {
    setSelectedSources([]);
    handleRefresh();

    if (result && result.deleted > 0) {
      toast.success(`Deleted ${result.deleted} BizDev Source(s)`);
    }
  };

  const handleArchiveRetrieved = () => {
    clearCache();
    loadSources();
    toast.success("Sources list refreshed after archive retrieval");
  };

  const filteredSources = sources.filter((source) => {
    const matchesSearch = !searchTerm ||
      source.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      source.dba_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      source.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      source.phone_number?.includes(searchTerm) ||
      source.city?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || source.status === statusFilter;
    const matchesLicenseStatus = licenseStatusFilter === "all" || source.license_status === licenseStatusFilter;
    const matchesBatch = batchFilter === "all" || source.batch_id === batchFilter;
    const matchesSource = sourceFilter === "all" || source.source === sourceFilter;

    return matchesSearch && matchesStatus && matchesLicenseStatus && matchesBatch && matchesSource;
  });

  const uniqueBatches = [...new Set(sources.map(s => s.batch_id).filter(Boolean))];
  const uniqueSources = [...new Set(sources.map(s => s.source).filter(Boolean))];

  const paginatedSources = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredSources.slice(startIndex, endIndex);
  }, [filteredSources, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredSources.length / pageSize);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    setSelectedSources([]);
  };

  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
    setSelectedSources([]);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, licenseStatusFilter, batchFilter, sourceFilter]);

  const stats = {
    total: sources.length,
    active: sources.filter(s => s.status === "Active").length,
    promoted: sources.filter(s => s.status === "Promoted" || s.status === 'converted').length,
    archived: sources.filter(s => s.status === "Archived").length,
  };

  if (loading && sources.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 flex items-center justify-center rounded-full bg-blue-900/30 border border-blue-700/50">
            <Building2 className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-100">BizDev Sources</h1>
            <p className="text-slate-400">
              Manage business development leads and prospects
              {sources.length > 0 && (
                <span className="ml-2 text-slate-500">
                  • Showing {filteredSources.length.toLocaleString()} of {sources.length.toLocaleString()} total
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={handleRefresh} />
          <Button
            variant="outline"
            onClick={() => setShowArchiveIndex(true)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <Archive className="w-4 h-4 mr-2" />
            View Archives
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowImportDialog(true)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <CsvExportButton
            data={filteredSources}
            filename="bizdev-sources"
            entityName="BizDevSource"
          />
          <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Source
          </Button>
        </div>
      </div>

      {/* Stats Cards - Matching other pages with semi-transparent backgrounds */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 border-slate-700 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-slate-400">Total Sources</p>
                <StatusHelper statusKey="bizdev_total" />
              </div>
              <p className="text-2xl font-bold text-slate-100">{stats.total}</p>
            </div>
            <Building2 className="w-8 h-8 text-blue-400" />
          </div>
        </div>
        
        <div className="bg-green-900/20 border-green-700 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-slate-400">Active</p>
                <StatusHelper statusKey="bizdev_active" />
              </div>
              <p className="text-2xl font-bold text-slate-100">{stats.active}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-400" />
          </div>
        </div>
        
        <div className="bg-blue-900/20 border-blue-700 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-slate-400">Promoted</p>
                <StatusHelper statusKey="bizdev_promoted" />
              </div>
              <p className="text-2xl font-bold text-slate-100">{stats.promoted}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-400" />
          </div>
        </div>
        
        <div className="bg-slate-900/20 border-slate-700 border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-slate-400">Archived</p>
                <StatusHelper statusKey="bizdev_archived" />
              </div>
              <p className="text-2xl font-bold text-slate-100">{stats.archived}</p>
            </div>
            <Archive className="w-8 h-8 text-slate-400" />
          </div>
        </div>
      </div>

      <Card className="bg-slate-800 border-slate-700 mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search sources..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSearchTerm(searchInput);
                      setCurrentPage(1);
                    }
                  }}
                  className="pl-10 bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              {searchTerm && (
                <p className="text-xs text-slate-400 mt-1">
                  {filteredSources.length} result{filteredSources.length !== 1 ? 's' : ''} found
                </p>
              )}
            </div>
            <Select value={statusFilter} onValueChange={(value) => {
              setStatusFilter(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Promoted">Promoted</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={licenseStatusFilter} onValueChange={(value) => {
              setLicenseStatusFilter(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                <SelectValue placeholder="License Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Licenses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
                <SelectItem value="Revoked">Revoked</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Unknown">Unknown</SelectItem>
                <SelectItem value="Not Required">Not Required</SelectItem>
              </SelectContent>
            </Select>
            <Select value={batchFilter} onValueChange={(value) => {
              setBatchFilter(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                <SelectValue placeholder="Batch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Batches</SelectItem>
                {uniqueBatches.map(batch => (
                  <SelectItem key={batch} value={batch}>{batch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={(value) => {
              setSourceFilter(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {uniqueSources.map(source => (
                  <SelectItem key={source} value={source}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700 mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {selectedSources.length > 0 && (
                <>
                  <Badge variant="outline" className="border-blue-600 text-blue-400">
                    {selectedSources.length} selected
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkArchive}
                    className="border-blue-600 text-blue-400 hover:bg-blue-900/30"
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    Archive Selected
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDelete}
                    className="border-red-600 text-red-400 hover:bg-red-900/30"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Selected
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSources([])}
                    className="text-slate-400 hover:text-slate-300"
                  >
                    Clear Selection
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 mb-2">
                No BizDev sources found
              </h3>
              <p className="text-slate-400 mb-4">
                {sources.length === 0
                  ? "Get started by adding your first business development source."
                  : "Try adjusting your filters or search term."}
              </p>
              {sources.length === 0 && (
                <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Source
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedSources.map((source) => (
                <BizDevSourceCard
                  key={source.id}
                  source={source}
                  onClick={handleViewDetails}
                  isSelected={selectedSources.includes(source.id)}
                  onSelect={handleSelectSource}
                  onEdit={handleEdit}
                />
              ))}
            </div>
          )}
        </CardContent>

        {!loading && filteredSources.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredSources.length}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            loading={loading}
          />
        )}
      </Card>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <BizDevSourceForm
              initialData={editingSource}
              onSubmit={handleFormSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingSource(null);
              }}
            />
          </div>
        </div>
      )}

      {showDetailPanel && selectedSource && (
        <BizDevSourceDetailPanel
          bizDevSource={selectedSource}
          accounts={accounts}
          onClose={() => {
            setShowDetailPanel(false);
            setSelectedSource(null);
          }}
          onEdit={() => {
            setShowDetailPanel(false);
            handleEdit(selectedSource);
          }}
          onArchive={() => {
            setShowDetailPanel(false);
            handleArchive(selectedSource);
          }}
          onPromote={handlePromote}
          onUpdate={handleUpdate}
          onRefresh={handleRefresh}
        />
      )}

      {showImportDialog && bizdevSchema && (
        <CsvImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          schema={bizdevSchema}
          onSuccess={handleImportComplete}
        />
      )}

      {showBulkArchive && (
        <BulkArchiveDialog
          sources={sources.filter(s => selectedSources.includes(s.id))}
          onClose={() => setShowBulkArchive(false)}
          onComplete={handleArchiveComplete}
        />
      )}

      {showBulkDelete && (
        <BulkDeleteDialog
          sources={sources.filter(s => selectedSources.includes(s.id))}
          onClose={() => setShowBulkDelete(false)}
          onComplete={handleDeleteComplete}
        />
      )}

      {showArchiveIndex && (
        <ArchiveIndexViewer
          tenantId={user?.tenant_id || selectedTenantId}
          onClose={() => setShowArchiveIndex(false)}
          onRetrieved={handleArchiveRetrieved}
        />
      )}
    </div>
  );
}