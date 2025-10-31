import { useState, useCallback } from 'react';
import { UploadFile, ExtractDataFromUploadedFile } from '@/api/integrations';
import { CashFlow } from '@/api/entities';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileUp, CheckCircle, AlertTriangle, Save, Trash2 } from 'lucide-react';
import { useTenant } from '../shared/tenantContext';

const cashFlowExtractionSchema = {
  type: "object",
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          transaction_date: { type: "string", format: "date", description: "The date of the transaction in YYYY-MM-DD format." },
          description: { type: "string", description: "A detailed description of the transaction." },
          amount: { type: "number", description: "The transaction amount. Always a positive number." },
          transaction_type: { type: "string", enum: ["income", "expense"], description: "The type of transaction (income or expense)." }
        },
        required: ["transaction_date", "description", "amount", "transaction_type"]
      }
    }
  },
  required: ["transactions"]
};

const cashFlowCategories = [
    "sales_revenue", "recurring_revenue", "refund", "operating_expense", "marketing", 
    "equipment", "supplies", "utilities", "rent", "payroll", 
    "professional_services", "travel", "meals", "other"
];

export default function CashFlowExtractor({ onCancel, onProcessingChange, user }) {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, uploading, extracting, review, saving, success
  const [extractedData, setExtractedData] = useState([]);
  const [error, setError] = useState(null);
  const { selectedTenantId } = useTenant();

  // Handle file processing
  const handleProcessFile = useCallback(async (fileToProcess) => {
    if (!user) {
      setError("User information is not available.");
      setStatus('error');
      return;
    }
    
    onProcessingChange(true);
    setStatus('uploading');
    setError(null);
    try {
      const { file_url } = await UploadFile({ file: fileToProcess });
      
      setStatus('extracting');
      const extractionResult = await ExtractDataFromUploadedFile({ file_url, json_schema: cashFlowExtractionSchema });

      if (extractionResult.status === 'success' && extractionResult.output?.transactions) {
        setExtractedData(extractionResult.output.transactions.map(t => ({...t, category: 'other'})));
        setStatus('review');
      } else {
        throw new Error(extractionResult.details || "Failed to extract structured data from the document.");
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    } finally {
      onProcessingChange(false);
    }
  }, [user, onProcessingChange]);

  // Handle file selection
  const handleFileChange = useCallback((event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      handleProcessFile(selectedFile);
    }
  }, [handleProcessFile]);

  const handleSaveTransactions = async () => {
    if (!user) {
      toast.error("Cannot save transactions. User not found.");
      return;
    }
    const tenantId = selectedTenantId || user.tenant_id;
    if (!tenantId) {
      toast.error("Cannot save transactions. Tenant not identified.");
      return;
    }

    onProcessingChange(true);
    setStatus('saving');
    try {
      const recordsToCreate = extractedData.map(item => ({
        ...item,
        tenant_id: tenantId,
        entry_method: 'document_extracted',
        is_editable: true,
      }));

      await CashFlow.bulkCreate(recordsToCreate);
      setStatus('success');
      toast.success(`${recordsToCreate.length} transactions saved successfully!`);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    } finally {
      onProcessingChange(false);
    }
  };
  
  const handleRowChange = (index, field, value) => {
    const updatedData = [...extractedData];
    updatedData[index][field] = value;
    setExtractedData(updatedData);
  };
  
  const handleRemoveRow = (index) => {
    setExtractedData(extractedData.filter((_, i) => i !== index));
  };

  if (status === 'success') {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-8 text-center space-y-4">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <h3 className="text-2xl font-bold text-slate-100">Success!</h3>
          <p className="text-slate-300">{extractedData.length} transactions have been added to your Cash Flow module.</p>
          <Button onClick={onCancel} className="bg-blue-600 hover:bg-blue-700">Process Another Document</Button>
        </CardContent>
      </Card>
    );
  }

  if (status === 'review') {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Review Extracted Transactions</CardTitle>
          <CardDescription className="text-slate-400">Verify the data extracted from your document before saving it to your Cash Flow.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700">
                  <TableHead className="text-slate-300">Date</TableHead>
                  <TableHead className="text-slate-300">Description</TableHead>
                  <TableHead className="text-slate-300">Amount</TableHead>
                  <TableHead className="text-slate-300">Type</TableHead>
                  <TableHead className="text-slate-300">Category</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extractedData.map((item, index) => (
                  <TableRow key={index} className="border-slate-700">
                    <TableCell><Input type="date" value={item.transaction_date} onChange={(e) => handleRowChange(index, 'transaction_date', e.target.value)} className="bg-slate-700 border-slate-600 text-slate-200" /></TableCell>
                    <TableCell><Input value={item.description} onChange={(e) => handleRowChange(index, 'description', e.target.value)} className="bg-slate-700 border-slate-600 text-slate-200" /></TableCell>
                    <TableCell><Input type="number" value={item.amount} onChange={(e) => handleRowChange(index, 'amount', parseFloat(e.target.value))} className="bg-slate-700 border-slate-600 text-slate-200" /></TableCell>
                    <TableCell>
                      <Select value={item.transaction_type} onValueChange={(val) => handleRowChange(index, 'transaction_type', val)}>
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="income" className="text-slate-200">Income</SelectItem>
                          <SelectItem value="expense" className="text-slate-200">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={item.category} onValueChange={(val) => handleRowChange(index, 'category', val)}>
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {cashFlowCategories.map(cat => <SelectItem key={cat} value={cat} className="text-slate-200 capitalize">{cat.replace(/_/g, ' ')}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Button variant="ghost" size="icon" onClick={() => handleRemoveRow(index)}><Trash2 className="w-4 h-4 text-red-500" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end mt-6">
            <Button onClick={handleSaveTransactions} disabled={status === 'saving'} className="bg-green-600 hover:bg-green-700">
              {status === 'saving' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Transactions
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-slate-100">Upload Financial Document</CardTitle>
        <CardDescription className="text-slate-400">Upload a spreadsheet (XLSX, CSV), PDF, or Word document containing income and expense transactions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'idle' && (
          <div className="p-10 border-2 border-dashed rounded-lg text-center transition-colors border-slate-600 hover:border-slate-500 hover:bg-slate-700/50">
            <input
              type="file"
              accept=".xlsx,.csv,.pdf,.docx,.xls"
              onChange={handleFileChange}
              className="hidden"
              id="financial-file-input"
            />
            <label htmlFor="financial-file-input" className="cursor-pointer">
              <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                <FileUp className="w-8 h-8" />
                <p>Click to select your financial document.</p>
                <p className="text-xs">(XLSX, CSV, PDF, DOCX supported)</p>
              </div>
            </label>
          </div>
        )}
        
        {['uploading', 'extracting'].includes(status) && (
          <div className="text-center p-10">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
            <p className="mt-4 text-slate-300 text-lg font-semibold capitalize">{status}...</p>
            <p className="text-slate-400">Please wait while we process your document.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-lg text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-300 font-semibold">An Error Occurred</p>
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <Button onClick={onCancel}>Try Again</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}