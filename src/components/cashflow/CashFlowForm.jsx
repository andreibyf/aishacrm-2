
import React, { useState, useEffect } from "react";
import { CashFlow } from "@/api/entities";
import { User } from "@/api/entities";
import { getTenantFilter, useTenant, sanitizeObject, safeGet } from "../shared/tenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useLogger } from "../shared/Logger";

export default function CashFlowForm({ transaction, accounts, opportunities, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    transaction_type: "income",
    category: "",
    amount: "",
    transaction_date: new Date().toISOString().split('T')[0],
    description: "",
    vendor_client: "",
    related_account_id: "",
    related_opportunity_id: "",
    is_recurring: false,
    recurrence_pattern: "",
    status: "actual",
    tags: [],
    tax_category: "unknown",
    payment_method: "",
    notes: ""
  });

  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const { selectedTenantId } = useTenant();
  const logger = useLogger();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await User.me();
        setCurrentUser(sanitizeObject(user));
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (!transaction) return;
    
    try {
      const sanitized = sanitizeObject(transaction);
      if (!sanitized) return;

      setFormData(prev => {
        const safeProps = [
          'transaction_type', 'category', 'amount', 'transaction_date',
          'description', 'vendor_client', 'related_account_id', 
          'related_opportunity_id', 'is_recurring', 'recurrence_pattern',
          'status', 'tags', 'tax_category', 'payment_method', 'notes'
        ];
        
        const updated = { ...prev };
        
        safeProps.forEach(prop => {
          const value = safeGet(sanitized, prop);
          if (value !== undefined && value !== null) {
            updated[prop] = value;
          }
        });
        
        return updated;
      });
    } catch (error) {
      console.error('Error setting form data from transaction:', error);
    }
  }, [transaction]);

  const categoryOptions = {
    income: [
      { value: "sales_revenue", label: "Sales Revenue" },
      { value: "recurring_revenue", label: "Recurring Revenue" },
      { value: "refund", label: "Refund Received" },
      { value: "other", label: "Other Income" }
    ],
    expense: [
      { value: "operating_expense", label: "Operating Expense" },
      { value: "marketing", label: "Marketing" },
      { value: "equipment", label: "Equipment" },
      { value: "supplies", label: "Supplies" },
      { value: "utilities", label: "Utilities" },
      { value: "rent", label: "Rent" },
      { value: "payroll", label: "Payroll" },
      { value: "professional_services", label: "Professional Services" },
      { value: "travel", label: "Travel" },
      { value: "meals", label: "Meals" },
      { value: "other", label: "Other Expense" }
    ]
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      logger.info('Starting cash flow transaction save', 'CashFlowForm', {
        transactionType: formData.transaction_type,
        amount: formData.amount,
        isEdit: !!transaction
      });

      const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
      const transactionData = {
        ...formData,
        amount: parseFloat(formData.amount),
        tenant_id: tenantFilter.tenant_id,
        entry_method: "manual"
      };

      const transId = safeGet(transaction, 'id');
      if (transId) {
        await CashFlow.update(transId, transactionData);
        logger.info('Cash flow transaction updated successfully', 'CashFlowForm', { transactionId: transId });
      } else {
        await CashFlow.create(transactionData);
        logger.info('Cash flow transaction created successfully', 'CashFlowForm');
      }

      onSubmit();
    } catch (error) {
      logger.error('Failed to save cash flow transaction', 'CashFlowForm', {
        error: error.message,
        stack: error.stack,
        transactionData: formData
      });
      alert("Failed to save transaction: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800 p-6 text-slate-200">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="transaction_type" className="text-slate-200 font-medium">Transaction Type</Label>
            <select
              id="transaction_type"
              value={formData.transaction_type}
              onChange={(e) => setFormData({...formData, transaction_type: e.target.value, category: ""})}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category" className="text-slate-200 font-medium">Category</Label>
            <select
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({...formData, category: e.target.value})}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            >
              <option value="">Select category</option>
              {categoryOptions[formData.transaction_type]?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount" className="text-slate-200 font-medium">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: e.target.value})}
              placeholder="0.00"
              className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-500"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transaction_date" className="text-slate-200 font-medium">Date</Label>
            <Input
              id="transaction_date"
              type="date"
              value={formData.transaction_date}
              onChange={(e) => setFormData({...formData, transaction_date: e.target.value})}
              className="bg-slate-700 border-slate-600 text-slate-200"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="text-slate-200 font-medium">Description</Label>
          <Input
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            placeholder="Enter transaction description"
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-500"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="vendor_client" className="text-slate-200 font-medium">Vendor/Client</Label>
          <Input
            id="vendor_client"
            value={formData.vendor_client}
            onChange={(e) => setFormData({...formData, vendor_client: e.target.value})}
            placeholder="Enter vendor or client name"
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-500"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="payment_method" className="text-slate-200 font-medium">Payment Method</Label>
          <select
            id="payment_method"
            value={formData.payment_method || ""}
            onChange={(e) => setFormData({...formData, payment_method: e.target.value})}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 text-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Select payment method</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="credit_card">Credit Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes" className="text-slate-200 font-medium">Notes</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({...formData, notes: e.target.value})}
            placeholder="Additional notes..."
            rows={3}
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel} 
            className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={loading} 
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>Save Transaction</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
