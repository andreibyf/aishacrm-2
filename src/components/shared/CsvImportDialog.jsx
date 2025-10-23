
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Upload, File, CheckCircle, AlertCircle, AlertTriangle, XCircle, CheckCircle2, Link2 } from "lucide-react";
import { User, Employee } from "@/api/entities";
import { validateAndImport } from "@/api/functions";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress"; // NEW: Import Progress component

const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== 'string') return phoneNumber;
  let cleaned = phoneNumber.replace(/\D/g, '');
  if (!cleaned) return '';
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phoneNumber;
};

// Adjusted props based on user's original component structure
export default function CsvImportDialog({ open, onOpenChange, schema, onSuccess }) {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState('upload');
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [crmFields, setCrmFields] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [assignedTo, setAssignedTo] = useState('');
  const [employees, setEmployees] = useState([]);
  const [accountLinkColumn, setAccountLinkColumn] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [showDetailedResults, setShowDetailedResults] = useState(false); // New state for the detailed results dialog
  
  // NEW: State for batch processing
  const [isBatching, setIsBatching] = useState(false); // Controls the global progress overlay

  // NEW: State for batch processing progress details
  const [importProgress, setImportProgress] = useState({ itemsImported: 0, totalItems: 0, currentBatchNum: 0, totalBatchCount: 0 });

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await User.me();
        setCurrentUser(user);
        const empList = await Employee.filter({ tenant_id: user.tenant_id });
        setEmployees(empList);
      } catch (error) {
        console.error("Failed to load data:", error);
        toast({
          title: "Error loading employees",
          description: error.message || "Could not load employee list for assignment.",
          variant: "destructive",
        });
      }
    };

    if (open) {
      loadData();
    }
  }, [open]);

  useEffect(() => {
    if (schema?.properties) {
      const excludedFields = [
        'id', 'unique_id', 'tenant_id', 'created_date', 'updated_date', 'created_by',
        'last_synced', 'assigned_to_name', 'account_name', 'account_industry',
        'contact_name', 'contact_email', 'converted_contact_name', 'converted_account_name'
      ];

      const fields = Object.keys(schema.properties)
        .filter(key => !excludedFields.includes(key))
        .map(key => ({
          value: key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          required: schema.required?.includes(key) || false
        }))
        .sort((a, b) => {
          if (a.required && !b.required) return -1;
          if (!a.required && b.required) return 1;
          return a.label.localeCompare(b.label);
        });
      setCrmFields(fields);
    }
  }, [schema]);

  const resetState = () => {
    setFile(null);
    setStep('upload');
    setHeaders([]);
    setMapping({});
    setCrmFields([]); // Reset CRM fields
    setImporting(false);
    setImportResults(null);
    setAssignedTo('');
    setEmployees([]); // Reset employees
    setAccountLinkColumn(null);
    setCurrentUser(null); // Reset current user
    setPreviewData([]);
    setShowDetailedResults(false);
    // Reset batching state
    setIsBatching(false);
    setImportProgress({ itemsImported: 0, totalItems: 0, currentBatchNum: 0, totalBatchCount: 0 });
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    const delimiter = text.includes('\t') ? '\t' : ',';
    
    return lines.map(line => {
      const values = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    });
  };

  // Renamed to handleDialogClose for clarity and consistency with outline
  const handleDialogClose = (isOpen) => {
    if (!isOpen) {
      resetState();
    }
    onOpenChange(isOpen); // Control the main dialog's visibility
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const rows = parseCSV(text);
        
        if (!rows || rows.length <= 1) { // Check for header + at least one data row
          toast({
            title: "CSV Empty",
            description: "The selected CSV file appears to be empty or only contains headers.",
            variant: "destructive",
          });
          setFile(null); // Clear the file
          return;
        }
        
        const headerRow = rows[0].map(h => (h || "").trim());
        const dataRows = rows.slice(1); 
        
        setHeaders(headerRow);
        setPreviewData(dataRows); // Keep all data rows for preview if needed, or slice if only a few are needed.
                                  // The actual preview UI only shows first few rows anyway.
        
        // Auto-detect account link column for Contacts
        if (schema?.name === 'Contact') {
          const linkColumn = headerRow.find(h => {
            const lower = h.toLowerCase();
            return (
              lower === 'company' || lower === 'company name' ||
              lower === 'account' || lower === 'account name' ||
              (lower.includes('company') && (lower.includes('id') || lower.includes('legacy'))) ||
              (lower.includes('account') && (lower.includes('id') || lower.includes('legacy'))) ||
              lower === 'company id' || lower === 'account id' ||
              lower === 'company_id' || lower === 'account_id'
            );
          });
          
          setAccountLinkColumn(linkColumn || null);
        }
        
        autoMapHeaders(headerRow);
        setStep('map');
      };
      reader.readAsText(selectedFile);
    }
  };

  const autoMapHeaders = (csvHeaders) => {
    const newMapping = {};
    const mappingPatterns = {
      'first_name': ['first name', 'firstname', 'fname', 'given name'],
      'last_name': ['last name', 'lastname', 'lname', 'surname'],
      'email': ['email', 'email address', 'e-mail'],
      'phone': ['phone', 'phone number', 'telephone', 'mobile'],
      'job_title': ['job title', 'title', 'position'],
      'address_1': ['address', 'street address', 'address line 1'],
      'city': ['city', 'town'],
      'state': ['state', 'province'],
      'zip': ['zip', 'postal code', 'zipcode'],
      'country': ['country'],
      'status': ['status'],
      'source': ['source', 'lead source'],
      'industry': ['industry', 'sector']
    };

    csvHeaders.forEach(header => {
      // Skip account link column - don't map it to a field
      if (schema?.name === 'Contact' && header === accountLinkColumn) {
        newMapping[header] = null;
        return;
      }

      const normalizedHeader = header.toLowerCase().trim();
      let matchedField = null;

      for (const [crmField, patterns] of Object.entries(mappingPatterns)) {
        if (patterns.some(pattern => normalizedHeader === pattern || normalizedHeader.includes(pattern))) {
          if (crmFields.some(f => f.value === crmField)) {
            matchedField = crmField;
            break;
          }
        }
      }

      newMapping[header] = matchedField || null;
    });

    setMapping(newMapping);
  };

  const handleMappingChange = (header, crmField) => {
    const actualValue = crmField === '__skip__' ? null : crmField;
    setMapping(prev => ({ ...prev, [header]: actualValue }));
  };

  const handleImport = async () => {
    if (!file || !currentUser) return;

    setIsBatching(true); // NEW: Use batching flag
    setImporting(true);
    setStep('importing');

    try {
      const reader = new FileReader();
      
      const text = await new Promise((resolve, reject) => {
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      const rows = parseCSV(text);
      const headerRow = rows[0];
      const dataRows = rows.slice(1);

      // Build records from mapping
      const records = dataRows.map((cols) => {
        const record = {};
        
        headerRow.forEach((header, index) => {
          const crmField = mapping[header];
          if (!crmField) return; // If mapping is null (skip) or undefined, do not add to record
          
          let value = cols[index] || '';
          
          if ((crmField === 'phone' || crmField === 'mobile') && value) {
            value = formatPhoneNumber(value);
          }
          
          if (crmField === 'email' && value) {
            value = value.toLowerCase().trim();
          }
          
          if (value) {
            record[crmField] = value;
          }
        });

        // Add assigned_to if specified (preserving original logic)
        if (assignedTo && assignedTo !== '__unassigned__') {
          record.assigned_to = assignedTo;
        }

        // Add company name for account linking (as per outline)
        if (schema?.name === 'Contact' && accountLinkColumn) {
          const linkIndex = headerRow.indexOf(accountLinkColumn);
          if (linkIndex !== -1) {
            const companyValue = cols[linkIndex];
            if (companyValue && companyValue.trim()) {
              record._company_name = companyValue.trim(); // Use special field for backend linking
            }
          }
        }

        // Ensure is_test_data is false (preserving original logic)
        record.is_test_data = false;

        return record;
      });

      // Filter out records that are completely empty after processing (except system fields like is_test_data, assigned_to or _company_name which might be the only things set)
      const validRecords = records.filter(r => Object.keys(r).some(key => !key.startsWith('_') && key !== 'is_test_data' && key !== 'assigned_to') || r.assigned_to || r._company_name);

      if (validRecords.length === 0) {
        toast({
          title: "No Valid Records",
          description: "No records found with mapped data to import. Please check your mapping.",
          variant: "destructive",
        });
        setStep('map'); // Go back to map step if no valid records
        setImporting(false);
        setIsBatching(false); // NEW: Reset batching flag
        setImportProgress({ itemsImported: 0, totalItems: 0, currentBatchNum: 0, totalBatchCount: 0 }); // Reset progress
        return;
      }
      
      // PERFORMANCE OPTIMIZATION: Increased batch size and removed client-side delays.
      // ApiOptimizer handles rate limiting automatically.
      const BATCH_SIZE = 25; // Increased from 5

      const batches = [];
      for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
        batches.push(validRecords.slice(i, i + BATCH_SIZE));
      }
      setImportProgress({ itemsImported: 0, totalItems: validRecords.length, currentBatchNum: 0, totalBatchCount: batches.length });

      const allResults = { successCount: 0, failCount: 0, errors: [], accountsLinked: 0, accountsNotFound: 0, matchingDetails: [] };
      
      for (let i = 0; i < batches.length; i++) {
        setImportProgress(prev => ({ ...prev, currentBatchNum: i + 1 }));
        const batch = batches[i];
        
        try {
          const response = await validateAndImport({
              records: batch,
              entityType: schema?.name,
              mapping: mapping, // This mapping is for the whole CSV, not just the batch headers
              fileName: file.name,
              accountLinkColumn: accountLinkColumn
          });

          if (response.data) {
            allResults.successCount += response.data.successCount || 0;
            allResults.failCount += response.data.failCount || 0;
            allResults.errors.push(...(response.data.errors || []));
            allResults.accountsLinked += response.data.accountsLinked || 0;
            allResults.accountsNotFound += response.data.accountsNotFound || 0;
            allResults.matchingDetails.push(...(response.data.matchingDetails || []));
            
            // Update progress
            setImportProgress(prev => ({ ...prev, itemsImported: allResults.successCount }));
          } else {
              // Handle case where function returns no data but no throw
              allResults.failCount += batch.length;
              allResults.errors.push({ row_number: `Batch ${i + 1} (no data)`, error: "Batch failed, no response data received." });
          }
          
          // Removed client-side delay: `ApiOptimizer` is assumed to handle rate limiting internally.
        } catch (batchError) {
          const errorMessage = batchError.message?.toLowerCase() || '';
          const errorString = String(batchError).toLowerCase();
          const status = batchError?.response?.status || batchError?.status;
          
          // Handle rate limits
          if (status === 429 || errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            console.error(`Import rate limited at batch ${i + 1}`);
            allResults.errors.push({ 
              row_number: `Batch ${i + 1}`, 
              error: `Rate limit exceeded. ${allResults.successCount} records imported successfully before rate limit. Please wait a few minutes and re-import the remaining records.` 
            });
            break; // Stop processing further batches on rate limit
          } 
          // Handle network errors
          else if (errorMessage.includes('network error') || errorString.includes('network error') || (batchError instanceof TypeError && batchError.message === 'Failed to fetch')) {
            console.warn(`Network error during import batch ${i + 1}`);
            allResults.failCount += batch.length;
            allResults.errors.push({ row_number: `Batch ${i + 1}`, error: "Network error - please check connection and try again" });
          }
          // Other errors
          else {
            console.error(`Import batch ${i + 1} failed:`, batchError?.message || 'Unknown error');
            allResults.failCount += batch.length;
            allResults.errors.push({ row_number: `Batch ${i + 1}`, error: batchError.message || "Batch failed with an unknown error." });
          }
        }
      }

      setImportResults(allResults);

      if (allResults.failCount === 0) {
        toast({
          title: "Import Successful",
          description: `${allResults.successCount} ${schema.name.toLowerCase()}(s) imported successfully${allResults.accountsLinked ? `. ${allResults.accountsLinked} linked to accounts.` : ''}`,
        });
        if (onSuccess) onSuccess();
        handleDialogClose(false);
      } else { // Partial success or full failure
        toast({
          title: "Import Completed with Issues",
          description: `${allResults.successCount} records imported, but ${allResults.failCount} failed. See detailed results.`,
          variant: "warning",
        });
        setShowDetailedResults(true);
        setStep('done');
      }

    } catch (error) {
      console.error("Import failed:", error?.message || 'Unknown error');
      toast({
        title: "Import Error",
        description: error.message || "An unexpected error occurred during import.",
        variant: "destructive",
      });
      setImportResults({ // Ensure importResults is populated even on general error
        successCount: 0,
        failCount: 0, // Cannot determine exact number of failures from a general error, assume 0 successful
        errors: [{ row_number: "N/A", error: error.message || "An unexpected error occurred" }],
        accountsLinked: 0,
        accountsNotFound: 0,
        matchingDetails: []
      });
      setShowDetailedResults(true);
      setStep('done');
    } finally {
      setImporting(false);
      setIsBatching(false); // NEW: Reset batching flag
      setImportProgress({ itemsImported: 0, totalItems: 0, currentBatchNum: 0, totalBatchCount: 0 }); // Reset progress
    }
  };

  const requiredFieldsMapped = crmFields
    .filter(f => f.required)
    .every(f => Object.values(mapping).includes(f.value));

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Import {schema?.name || 'Data'}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Upload CSV and map columns. System handles unique IDs, account linking, and validation automatically.
            </DialogDescription>
          </DialogHeader>

          {step === 'upload' && (
            <div className="p-6 text-center border-2 border-dashed border-slate-600 rounded-lg bg-slate-700/30">
              <Upload className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-2 text-sm font-semibold text-slate-200">Select CSV file</h3>
              <p className="mt-1 text-sm text-slate-400">File should have a header row with column names</p>
              <div className="mt-4">
                <Input id="csv-upload" type="file" accept=".csv" onChange={handleFileChange} className="sr-only" />
                <Button asChild className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Label htmlFor="csv-upload" className="cursor-pointer">Browse Files</Label>
                </Button>
              </div>
            </div>
          )}

          {step === 'map' && (
            <div>
              <Alert className="mb-4 bg-slate-700/50 border-slate-600">
                <File className="h-4 w-4 text-blue-400"/>
                <AlertTitle className="text-slate-200">Map Your Data Fields</AlertTitle>
                <AlertDescription className="text-slate-400">
                  Match CSV columns to {schema?.name} fields. Required fields must be mapped.
                </AlertDescription>
              </Alert>

              {!requiredFieldsMapped && (
                <Alert variant="destructive" className="mb-4 bg-red-900/30 border-red-700">
                  <AlertCircle className="h-4 w-4 text-red-300" />
                  <AlertTitle className="text-red-300">Required Fields Missing</AlertTitle>
                  <AlertDescription className="text-red-400">
                    Map: {crmFields.filter(f => f.required && !Object.values(mapping).includes(f.value)).map(f => f.label).join(', ')}
                  </AlertDescription>
                </Alert>
              )}

              {schema?.name === 'Contact' && accountLinkColumn && (
                <Alert className="mb-4 bg-green-900/20 border-green-700">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <AlertTitle className="text-green-300">Auto-Linking Enabled</AlertTitle>
                  <AlertDescription className="text-green-400">
                    Column &quot;<strong>{accountLinkColumn}</strong>&quot; will link contacts to accounts.<br />
                    <span className="text-xs text-green-300 mt-1 block">
                      Matches by: Company Name, Legacy ID (Company ID), or Account ID
                    </span>
                    <span className="text-xs text-yellow-300 mt-1 block">
                      ⚠️ Make sure your Accounts have matching names or legacy_id values set!
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              {schema?.properties?.assigned_to && (
                <div className="mb-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                  <Label htmlFor="assigned-to" className="text-slate-200 font-medium mb-2 block">
                    Assign all imported records to:
                  </Label>
                  <Select value={assignedTo || '__unassigned__'} onValueChange={setAssignedTo}>
                    <SelectTrigger id="assigned-to" className="bg-slate-700 border-slate-600 text-slate-200">
                      <SelectValue placeholder="Leave unassigned" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectItem value="__unassigned__" className="hover:bg-slate-700">Leave Unassigned</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.email || emp.user_email} className="hover:bg-slate-700">
                          {emp.first_name} {emp.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="mb-4">
                <h4 className="text-sm font-semibold text-slate-200 mb-2">Preview (first 5 rows)</h4>
                <div className="bg-slate-700/30 rounded p-2 text-xs text-slate-400 max-h-32 overflow-auto">
                  {previewData.slice(0, 3).map((row, idx) => (
                    <div key={idx} className="mb-1">
                      Row {idx + 1}: {row.slice(0, 3).join(' | ')}...
                    </div>
                  ))}
                </div>
              </div>

              <div className="max-h-[50vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-300">Your CSV Column</TableHead>
                      <TableHead className="text-slate-300">{schema?.name} Field</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {headers.map(header => {
                      const isLinkColumn = schema?.name === 'Contact' && header === accountLinkColumn;
                      return (
                        <TableRow key={header} className={`border-slate-700 ${isLinkColumn ? 'bg-green-900/10' : ''}`}>
                          <TableCell className="font-medium text-slate-200">
                            {header}
                            {isLinkColumn && (
                              <Badge className="ml-2 bg-green-900/30 text-green-400 border-green-700 text-xs">
                                Account Link
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select 
                              value={mapping[header] || '__skip__'}
                              onValueChange={value => handleMappingChange(header, value)}
                              disabled={isLinkColumn}
                            >
                              <SelectTrigger className={`bg-slate-700 border-slate-600 text-slate-200 ${isLinkColumn ? 'opacity-50' : ''}`}>
                                <SelectValue placeholder={isLinkColumn ? "Auto-linked" : "Select field..."} />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                                <SelectItem value="__skip__" className="hover:bg-slate-700">-- Skip this column --</SelectItem>
                                {crmFields.map(field => (
                                  <SelectItem key={field.value} value={field.value} className="hover:bg-slate-700">
                                    {field.label} {field.required && <span className="text-red-400">*</span>}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="p-10 flex flex-col items-center justify-center text-center">
              <Loader2 className="h-16 w-16 animate-spin text-blue-400 mb-4" />
              <h3 className="text-xl font-semibold text-slate-200">Importing Data...</h3>
              <p className="text-slate-400">Validating and creating records with full audit trail</p>
              {/* The global progress overlay now handles detailed progress */}
            </div>
          )}

          {/* This 'done' step now acts as a bridge to the detailed results dialog */}
          {step === 'done' && (
              <div className="p-6 text-center">
                <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400 mb-4" />
                <h3 className="text-xl font-semibold text-slate-200 mb-2">Import Processed</h3>
                <p className="text-slate-400">Review detailed results for a summary of successes, failures, and account linking.</p>
                <Button onClick={() => setShowDetailedResults(true)} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                    Show Detailed Results
                </Button>
              </div>
          )}

          <DialogFooter className="bg-slate-700/30 border-t border-slate-700">
            {step === 'map' && (
              <Button
                onClick={handleImport}
                disabled={importing || !requiredFieldsMapped}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Import {headers.length} columns
              </Button>
            )}
            {/* The 'Close' button is available for upload and done steps to close the main dialog */}
            {(step === 'upload' || step === 'done') && (
              <Button 
                variant="outline" 
                onClick={() => handleDialogClose(false)} 
                className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NEW: Progress Overlay */}
      {isBatching && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 p-8 rounded-lg shadow-xl max-w-md w-full border border-slate-700">
            <div className="text-center mb-6">
              <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-slate-100 mb-2">Importing Records...</h3>
              <p className="text-slate-400 text-sm">
                Please wait while we process your import. Do not close this window.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm text-slate-300 mb-2">
                  <span>Batch {importProgress.currentBatchNum} of {importProgress.totalBatchCount}</span>
                  <span>{importProgress.itemsImported} of {importProgress.totalItems} records imported</span>
                </div>
                <Progress
                  value={importProgress.totalItems > 0 ? (importProgress.itemsImported / importProgress.totalItems) * 100 : 0}
                  className="h-2 bg-blue-500/20"
                  indicatorClassName="bg-blue-600"
                />
              </div>

              <div className="bg-slate-700/50 rounded p-3 text-xs text-slate-400">
                <p className="mb-1">• Processing in batches of 25 records</p>
                <p className="mb-1">• No intentional delay between batches</p>
                <p>• Total records to process: {importProgress.totalItems}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Detailed Results Dialog */}
      <Dialog open={showDetailedResults} onOpenChange={setShowDetailedResults}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Import Results</DialogTitle>
            <DialogDescription className="text-slate-400">
              Detailed information about your import
            </DialogDescription>
          </DialogHeader>

          {importResults && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-green-900/20 border-green-700">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-400">Successfully Imported</p>
                      <p className="text-2xl font-bold text-green-300">{importResults.successCount}</p>
                    </div>
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </CardContent>
                </Card>

                <Card className="bg-red-900/20 border-red-700">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-red-400">Failed</p>
                      <p className="text-2xl font-bold text-red-300">{importResults.failCount}</p>
                    </div>
                    <XCircle className="w-8 h-8 text-red-400" />
                  </CardContent>
                </Card>

                {schema?.name === 'Contact' && (
                  <>
                    <Card className="bg-blue-900/20 border-blue-700">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-blue-400">Accounts Linked</p>
                          <p className="text-2xl font-bold text-blue-300">{importResults.accountsLinked || 0}</p>
                        </div>
                        <Link2 className="w-8 h-8 text-blue-400" />
                      </CardContent>
                    </Card>

                    <Card className="bg-yellow-900/20 border-yellow-700">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-yellow-400">Accounts Not Found</p>
                          <p className="text-2xl font-bold text-yellow-300">{importResults.accountsNotFound || 0}</p>
                        </div>
                        <AlertTriangle className="w-8 h-8 text-yellow-400" />
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              {/* Account Linking Details */}
              {schema?.name === 'Contact' && importResults.matchingDetails && importResults.matchingDetails.length > 0 && (
                <Card className="bg-slate-700/50 border-slate-600">
                  <CardHeader>
                    <CardTitle className="text-slate-100 text-lg">Account Linking Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 max-h-64 overflow-y-auto">
                    {importResults.matchingDetails.map((detail, idx) => (
                      <div key={idx} className={`p-3 rounded-lg border ${
                        detail.matched 
                          ? 'bg-green-900/10 border-green-700/50' 
                          : 'bg-yellow-900/10 border-yellow-700/50'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-200">
                              Row {detail.rowNumber}: &quot;{detail.companyValue}&quot;
                            </p>
                            {detail.matched ? (
                              <p className="text-xs text-green-400 mt-1">
                                ✓ Linked to account via {detail.matchMethod}
                              </p>
                            ) : (
                              <p className="text-xs text-yellow-400 mt-1">
                                ⚠ No matching account found
                              </p>
                            )}
                          </div>
                          {detail.matched ? (
                            <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Error Details */}
              {importResults.errors && importResults.errors.length > 0 && (
                <Card className="bg-red-900/20 border-red-700">
                  <CardHeader>
                    <CardTitle className="text-red-300 text-lg">Errors</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-64 overflow-y-auto">
                    {importResults.errors.map((error, idx) => (
                      <div key={idx} className="p-3 bg-red-900/30 rounded-lg border border-red-700/50">
                        <p className="text-sm font-medium text-red-300">Row {error.row_number}</p>
                        <p className="text-xs text-red-400 mt-1">{error.error}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-3">
                <Button
                  onClick={() => {
                    setShowDetailedResults(false);
                    // Only call onSuccess if there was at least one successful import,
                    // and then close the main dialog as well.
                    if (importResults.successCount > 0 && onSuccess) {
                      onSuccess();
                    }
                    handleDialogClose(false);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
