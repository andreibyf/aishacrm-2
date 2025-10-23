import { useState, useEffect, useCallback } from "react";
import { DocumentationFile } from "@/api/entities";
import { getTenantFilter } from "../shared/tenantUtils";
import { useTenant } from "../shared/tenantContext";
import { User } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  FileImage, Loader2, 
  DollarSign, Calendar, Building, Tag, Wand2, ArrowRight
} from "lucide-react";
import { format } from "date-fns";

export default function ReceiptSelector({ onReceiptSelected, onCancel }) {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const { selectedTenantId } = useTenant();

  const loadReceiptsAndUser = useCallback(async () => {
    try {
      const user = await User.me();

      const tenantFilter = getTenantFilter(user, selectedTenantId);
      
      const allDocs = await DocumentationFile.filter({
        ...tenantFilter,
        $or: [
          { category: 'receipt' },
          { category: 'invoice' }
        ],
        processed_for_cashflow: { $ne: true }
      }, '-created_date');

      setReceipts(allDocs);
    } catch (error) {
      console.error("Error loading receipts:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    loadReceiptsAndUser();
  }, [loadReceiptsAndUser]);

  const processReceiptData = async (receipt) => {
    setProcessing(receipt.id);
    
    try {
      const { base44 } = await import('@/api/base44Client');
      const response = await base44.functions.invoke('processReceiptForCashFlow', { 
        receipt_id: receipt.id 
      });
      
      if (response.data && response.data.success && response.data.transaction_data) {
        const rawData = response.data.transaction_data;
        
        // CRITICAL: Serialize and deserialize to strip prototype chain
        const safeData = JSON.parse(JSON.stringify({
          transaction_type: rawData.transaction_type || 'expense',
          category: rawData.category || 'operating_expense',
          amount: rawData.amount || 0,
          transaction_date: rawData.transaction_date || new Date().toISOString().split('T')[0],
          description: rawData.description || '',
          vendor_client: rawData.vendor_client || '',
          payment_method: rawData.payment_method || '',
          notes: rawData.notes || '',
          status: 'actual',
          entry_method: 'document_extracted'
        }));
        
        onReceiptSelected(safeData, receipt.id);
      } else {
        throw new Error(response.data?.error || 'Failed to process receipt');
      }

    } catch (error) {
      console.error("Error processing receipt:", error);
      alert("Failed to process receipt: " + error.message);
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <Card className="w-full max-w-3xl mx-auto bg-slate-800 border-slate-700">
        <CardContent className="p-12 text-center">
          <Loader2 className="w-16 h-16 animate-spin mx-auto mb-6 text-blue-400" />
          <h3 className="text-xl font-semibold mb-2 text-slate-100">Loading Receipts</h3>
          <p className="text-slate-400">Finding your uploaded receipt documents...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-4xl mx-auto bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <FileImage className="w-6 h-6 text-blue-400" />
          Select Receipt to Convert
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert className="bg-blue-900/30 border-blue-700/50">
          <FileImage className="w-4 h-4 text-blue-400" />
          <AlertDescription className="text-blue-300">
            Select a receipt or invoice from your Document Processing uploads to convert into a cash flow transaction.
            <br />
            <strong>💡 Tip:</strong> For sales invoices you issued to customers, the system will suggest &quot;expense&quot; by default - 
            remember to change the transaction type to &quot;Income&quot; in the form that appears.
          </AlertDescription>
        </Alert>

        {receipts.length === 0 ? (
          <div className="text-center py-12">
            <FileImage className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-slate-100 mb-2">No Receipts Available</h3>
            <p className="text-slate-400 mb-4">
              Upload receipts or invoices through Document Processing first, then come back here to convert them to transactions.
            </p>
            <p className="text-sm text-slate-500">
              Supported: Expense receipts, sales invoices you issued, payment confirmations
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {receipts.map((receipt) => (
              <Card key={receipt.id} className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow bg-slate-700 border-slate-600">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-slate-100">{receipt.title}</h3>
                        <Badge className="bg-blue-900/50 text-blue-300 border-blue-700">
                          {receipt.file_type?.toUpperCase()}
                        </Badge>
                        {receipt.receipt_data && (
                          <Badge className="bg-green-900/50 text-green-300 border-green-700">
                            <Wand2 className="w-3 h-3 mr-1" />
                            AI Processed
                          </Badge>
                        )}
                      </div>
                      
                      {receipt.description && (
                        <p className="text-sm text-slate-400 mb-2">{receipt.description}</p>
                      )}

                      {receipt.receipt_data && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 p-3 bg-green-900/20 rounded-lg border border-green-700/30">
                          <div className="flex items-center gap-1">
                            <Building className="w-4 h-4 text-green-400" />
                            <span className="text-sm text-slate-300">{receipt.receipt_data.merchant_name || 'Unknown'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <DollarSign className="w-4 h-4 text-green-400" />
                            <span className="text-sm text-slate-300">${receipt.receipt_data.total_amount?.toFixed(2) || '0.00'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4 text-green-400" />
                            <span className="text-sm text-slate-300">
                              {receipt.receipt_data.transaction_date || 'No date'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Tag className="w-4 h-4 text-green-400" />
                            <span className="text-sm text-slate-300">
                              {receipt.receipt_data.suggested_category?.replace(/_/g, ' ') || 'Expense'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                        <span>Uploaded: {format(new Date(receipt.created_date), 'MMM d, yyyy')}</span>
                        <span>File: {receipt.file_name}</span>
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => processReceiptData(receipt)}
                      disabled={processing === receipt.id}
                      className="ml-4 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {processing === receipt.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4 mr-2" />
                          Use Receipt
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-between pt-6 border-t border-slate-700">
          <Button variant="outline" onClick={onCancel} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}