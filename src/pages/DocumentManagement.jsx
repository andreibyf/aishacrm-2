import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  const handleDelete = async (docId) => {
    if (!confirm("Are you sure you want to delete this document? This action cannot be undone.")) {
      return;
    }
    
    setDeletingId(docId);
    try {
      // Delete the entity record (file cleanup will be handled by backend if needed)
      await DocumentationFile.delete(docId);
      setDocuments(prev => prev.filter(doc => doc.id !== docId));
      toast.success("Document deleted successfully!");
    } catch (error) {
      console.error("Failed to delete document:", error);
      toast.error("Failed to delete document. Please try again.");
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
                            onClick={() => handleDelete(doc.id, doc.file_uri)}
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
    </div>
  );
}