
import { useState, useEffect } from 'react';
import { DocumentationFile } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { getTenantFilter } from '../shared/tenantUtils';

export default function ProcessingHistory({ user }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;
      setLoading(true);
      try {
        // Use proper tenant filtering
        const filter = getTenantFilter(user);
        console.log('ProcessingHistory: Using filter:', filter);
        
        const files = await DocumentationFile.filter(filter, '-created_date');
        console.log('ProcessingHistory: All files found:', files.length);
        
        // Only show documents that were actually processed (either for cash flow OR created from AI document processing)
        const processedFiles = files.filter(f => {
          const isProcessed = f.processed_for_cashflow === true || 
                             (f.ai_doc_source_type && ['business_card', 'document_extraction'].includes(f.ai_doc_source_type));
          
          // Debug logging to see what's being filtered
          if (f.title?.includes('Design Document') || f.title?.includes('Admin Guide') || f.title?.includes('User Guide')) {
            console.log('ProcessingHistory: System document found (should be filtered out):', {
              title: f.title,
              tenant_id: f.tenant_id,
              ai_doc_source_type: f.ai_doc_source_type,
              processed_for_cashflow: f.processed_for_cashflow,
              isProcessed
            });
          }
          
          return isProcessed;
        });
        
        console.log('ProcessingHistory: Filtered processed files:', processedFiles.length);
        setHistory(processedFiles);
      } catch (error) {
        console.error("Failed to load processing history:", error);
        setHistory([]);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [user]);

  const getStatus = (item) => {
    if (item.processed_for_cashflow) {
      return { text: 'Processed', icon: CheckCircle, color: 'text-green-400' };
    }
    if (item.ai_doc_source_type) {
        return { text: 'Created Contact', icon: CheckCircle, color: 'text-blue-400' };
    }
    return { text: 'Pending', icon: AlertTriangle, color: 'text-yellow-400' };
  };

  return (
    <Card className="bg-slate-800 border-slate-700 text-slate-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <History className="w-5 h-5 text-cyan-400" />
          Processing History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-4 text-slate-600" />
            <p>No document processing history found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-slate-800">
                  <TableHead className="text-slate-300">File Name</TableHead>
                  <TableHead className="text-slate-300">Type</TableHead>
                  <TableHead className="text-slate-300">Date</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => {
                  const status = getStatus(item);
                  const StatusIcon = status.icon;
                  return (
                    <TableRow key={item.id} className="border-slate-700 hover:bg-slate-700/50">
                      <TableCell className="font-medium text-slate-200">{item.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-slate-600 text-slate-300 capitalize">{item.ai_doc_source_type?.replace('_', ' ') || item.category}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-400">{format(new Date(item.created_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <div className={`flex items-center gap-2 ${status.color}`}>
                          <StatusIcon className="w-4 h-4" />
                          <span className="font-medium">{status.text}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
