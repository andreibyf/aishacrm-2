import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FolderOpen, Search, Trash2, Eye, RefreshCw, FileText, AlertCircle, History, ChevronDown, ChevronUp, User, Clock, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { DocumentationFile } from "@/api/entities";
import { getTenantFilter } from "@/components/shared/tenantUtils";
import { useTenant } from "@/components/shared/tenantContext";
import { CreateFileSignedUrl } from "@/api/integrations";
import { format } from 'date-fns';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUser } from "../components/shared/useUser.js";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import supabase from "@/lib/supabase.js";

export default function DocumentManagement() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const { selectedTenantId } = useTenant();
  const { user } = useUser();
  const [error, setError] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [deletionReason, setDeletionReason] = useState('');
  
  // Deletion history state
  const [deletionHistory, setDeletionHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const HISTORY_PAGE_SIZE = 20;

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'user_guide', label: 'User Guides' },
    { value: 'api_reference', label: 'API References' },
    { value: 'tutorial', label: 'Tutorials' },
    { value: 'policy', label: 'Policies' },
    { value: 'faq', label: 'FAQs' },
    { value: 'receipt', label: 'Receipts' },
    { value: 'invoice', label: 'Invoices' },
    { value: 'other', label: 'Other' },
  ];

  const loadDocuments = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    try {
      const filter = getTenantFilter(user, selectedTenantId);
      const allDocs = await DocumentationFile.filter(filter, '-created_at');
      setDocuments(allDocs);
    } catch (error) {
      console.error("Failed to load documents:", error);
      setError("Failed to load documents. " + error.message);
    } finally {
      setLoading(false);
    }
  }, [user, selectedTenantId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Helper to get auth headers with Supabase session token
  const getAuthHeaders = async () => {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch (err) {
      console.warn('[DocumentManagement] Failed to get auth session:', err.message);
    }
    return headers;
  };

  // Load deletion history when section is opened
  const loadDeletionHistory = useCallback(async (appendOffset = 0) => {
    if (!user) return;
    
    const tenantId = selectedTenantId || user?.tenant_id;
    if (!tenantId) return;

    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001'}/api/documentationfiles/deletion-history?tenant_id=${encodeURIComponent(tenantId)}&limit=${HISTORY_PAGE_SIZE}&offset=${appendOffset}`,
        {
          credentials: 'include',
          headers
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load deletion history');
      }

      const result = await response.json();
      const newData = result.data || [];
      
      if (appendOffset > 0) {
        setDeletionHistory(prev => [...prev, ...newData]);
      } else {
        setDeletionHistory(newData);
      }
      
      setHistoryHasMore(result.pagination?.hasMore || false);
      setHistoryOffset(appendOffset + newData.length);
    } catch (err) {
      console.error("Failed to load deletion history:", err);
      setHistoryError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [user, selectedTenantId]);

  // Load more history entries using current offset
  const loadMoreHistory = useCallback(() => {
    loadDeletionHistory(historyOffset);
  }, [loadDeletionHistory, historyOffset]);

  // Load history when section is opened (reset offset)
  useEffect(() => {
    if (historyOpen) {
      setHistoryOffset(0);
      setDeletionHistory([]);
      loadDeletionHistory(0);
    }
  }, [historyOpen, loadDeletionHistory]);

  const handlePreview = async (fileUri) => {
    try {
      const { signed_url } = await CreateFileSignedUrl({ file_uri: fileUri });
      window.open(signed_url, '_blank');
    } catch (error) {
      console.error("Failed to get signed URL:", error);
      toast.error("Failed to preview document. It might be private or temporary.");
    }
  };

  const openDeleteDialog = (doc) => {
    setDocumentToDelete(doc);
    setDeletionReason('');
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;
    
    if (!deletionReason.trim()) {
      toast.error("Please provide a reason for deletion");
      return;
    }
    
    setDeletingId(documentToDelete.id);
    try {
      // Use tenant from context (already available from useTenant hook at top level)
      const tenantId = selectedTenantId || user?.tenant_id;
      
      // Call backend documentationfiles API with reason parameter for audit trail
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001'}/api/documentationfiles/${documentToDelete.id}?tenant_id=${encodeURIComponent(tenantId)}&reason=${encodeURIComponent(deletionReason.trim())}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete document');
      }

      const result = await response.json();
      
      setDocuments(prev => prev.filter(doc => doc.id !== documentToDelete.id));
      
      if (result.audit_logged) {
        toast.success("Document deleted and audit logged successfully!");
      } else {
        toast.success("Document deleted successfully!");
      }
      
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
      setDeletionReason('');
    } catch (error) {
      console.error("Failed to delete document:", error);
      toast.error(error.message || "Failed to delete document. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const searchMatch = searchTerm.trim() === '' ||
      doc.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

    const categoryMatch = filterCategory === 'all' || doc.category === filterCategory;

    return searchMatch && categoryMatch;
  });

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 lg:p-8 space-y-4 lg:space-y-6">
        <Alert variant="destructive" className="bg-red-900/30 border-red-700/50">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-300">
            {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 space-y-4 lg:space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-full bg-blue-900/30 border border-blue-700/50">
              <FolderOpen className="w-5 h-5 lg:w-7 lg:h-7 text-blue-400" />
            </div>
            Document Management
          </h1>
          <p className="text-slate-400 mt-1 text-sm lg:text-base">
            View, search, and manage all your stored documents.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button
            variant="outline"
            onClick={loadDocuments}
            disabled={loading}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
      
      <Card className="shadow-lg border-0 bg-slate-800 border-slate-700">
        <CardHeader className="border-b border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-lg lg:text-xl text-slate-200">
              Stored Documents ({filteredDocuments.length})
            </CardTitle>
            <CardDescription className="text-slate-400">
              Manage all files uploaded to your CRM.
            </CardDescription>
          </div>
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
              <Input
                placeholder="Search by title, filename, or tag..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-500 focus:border-slate-500 w-full"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full md:w-48 bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                {categories.map(cat => (
                  <SelectItem key={cat.value} value={cat.value} className="hover:bg-slate-700">{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-900/50 border-b border-slate-700">
                  <TableHead className="text-slate-300">Title</TableHead>
                  <TableHead className="text-slate-300 hidden md:table-cell">Category</TableHead>
                  <TableHead className="text-slate-300 hidden lg:table-cell">File Type</TableHead>
                  <TableHead className="text-slate-300 hidden lg:table-cell">Uploaded</TableHead>
                  <TableHead className="text-right text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400" />
                      <p className="text-slate-400 mt-2">Loading documents...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredDocuments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-300 mb-2">No Documents Found</h3>
                      <p className="text-slate-500">Try adjusting your search filters or upload documents through Document Processing.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDocuments.map(doc => (
                    <TableRow key={doc.id} className="border-b border-slate-800 hover:bg-slate-700/50">
                      <TableCell className="font-medium text-slate-200">
                        {doc.title}
                        <p className="text-xs text-slate-400">{doc.file_name}</p>
                      </TableCell>
                      <TableCell className="text-slate-300 hidden md:table-cell capitalize">{doc.category?.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-slate-300 hidden lg:table-cell">{doc.file_type}</TableCell>
                      <TableCell className="text-slate-300 hidden lg:table-cell">
                        {doc.created_at && !isNaN(new Date(doc.created_at).getTime()) 
                          ? format(new Date(doc.created_at), 'MM/dd/yyyy')
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => handlePreview(doc.file_uri)} title="Preview">
                            <Eye className="w-4 h-4 text-slate-400" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            disabled={deletingId === doc.id} 
                            title="Delete"
                            onClick={() => openDeleteDialog(doc)}
                          >
                            {deletingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-500" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Deletion History Section - Visible to all authenticated users */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <Card className="shadow-lg border-0 bg-slate-800 border-slate-700">
            <CollapsibleTrigger asChild>
              <CardHeader className="border-b border-slate-700 cursor-pointer hover:bg-slate-700/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-amber-900/30 border border-amber-700/50">
                      <History className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-slate-200 flex items-center gap-2">
                        Deletion History
                        <Badge variant="outline" className="text-xs bg-slate-700 text-slate-300 border-slate-600">
                          Audit Trail
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-slate-400">
                        View who deleted documents, when, and why
                      </CardDescription>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-slate-400">
                    {historyOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </Button>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <CardContent className="p-0">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400 mr-2" />
                    <span className="text-slate-400">Loading deletion history...</span>
                  </div>
                ) : historyError ? (
                  <div className="p-6">
                    <Alert variant="destructive" className="bg-red-900/30 border-red-700/50">
                      <AlertCircle className="h-4 w-4 text-red-400" />
                      <AlertDescription className="text-red-300">
                        {historyError}
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : deletionHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-300 mb-2">No Deletion Records</h3>
                    <p className="text-slate-500">No documents have been deleted yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-700">
                    {deletionHistory.map((record) => (
                      <div key={record.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                          {/* Document Info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <FileText className="w-4 h-4 text-slate-400" />
                              <span className="font-medium text-slate-200">
                                {record.document_name || 'Unknown Document'}
                              </span>
                              {record.document_type && (
                                <Badge variant="outline" className="text-xs bg-slate-700/50 text-slate-400 border-slate-600">
                                  {record.document_type}
                                </Badge>
                              )}
                            </div>
                            
                            {/* Deletion Reason */}
                            <div className="flex items-start gap-2 mt-2 ml-6">
                              <MessageSquare className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                              <p className="text-sm text-slate-300 italic">
                                &quot;{record.deletion_reason || 'No reason provided'}&quot;
                              </p>
                            </div>
                          </div>
                          
                          {/* User & Time Info */}
                          <div className="flex flex-col gap-1 text-sm lg:text-right lg:min-w-[200px]">
                            <div className="flex items-center gap-2 lg:justify-end">
                              <User className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-300">{record.deleted_by?.name || record.deleted_by?.email || 'Unknown'}</span>
                              {record.deleted_by?.role && (
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${
                                    record.deleted_by.role === 'superadmin' 
                                      ? 'bg-purple-900/30 text-purple-300 border-purple-700/50'
                                      : record.deleted_by.role === 'admin'
                                      ? 'bg-blue-900/30 text-blue-300 border-blue-700/50'
                                      : 'bg-slate-700 text-slate-300 border-slate-600'
                                  }`}
                                >
                                  {record.deleted_by.role}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 lg:justify-end text-slate-400">
                              <Clock className="w-4 h-4" />
                              <span>
                                {record.deleted_at && !isNaN(new Date(record.deleted_at).getTime())
                                  ? format(new Date(record.deleted_at), 'MMM d, yyyy h:mm a')
                                  : 'Unknown time'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Load More button */}
                {!historyLoading && historyHasMore && (
                  <div className="p-4 border-t border-slate-700 flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadMoreHistory}
                      className="bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                    >
                      <History className="w-4 h-4 mr-2" />
                      Load More
                    </Button>
                  </div>
                )}
                
                {/* Refresh button */}
                {!historyLoading && deletionHistory.length > 0 && (
                  <div className={`p-4 ${historyHasMore ? '' : 'border-t border-slate-700'} flex justify-end`}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setHistoryOffset(0); loadDeletionHistory(0); }}
                      className="bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh History
                    </Button>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

      {/* Deletion Reason Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Delete Document</DialogTitle>
            <DialogDescription className="text-slate-400">
              You are about to delete: <span className="font-semibold text-slate-300">{documentToDelete?.title}</span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">
                Reason for deletion <span className="text-red-400">*</span>
              </label>
              <Textarea
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                placeholder="Enter the reason for deleting this document (required for audit trail)..."
                className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-500 min-h-[100px]"
                autoFocus
              />
              <p className="text-xs text-slate-400">
                This will be recorded in the audit log along with your user details and timestamp.
              </p>
            </div>
            
            {user && (
              <div className="text-xs text-slate-500 border-t border-slate-700 pt-3">
                <p>Deleted by: <span className="text-slate-400">{user.email}</span></p>
                <p>Role: <span className="text-slate-400 capitalize">{user.role}</span></p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDocumentToDelete(null);
                setDeletionReason('');
              }}
              className="bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!deletionReason.trim() || deletingId === documentToDelete?.id}
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingId === documentToDelete?.id ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Document'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}