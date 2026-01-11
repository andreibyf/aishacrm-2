import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FolderOpen, Search, Trash2, Eye, RefreshCw, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { DocumentationFile } from "@/api/entities";
import { getTenantFilter } from "@/components/shared/tenantUtils";
import { useTenant } from "@/components/shared/tenantContext";
import { CreateFileSignedUrl } from "@/api/integrations";
import { format } from 'date-fns';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUser } from "../components/shared/useUser.js";

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
      
      // Call backend v2 API with reason parameter
      const response = await fetch(
        `${import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001'}/api/v2/documents/${documentToDelete.id}?tenant_id=${encodeURIComponent(tenantId)}&reason=${encodeURIComponent(deletionReason.trim())}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
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