import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Upload, Camera, FileImage, Loader2, CheckCircle, AlertCircle, 
  DollarSign, Calendar, Building, Tag, Wand2 
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { UploadFile } from "@/api/integrations";
import { ExtractDataFromUploadedFile } from "@/api/integrations";

export default function ReceiptProcessor({ onTransactionExtracted, onCancel }) {
  const [step, setStep] = useState('upload'); // upload, processing, review, complete
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);
  const [aiSuggestions, setAiSuggestions] = useState(null);

  // Receipt extraction schema
  const receiptSchema = {
    type: "object",
    properties: {
      merchant_name: { type: "string", description: "Name of the business/merchant" },
      total_amount: { type: "number", description: "Total amount paid" },
      transaction_date: { type: "string", description: "Date of transaction (YYYY-MM-DD format)" },
      description: { type: "string", description: "Description of purchase/service" },
      items: { 
        type: "array", 
        items: { 
          type: "object", 
          properties: {
            name: { type: "string" },
            quantity: { type: "number" },
            price: { type: "number" }
          }
        },
        description: "Individual items purchased" 
      },
      payment_method: { type: "string", description: "Method of payment (cash, card, etc.)" },
      tax_amount: { type: "number", description: "Tax amount if visible" },
      category_hints: { 
        type: "array", 
        items: { type: "string" },
        description: "Keywords that might help categorize this expense" 
      }
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.type.startsWith('image/')) {
        setError('Please select an image file (JPG, PNG, etc.)');
        return;
      }
      
      // Validate file size (max 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }

      setFile(selectedFile);
      setError(null);
    }
  };

  const processReceipt = async () => {
    if (!file) return;

    setProcessing(true);
    setStep('processing');
    setError(null);

    try {
      // Upload the file
      const uploadResult = await UploadFile({ file });
      
      if (!uploadResult.file_url) {
        throw new Error('Failed to upload file');
      }

      // Extract data using AI
      const extractResult = await ExtractDataFromUploadedFile({
        file_url: uploadResult.file_url,
        json_schema: receiptSchema
      });

      if (extractResult.status !== 'success') {
        throw new Error(extractResult.details || 'Failed to extract data from receipt');
      }

      const extracted = extractResult.output;
      
      // Generate AI suggestions for categorization
      const suggestions = await generateCategorySuggestions(extracted);
      
      setExtractedData(extracted);
      setAiSuggestions(suggestions);
      setStep('review');

    } catch (error) {
      console.error('Error processing receipt:', error);
      setError(error.message);
      setStep('upload');
    } finally {
      setProcessing(false);
    }
  };

  const generateCategorySuggestions = async (data) => {
    try {
      // Create a context string for AI categorization
      const context = [
        data.merchant_name,
        data.description,
        ...(data.items?.map(item => item.name) || []),
        ...(data.category_hints || [])
      ].filter(Boolean).join(' ').toLowerCase();

      // Simple rule-based categorization (can be enhanced with AI later)
      const categoryRules = {
        supplies: ['office', 'depot', 'staples', 'supplies', 'paper', 'pen'],
        utilities: ['electric', 'gas', 'water', 'internet', 'phone', 'utility'],
        marketing: ['advertising', 'facebook', 'google', 'marketing', 'promotion'],
        travel: ['airline', 'hotel', 'uber', 'taxi', 'gas station', 'rental'],
        meals: ['restaurant', 'food', 'coffee', 'lunch', 'dinner', 'cafe'],
        equipment: ['computer', 'laptop', 'software', 'hardware', 'tech'],
        rent: ['rent', 'lease', 'property', 'real estate'],
        payroll: ['payroll', 'salary', 'wages', 'employment']
      };

      let suggestedCategory = 'operating_expense'; // default
      let confidence = 0.3;

      // Check each category for matches
      for (const [category, keywords] of Object.entries(categoryRules)) {
        const matches = keywords.filter(keyword => context.includes(keyword));
        const categoryConfidence = matches.length / keywords.length;
        
        if (categoryConfidence > confidence) {
          confidence = categoryConfidence;
          suggestedCategory = category;
        }
      }

      return {
        category: suggestedCategory,
        confidence: Math.min(confidence * 100, 95), // Cap at 95%
        reasoning: `Based on merchant "${data.merchant_name}" and transaction details`
      };

    } catch (error) {
      console.error('Error generating suggestions:', error);
      return {
        category: 'operating_expense',
        confidence: 30,
        reasoning: 'Default categorization'
      };
    }
  };

  const handleConfirmTransaction = () => {
    if (!extractedData || !aiSuggestions) return;

    // Format the transaction data for CashFlow
    const transactionData = {
      transaction_type: 'expense', // Receipts are typically expenses
      category: aiSuggestions.category,
      amount: extractedData.total_amount || 0,
      transaction_date: extractedData.transaction_date || new Date().toISOString().split('T')[0],
      description: extractedData.description || `Purchase from ${extractedData.merchant_name}`,
      vendor_client: extractedData.merchant_name || '',
      payment_method: extractedData.payment_method?.toLowerCase() || '',
      notes: `Extracted from receipt. Items: ${extractedData.items?.map(i => i.name).join(', ') || 'N/A'}`,
      entry_method: 'document_extracted',
      processed_by_ai: true,
      tax_category: extractedData.tax_amount ? 'deductible' : 'unknown'
    };

    onTransactionExtracted(transactionData);
    setStep('complete');
  };

  if (step === 'processing') {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-12 text-center">
          <Loader2 className="w-16 h-16 animate-spin mx-auto mb-6 text-blue-600" />
          <h3 className="text-xl font-semibold mb-2">Processing Receipt</h3>
          <p className="text-slate-600 mb-4">AI is extracting transaction data from your receipt...</p>
          <div className="space-y-2 text-sm text-slate-500">
            <p>✅ Image uploaded successfully</p>
            <p>🔍 Analyzing receipt content...</p>
            <p>🧠 Extracting key information...</p>
            <p>🎯 Suggesting categorization...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'review' && extractedData) {
    return (
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-6 h-6 text-green-600" />
            Review Extracted Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* AI Suggestion Alert */}
          <Alert className="bg-blue-50 border-blue-200">
            <Wand2 className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>AI Suggestion:</strong> Categorized as &quot;{aiSuggestions?.category?.replace(/_/g, ' ')}&quot; 
              with {Math.round(aiSuggestions?.confidence || 0)}% confidence. {aiSuggestions?.reasoning}
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - Basic Info */}
            <div className="space-y-4">
              <div>
                <Label className="flex items-center gap-2">
                  <Building className="w-4 h-4" />
                  Merchant
                </Label>
                <Input 
                  value={extractedData.merchant_name || ''} 
                  readOnly 
                  className="bg-slate-50"
                />
              </div>

              <div>
                <Label className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Amount
                </Label>
                <Input 
                  value={`$${extractedData.total_amount?.toFixed(2) || '0.00'}`} 
                  readOnly 
                  className="bg-slate-50"
                />
              </div>

              <div>
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Date
                </Label>
                <Input 
                  value={extractedData.transaction_date || ''} 
                  readOnly 
                  className="bg-slate-50"
                />
              </div>

              <div>
                <Label className="flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Suggested Category
                </Label>
                <Badge className="bg-blue-100 text-blue-800 text-sm px-3 py-1">
                  {aiSuggestions?.category?.replace(/_/g, ' ') || 'Operating Expense'}
                </Badge>
              </div>
            </div>

            {/* Right Column - Details */}
            <div className="space-y-4">
              <div>
                <Label>Description</Label>
                <Textarea 
                  value={extractedData.description || ''} 
                  readOnly 
                  className="bg-slate-50 h-20"
                />
              </div>

              {extractedData.items && extractedData.items.length > 0 && (
                <div>
                  <Label>Items</Label>
                  <div className="bg-slate-50 rounded-md p-3 max-h-32 overflow-y-auto">
                    {extractedData.items.map((item, index) => (
                      <div key={index} className="text-sm flex justify-between">
                        <span>{item.name}</span>
                        <span>${item.price?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {extractedData.payment_method && (
                <div>
                  <Label>Payment Method</Label>
                  <Input 
                    value={extractedData.payment_method} 
                    readOnly 
                    className="bg-slate-50"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-6 border-t">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Try Different Image
              </Button>
              <Button onClick={handleConfirmTransaction} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4 mr-2" />
                Create Transaction
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'complete') {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-12 text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-6 text-green-600" />
          <h3 className="text-xl font-semibold mb-2 text-green-800">Transaction Created!</h3>
          <p className="text-slate-600 mb-6">Your receipt has been processed and added to your cash flow.</p>
          <Button onClick={onCancel} className="bg-green-600 hover:bg-green-700">
            Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Upload step
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="w-6 h-6 text-blue-600" />
          Upload Receipt or Invoice
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <FileImage className="w-4 h-4" />
          <AlertDescription>
            Upload a clear photo of your receipt or invoice. AI will automatically extract the amount, 
            merchant, date, and suggest the best category for your cash flow tracking.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
          {file ? (
            <div className="space-y-4">
              <FileImage className="w-16 h-16 mx-auto text-green-600" />
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-slate-500">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <Button onClick={processReceipt} disabled={processing} className="w-full">
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Extract Data with AI
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className="w-16 h-16 mx-auto text-slate-400" />
              <div>
                <p className="text-lg font-medium">Choose receipt or invoice image</p>
                <p className="text-slate-500">PNG, JPG up to 10MB</p>
              </div>
              <Input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full"
              />
            </div>
          )}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {file && (
            <Button variant="outline" onClick={() => setFile(null)}>
              Choose Different File
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}