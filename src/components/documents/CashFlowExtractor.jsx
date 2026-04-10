import { useState, useCallback } from 'react';
import { UploadFile, ExtractDataFromUploadedFile } from '@/api/integrations';
import { CashFlow } from '@/api/entities';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  FileUp,
  CheckCircle,
  AlertTriangle,
  Save,
  Trash2,
  PlusCircle,
} from 'lucide-react';
import { useTenant } from '../shared/tenantContext';

const cashFlowExtractionSchema = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          transaction_date: {
            type: 'string',
            format: 'date',
            description: 'The date of the transaction in YYYY-MM-DD format.',
          },
          description: {
            type: 'string',
            description: 'A detailed description of the transaction.',
          },
          amount: {
            type: 'number',
            description: 'The transaction amount. Always a positive number.',
          },
          transaction_type: {
            type: 'string',
            enum: ['income', 'expense'],
            description: 'The type of transaction (income or expense).',
          },
        },
        required: ['transaction_date', 'description', 'amount', 'transaction_type'],
      },
    },
  },
  required: ['transactions'],
};

const cashFlowCategories = [
  'sales_revenue',
  'recurring_revenue',
  'refund',
  'operating_expense',
  'marketing',
  'equipment',
  'supplies',
  'utilities',
  'rent',
  'payroll',
  'professional_services',
  'travel',
  'meals',
  'tax',
  'other',
];

function normalizeDate(raw) {
  if (!raw) return null;
  const value = String(raw).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, mRaw, dRaw, yRaw] = slashMatch;
    const month = Number(mRaw);
    const day = Number(dRaw);
    const year = Number(yRaw.length === 2 ? `20${yRaw}` : yRaw);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return null;
}

function normalizeAmount(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.abs(raw);
  }
  if (raw == null) return null;

  const cleaned = String(raw)
    .replace(/[$,\s]/g, '')
    .replace(/[()]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.abs(parsed);
}

function normalizeTransactionType(rawType, amountSource = null) {
  const type = (rawType || '').toString().toLowerCase().trim();
  if (type === 'income' || type === 'expense') {
    return type;
  }

  if (typeof amountSource === 'number' && amountSource < 0) {
    return 'expense';
  }

  return 'expense';
}

function normalizeTransaction(raw) {
  if (!raw || typeof raw !== 'object') {
    return { normalized: null, reason: 'Row is not a valid object' };
  }

  const amountSource = raw.amount ?? raw.total ?? raw.value ?? raw.debit ?? raw.credit;
  const amount = normalizeAmount(amountSource);
  const transaction_date = normalizeDate(raw.transaction_date ?? raw.date ?? raw.posted_date);
  const description = String(
    raw.description ?? raw.memo ?? raw.details ?? raw.narration ?? raw.payee ?? raw.merchant ?? '',
  ).trim();
  const transaction_type = normalizeTransactionType(raw.transaction_type ?? raw.type, raw.amount);

  if (!transaction_date) {
    return { normalized: null, reason: 'Missing or invalid transaction date' };
  }

  if (!description) {
    return { normalized: null, reason: 'Missing description' };
  }

  if (!amount || amount <= 0) {
    return { normalized: null, reason: 'Missing or invalid amount' };
  }

  return {
    normalized: {
      transaction_date,
      description,
      amount,
      transaction_type,
    },
    reason: null,
  };
}

function toEditableTransaction(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      transaction_date: '',
      description: '',
      amount: '',
      transaction_type: 'expense',
      category: 'other',
    };
  }

  const amountSource = raw.amount ?? raw.total ?? raw.value ?? raw.debit ?? raw.credit;
  const amount = normalizeAmount(amountSource);
  const transaction_date = normalizeDate(raw.transaction_date ?? raw.date ?? raw.posted_date) || '';
  const description = String(
    raw.description ?? raw.memo ?? raw.details ?? raw.narration ?? raw.payee ?? raw.merchant ?? '',
  ).trim();
  const transaction_type = normalizeTransactionType(raw.transaction_type ?? raw.type, raw.amount);

  return {
    transaction_date,
    description,
    amount: amount ?? '',
    transaction_type,
    category: 'other',
  };
}

export default function CashFlowExtractor({ onCancel, onProcessingChange, user }) {
  const [_file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle, uploading, extracting, review, saving, success
  const [extractedData, setExtractedData] = useState([]);
  const [rejectedRows, setRejectedRows] = useState([]);
  const [promotedRows, setPromotedRows] = useState({});
  const [error, setError] = useState(null);
  const { selectedTenantId } = useTenant();

  // Handle file processing
  const handleProcessFile = useCallback(
    async (fileToProcess) => {
      if (!user) {
        setError('User information is not available.');
        setStatus('error');
        return;
      }

      onProcessingChange(true);
      setStatus('uploading');
      setError(null);
      try {
        const tenantId = selectedTenantId || user?.tenant_uuid || user?.tenant_id;
        if (!tenantId) {
          throw new Error('Please select a tenant before extracting financial documents.');
        }

        const { file_url } = await UploadFile({ file: fileToProcess, tenant_id: tenantId });

        setStatus('extracting');
        const extractionResult = await ExtractDataFromUploadedFile({
          file_url,
          json_schema: cashFlowExtractionSchema,
          tenant_id: tenantId,
        });

        if (extractionResult.status === 'success' && extractionResult.output?.transactions) {
          const normalizedResults = extractionResult.output.transactions.map(normalizeTransaction);
          const normalizedRows = normalizedResults
            .filter((item) => item.normalized)
            .map((item) => ({ ...item.normalized, category: 'other' }));
          const rejected = normalizedResults
            .map((item, index) => ({
              index,
              reason: item.reason,
              raw: extractionResult.output.transactions[index],
            }))
            .filter((item) => item.reason);

          setRejectedRows(rejected);
          setPromotedRows({});

          if (normalizedRows.length === 0) {
            throw new Error(
              'No valid transactions were detected. Please try a clearer PDF or review formatting.',
            );
          }

          setExtractedData(normalizedRows);
          if (rejected.length > 0) {
            toast.warning(`${rejected.length} row(s) were skipped due to missing required fields.`);
          }
          setStatus('review');
        } else {
          throw new Error(
            extractionResult.error ||
              extractionResult.details ||
              'Failed to extract structured data from the document.',
          );
        }
      } catch (err) {
        setError(err.message);
        setRejectedRows([]);
        setStatus('error');
      } finally {
        onProcessingChange(false);
      }
    },
    [user, onProcessingChange, selectedTenantId],
  );

  // Handle file selection
  const handleFileChange = useCallback(
    (event) => {
      const selectedFile = event.target.files[0];
      if (selectedFile) {
        setFile(selectedFile);
        handleProcessFile(selectedFile);
      }
    },
    [handleProcessFile],
  );

  const handleSaveTransactions = async () => {
    if (!user) {
      toast.error('Cannot save transactions. User not found.');
      return;
    }
    const tenantId = selectedTenantId || user.tenant_id;
    if (!tenantId) {
      toast.error('Cannot save transactions. Tenant not identified.');
      return;
    }

    onProcessingChange(true);
    setStatus('saving');
    try {
      const invalidRows = extractedData
        .map((item, idx) => {
          const missing = [];
          if (!normalizeDate(item.transaction_date)) missing.push('date');
          if (!String(item.description || '').trim()) missing.push('description');
          if (!normalizeAmount(item.amount)) missing.push('amount');
          if (!['income', 'expense'].includes(String(item.transaction_type || '').toLowerCase())) {
            missing.push('type');
          }

          return missing.length > 0 ? { row: idx + 1, missing } : null;
        })
        .filter(Boolean);

      if (invalidRows.length > 0) {
        const rowList = invalidRows.map((r) => r.row).join(', ');
        throw new Error(`Please complete required fields for row(s): ${rowList}.`);
      }

      const recordsToCreate = extractedData.map((item) => ({
        ...item,
        transaction_date: normalizeDate(item.transaction_date),
        amount: normalizeAmount(item.amount),
        description: String(item.description || '').trim(),
        transaction_type: String(item.transaction_type || '').toLowerCase(),
        type: String(item.transaction_type || '').toLowerCase(),
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

  const handlePromoteRejectedRow = (row) => {
    if (!row?.raw) return;

    setExtractedData((prev) => [...prev, toEditableTransaction(row.raw)]);
    setPromotedRows((prev) => ({ ...prev, [row.index]: true }));
    toast.success(`Added skipped row ${row.index + 1} to editable table.`);
  };

  if (status === 'success') {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-8 text-center space-y-4">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <h3 className="text-2xl font-bold text-slate-100">Success!</h3>
          <p className="text-slate-300">
            {extractedData.length} transactions have been added to your Cash Flow module.
          </p>
          <Button onClick={onCancel} className="bg-blue-600 hover:bg-blue-700">
            Process Another Document
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === 'review') {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Review Extracted Transactions</CardTitle>
          <CardDescription className="text-slate-400">
            Verify the data extracted from your document before saving it to your Cash Flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rejectedRows.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-700/40 bg-amber-900/20 p-4">
              <p className="text-sm font-semibold text-amber-200">Skipped Rows</p>
              <p className="mt-1 text-xs text-amber-300">
                {rejectedRows.length} row(s) were excluded because they were incomplete or invalid.
              </p>
              <div className="mt-3 max-h-40 overflow-y-auto space-y-2">
                {rejectedRows.map((row) => (
                  <div
                    key={row.index}
                    className="rounded border border-amber-700/30 bg-slate-900/40 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-amber-200">
                        Row {row.index + 1}: {row.reason}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={Boolean(promotedRows[row.index])}
                        onClick={() => handlePromoteRejectedRow(row)}
                        className="h-7 border-amber-600 text-amber-200 hover:bg-amber-800/30"
                      >
                        <PlusCircle className="w-3 h-3 mr-1" />
                        {promotedRows[row.index] ? 'Added' : 'Add to Table'}
                      </Button>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-300 break-words">
                      {JSON.stringify(row.raw)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    <TableCell>
                      <Input
                        type="date"
                        value={item.transaction_date || ''}
                        onChange={(e) => handleRowChange(index, 'transaction_date', e.target.value)}
                        className="bg-slate-700 border-slate-600 text-slate-200"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.description || ''}
                        onChange={(e) => handleRowChange(index, 'description', e.target.value)}
                        className="bg-slate-700 border-slate-600 text-slate-200"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={item.amount ?? ''}
                        onChange={(e) =>
                          handleRowChange(
                            index,
                            'amount',
                            e.target.value === '' ? '' : parseFloat(e.target.value),
                          )
                        }
                        className="bg-slate-700 border-slate-600 text-slate-200"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.transaction_type || 'expense'}
                        onValueChange={(val) => handleRowChange(index, 'transaction_type', val)}
                      >
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="income" className="text-slate-200">
                            Income
                          </SelectItem>
                          <SelectItem value="expense" className="text-slate-200">
                            Expense
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.category}
                        onValueChange={(val) => handleRowChange(index, 'category', val)}
                      >
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {cashFlowCategories.map((cat) => (
                            <SelectItem key={cat} value={cat} className="text-slate-200 capitalize">
                              {cat.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveRow(index)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end mt-6">
            <Button
              onClick={handleSaveTransactions}
              disabled={status === 'saving'}
              className="bg-green-600 hover:bg-green-700"
            >
              {status === 'saving' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
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
        <CardDescription className="text-slate-400">
          Upload a spreadsheet (XLSX, CSV), PDF, or Word document containing income and expense
          transactions.
        </CardDescription>
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
