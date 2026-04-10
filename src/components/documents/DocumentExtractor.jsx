import { useEffect, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import { ExtractDataFromUploadedFile, UploadFile } from '@/api/integrations';
import { useTenant } from '../shared/tenantContext';
import { useUser } from '../shared/useUser.js';

const entitySchemas = {
  Contact: {
    type: 'object',
    properties: {
      first_name: { type: 'string' },
      last_name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      mobile: { type: 'string' },
      job_title: { type: 'string' },
      company: { type: 'string' },
      address_1: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      zip: { type: 'string' },
      country: { type: 'string' },
    },
  },
  Lead: {
    type: 'object',
    properties: {
      first_name: { type: 'string' },
      last_name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      company: { type: 'string' },
      job_title: { type: 'string' },
      source: { type: 'string' },
      address_1: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      zip: { type: 'string' },
      country: { type: 'string' },
    },
  },
  Account: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      industry: { type: 'string' },
      website: { type: 'string' },
      phone: { type: 'string' },
      email: { type: 'string' },
      address_1: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      zip: { type: 'string' },
      country: { type: 'string' },
      description: { type: 'string' },
    },
  },
};

const entityFieldLabels = {
  Contact: [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'job_title', label: 'Job Title' },
    { key: 'company', label: 'Company' },
    { key: 'address_1', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'zip', label: 'ZIP' },
    { key: 'country', label: 'Country' },
  ],
  Lead: [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'company', label: 'Company' },
    { key: 'job_title', label: 'Job Title' },
    { key: 'source', label: 'Source' },
    { key: 'address_1', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'zip', label: 'ZIP' },
    { key: 'country', label: 'Country' },
  ],
  Account: [
    { key: 'name', label: 'Company Name' },
    { key: 'industry', label: 'Industry' },
    { key: 'website', label: 'Website' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'address_1', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'zip', label: 'ZIP' },
    { key: 'country', label: 'Country' },
    { key: 'description', label: 'Description' },
  ],
};

export default function DocumentExtractor({ onCancel, onProcessingChange }) {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [entityType, setEntityType] = useState('Contact');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Association state
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkedEntity, setLinkedEntity] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedDoc, setSavedDoc] = useState(null);
  const searchDebounce = useRef(null);

  const { selectedTenantId } = useTenant();
  const { user: currentUser } = useUser();

  useEffect(() => {
    if (onProcessingChange) {
      onProcessingChange(isProcessing);
    }
  }, [isProcessing, onProcessingChange]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
    setError(null);
    setFileUrl(null);
    setLinkedEntity(null);
    setSavedDoc(null);
    setLinkSearch('');
    setLinkResults([]);
  };

  const getTenantId = () =>
    currentUser?.role === 'superadmin'
      ? selectedTenantId
      : currentUser?.tenant_uuid || currentUser?.tenant_id;

  // Debounced search for linking entity
  const handleLinkSearchChange = (value) => {
    setLinkSearch(value);
    setLinkedEntity(null);
    if (!value.trim()) {
      setLinkResults([]);
      return;
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      const tenantId = getTenantId();
      if (!tenantId) return;
      setLinkSearching(true);
      try {
        const { getBackendUrl } = await import('@/api/backendUrl');
        const base = getBackendUrl();
        const typeMap = { Contact: 'contacts', Lead: 'leads', Account: 'accounts' };
        const seg = typeMap[entityType];
        const url = `${base}/api/v2/${seg}?tenant_id=${encodeURIComponent(tenantId)}&search=${encodeURIComponent(value)}&limit=5`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
          setLinkResults([]);
          return;
        }
        const data = await res.json();
        const rows = data.data?.[seg] || data[seg] || data.data || [];
        setLinkResults(Array.isArray(rows) ? rows.slice(0, 5) : []);
      } catch {
        setLinkResults([]);
      } finally {
        setLinkSearching(false);
      }
    }, 350);
  };

  const getEntityDisplayName = (row) => {
    if (entityType === 'Account') return row.name || 'Unnamed Account';
    return [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Unnamed';
  };

  const handleSaveDocument = async () => {
    if (!fileUrl || !linkedEntity) return;
    const tenantId = getTenantId();
    if (!tenantId) return;
    setIsSaving(true);
    try {
      const { getBackendUrl } = await import('@/api/backendUrl');
      const base = getBackendUrl();
      const typeMap = { Contact: 'contact', Lead: 'lead', Account: 'account' };
      const body = {
        tenant_id: tenantId,
        name: file?.name || 'Extracted Document',
        file_url: fileUrl,
        file_type: file?.type || null,
        file_size: file?.size || null,
        related_type: typeMap[entityType],
        related_id: linkedEntity.id,
      };
      const res = await fetch(`${base}/api/v2/documents`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const data = await res.json();
      setSavedDoc(data.data?.document || data.document || body);
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleProcess = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setFileUrl(null);
    setLinkedEntity(null);
    setSavedDoc(null);
    setLinkSearch('');
    setLinkResults([]);

    try {
      const tenantId = getTenantId();

      if (!tenantId) {
        throw new Error('Please select a tenant before extracting document data.');
      }

      const { file_url } = await UploadFile({ file, tenant_id: tenantId });
      setFileUrl(file_url);

      const extractionResult = await ExtractDataFromUploadedFile({
        file_url,
        json_schema: entitySchemas[entityType],
        tenant_id: tenantId,
      });

      if (extractionResult.status === 'success') {
        setResult(extractionResult.output);
      } else {
        throw new Error(
          extractionResult.error || extractionResult.details || 'Failed to extract data.',
        );
      }
    } catch (e) {
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="bg-slate-800 border-slate-700 text-slate-300 shadow-lg border-0">
      <CardHeader className="border-b border-slate-700">
        <CardTitle className="flex items-center justify-between text-slate-100">
          <span className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-400" />
            Document Extractor
          </span>
          <Button
            variant="ghost"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </Button>
        </CardTitle>
        <CardDescription className="text-slate-400">
          Upload documents like receipts, invoices, or contracts to extract structured data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="document-file" className="text-sm font-medium text-slate-200">
              Document File
            </label>
            <Input
              id="document-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp,.pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="bg-slate-700 border-slate-600 text-slate-200 file:bg-slate-600 file:text-slate-200 file:border-slate-500"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="entity-type" className="text-sm font-medium text-slate-200">
              Target Entity
            </label>
            <Select value={entityType} onValueChange={setEntityType} disabled={isProcessing}>
              <SelectTrigger
                id="entity-type"
                className="bg-slate-700 border-slate-600 text-slate-200"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectItem value="Contact" className="focus:bg-slate-700">
                  Contact
                </SelectItem>
                <SelectItem value="Lead" className="focus:bg-slate-700">
                  Lead
                </SelectItem>
                <SelectItem value="Account" className="focus:bg-slate-700">
                  Account
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Extracted fields */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-400" />
                Extracted {entityType} Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                {entityFieldLabels[entityType].map(({ key, label }) =>
                  result[key] ? (
                    <div key={key} className="flex flex-col">
                      <span className="text-xs text-slate-500 uppercase tracking-wide">
                        {label}
                      </span>
                      <span className="text-sm text-slate-200 break-words">{result[key]}</span>
                    </div>
                  ) : null,
                )}
              </div>
            </div>

            {/* Link to CRM record */}
            {!savedDoc ? (
              <div className="rounded-lg border border-slate-600 bg-slate-900/40 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-blue-400" />
                  Link Document to a {entityType}
                </h3>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder={`Search ${entityType}s by name…`}
                    value={linkSearch}
                    onChange={(e) => handleLinkSearchChange(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-slate-200 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {linkSearching && (
                    <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 animate-spin" />
                  )}
                </div>
                {linkResults.length > 0 && !linkedEntity && (
                  <ul className="rounded-md border border-slate-600 bg-slate-800 divide-y divide-slate-700 overflow-hidden">
                    {linkResults.map((row) => (
                      <li
                        key={row.id}
                        className="px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 cursor-pointer flex items-center gap-2"
                        onClick={() => {
                          setLinkedEntity(row);
                          setLinkSearch(getEntityDisplayName(row));
                          setLinkResults([]);
                        }}
                      >
                        {getEntityDisplayName(row)}
                        {row.email && <span className="text-slate-500 text-xs">— {row.email}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {linkedEntity && (
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Selected: <strong>{getEntityDisplayName(linkedEntity)}</strong>
                  </p>
                )}
                <button
                  onClick={handleSaveDocument}
                  disabled={!linkedEntity || isSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                  {isSaving ? 'Saving…' : 'Save & Link Document'}
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-green-700/40 bg-green-900/20 p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="text-green-300 font-semibold">Document saved and linked!</p>
                  <p className="text-slate-400 mt-1">
                    Linked to {entityType}:{' '}
                    <strong className="text-slate-200">{getEntityDisplayName(linkedEntity)}</strong>
                  </p>
                  {savedDoc.file_url && (
                    <a
                      href={savedDoc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 mt-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {file?.name || 'Open document'}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        {/* Changed to flex and gap for buttons */}
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          className="bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600"
        >
          Cancel
        </Button>
        <Button
          onClick={handleProcess}
          disabled={isProcessing || !file}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Extracting...
            </>
          ) : (
            <>
              <UploadCloud className="mr-2 h-4 w-4" />
              Extract Data
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
