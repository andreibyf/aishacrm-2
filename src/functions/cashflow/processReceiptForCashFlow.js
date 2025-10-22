/**
 * processReceiptForCashFlow
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { receipt_id } = await req.json();
    
    if (!receipt_id) {
      return Response.json({ 
        success: false, 
        error: 'receipt_id is required' 
      }, { status: 400 });
    }

    const receipt = await base44.entities.DocumentationFile.get(receipt_id);
    
    if (!receipt || !receipt.receipt_data) {
      return Response.json({ 
        success: false, 
        error: 'Receipt not found or not processed' 
      }, { status: 404 });
    }

    // CRITICAL: Use plain object {} instead of Object.create(null)
    const transactionData = {
      transaction_type: receipt.receipt_data.suggested_category?.includes('revenue') ? 'income' : 'expense',
      category: receipt.receipt_data.suggested_category || 'operating_expense',
      amount: receipt.receipt_data.total_amount || 0,
      transaction_date: receipt.receipt_data.transaction_date || new Date().toISOString().split('T')[0],
      description: receipt.receipt_data.merchant_name || 'Transaction from receipt',
      vendor_client: receipt.receipt_data.merchant_name || '',
      payment_method: receipt.receipt_data.payment_method || '',
      notes: `Extracted from receipt: ${receipt.file_name}`,
      receipt_url: receipt.file_uri,
      status: 'actual',
      entry_method: 'document_extracted',
      processed_by_ai: true
    };

    console.log('[RECEIPT PROCESSOR] Created transaction data:', JSON.stringify(transactionData));

    return Response.json({
      success: true,
      transaction_data: transactionData
    });

  } catch (error) {
    console.error('[RECEIPT PROCESSOR] Error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});

----------------------------

export default processReceiptForCashFlow;
