import { useState, useEffect } from 'react';
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
import { Loader2, UploadCloud, AlertCircle, CheckCircle, CreditCard, X } from 'lucide-react'; // Changed Contact to CreditCard, added X
import { UploadFile, ExtractDataFromUploadedFile } from '@/api/integrations';
import { Lead as LeadEntity } from '@/api/entities';
import { useTenant } from '../shared/tenantContext';

const businessCardSchema = {
  type: 'object',
  properties: {
    first_name: { type: 'string' },
    last_name: { type: 'string' },
    job_title: { type: 'string' },
    company: { type: 'string' },
    phone: { type: 'string' },
    mobile: { type: 'string' },
    email: { type: 'string', format: 'email' },
    website: { type: 'string' },
    address_1: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    zip: { type: 'string' },
    country: { type: 'string' },
  },
  required: ['first_name', 'last_name'],
};

export default function BusinessCardProcessor({ user, onCancel, onProcessingChange }) {
  // Added onCancel, onProcessingChange
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { selectedTenantId } = useTenant();

  // Effect to notify parent about processing status changes
  useEffect(() => {
    if (onProcessingChange) {
      onProcessingChange(isProcessing);
    }
  }, [isProcessing, onProcessingChange]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
    setError(null);
  };

  const handleProcess = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    if (!user) {
      setError('User not loaded. Cannot process.');
      return;
    }

    const tenantId = user.role === 'superadmin' ? selectedTenantId : user.tenant_id;
    if (!tenantId) {
      setError('Cannot determine tenant. Please ensure a tenant is selected or assigned.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const { file_url } = await UploadFile({ file, tenant_id: tenantId });

      const extractionResult = await ExtractDataFromUploadedFile({
        file_url,
        json_schema: businessCardSchema,
        tenant_id: tenantId,
      });

      if (!extractionResult || extractionResult.status !== 'success' || !extractionResult.output) {
        throw new Error(
          extractionResult?.error ||
            extractionResult?.details ||
            'Failed to extract data from the business card.',
        );
      }

      const extracted = extractionResult.output || {};
      const leadData = {
        first_name: extracted.first_name,
        last_name: extracted.last_name,
        email: extracted.email || null,
        phone: extracted.phone || null,
        company: extracted.company || null,
        job_title: extracted.job_title || null,
        address_1: extracted.address_1 || null,
        city: extracted.city || null,
        state: extracted.state || null,
        zip: extracted.zip || null,
        country: extracted.country || null,
        tenant_id: tenantId,
        assigned_to: user.email || null,
        source: 'business_card',
        status: 'new',
        metadata: {
          ...(extracted.mobile ? { mobile: extracted.mobile } : {}),
          ...(extracted.website ? { website: extracted.website } : {}),
          processed_by_ai_doc: true,
          ai_doc_source_type: 'business_card',
        },
      };
      const newLead = await LeadEntity.create(leadData);
      setResult({
        message: 'Successfully created lead!',
        lead: newLead,
      });
    } catch (e) {
      setError(e.message || 'An unknown error occurred during processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="shadow-lg border-0 bg-slate-800 border-slate-700 text-slate-300">
      <CardHeader className="border-b border-slate-700">
        <CardTitle className="flex items-center justify-between text-slate-100">
          <span className="flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-400" />
            Business Card Scanner
          </span>
          {onCancel && (
            <Button
              variant="ghost"
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </CardTitle>
        <CardDescription className="text-slate-400">
          Upload a business card image to automatically extract information and create a new lead.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {' '}
        {/* Added p-6 padding */}
        <div className="space-y-2">
          <label htmlFor="business-card-file" className="text-sm font-medium text-slate-200">
            Business Card Image
          </label>
          <Input
            id="business-card-file"
            type="file"
            accept="image/png, image/jpeg, image/jpg"
            onChange={handleFileChange}
            disabled={isProcessing}
            className="bg-slate-700 border-slate-600 text-slate-200 file:bg-slate-600 file:text-slate-200 file:border-slate-500"
          />
        </div>
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}
        {result && (
          <div className="flex items-start gap-3 p-3 bg-green-900/30 border border-green-700/50 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-400 mt-1" />
            <div>
              <p className="font-semibold text-green-300">{result.message}</p>
              <div className="text-sm text-slate-300 mt-1">
                <p>
                  <strong>Name:</strong> {result.lead.first_name} {result.lead.last_name}
                </p>
                <p>
                  <strong>Company:</strong> {result.lead.company || 'N/A'}
                </p>
                <p>
                  <strong>Email:</strong> {result.lead.email || 'N/A'}
                </p>
                <p>
                  <strong>Phone:</strong> {result.lead.phone || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        {' '}
        {/* Added flex utilities for button alignment */}
        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isProcessing}
            className="text-slate-400 hover:text-slate-200"
          >
            Cancel
          </Button>
        )}
        <Button
          onClick={handleProcess}
          disabled={isProcessing || !file}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <UploadCloud className="mr-2 h-4 w-4" />
              Process Card
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
