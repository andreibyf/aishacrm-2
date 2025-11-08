
import { useState, useEffect, useCallback } from 'react';
import { CashFlow } from '@/api/entities';
import { Account } from '@/api/entities';
import { Opportunity } from '@/api/entities';
// User comes from global context
import { useUser } from '@/components/shared/useUser.js';
import CashFlowSummary from '../components/cashflow/CashFlowSummary';
import CashFlowChart from '../components/cashflow/CashFlowChart';
import CashFlowForm from '../components/cashflow/CashFlowForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getTenantFilter } from '../components/shared/tenantUtils';
import { useTenant } from '../components/shared/tenantContext';
import { Plus, Loader2 } from 'lucide-react';
import { useLogger } from '../components/shared/Logger';

function ensurePlain(obj) {
  if (obj && typeof obj === "object" && typeof obj.hasOwnProperty !== "function") {
    return JSON.parse(JSON.stringify(obj));
  }
  return obj;
}

function CashFlowPage() {
  const { selectedTenantId } = useTenant();
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    searchTerm: '',
    type: 'all',
    period: 'month'
  });
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const { user: currentUser } = useUser();
  const logger = useLogger();

  // User provided by global context

  useEffect(() => {
    const loadStaticData = async () => {
      if (!currentUser) return;
      
      try {
        const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
        
        // Guard: Don't load if no tenant_id for superadmin (must select a tenant first)
        if ((currentUser.role === 'superadmin' || currentUser.role === 'admin') && !tenantFilter?.tenant_id) {
          if (import.meta.env.DEV) {
            console.log("[CashFlow] Skipping data load - no tenant selected");
          }
          setAccounts([]);
          setOpportunities([]);
          return;
        }
        
        const [accountsData, opportunitiesData] = await Promise.all([
          Account.filter(tenantFilter),
          Opportunity.filter(tenantFilter),
        ]);
        setAccounts(accountsData || []);
        setOpportunities(opportunitiesData || []);
        logger.info('Static data (accounts, opportunities) loaded', 'CashFlowPage', {
          accountsCount: accountsData?.length || 0,
          opportunitiesCount: opportunitiesData?.length || 0
        });
      } catch (error) {
        logger.error('Failed to load static data', 'CashFlowPage', { error: error.message });
      }
    };
    loadStaticData();
  }, [currentUser, selectedTenantId, logger]);

  const fetchTransactions = useCallback(async () => {
    if (!currentUser) return;

    setLoading(true);
    try {
      const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
      
      if (!tenantFilter || !tenantFilter.tenant_id) {
        logger.warning('No tenant context available for CashFlow', 'CashFlowPage', {
          userId: currentUser.email,
          selectedTenantId
        });
        setTransactions([]);
        setLoading(false);
        return;
      }

      let combinedFilter = { ...tenantFilter };

      if (filters.searchTerm) {
        combinedFilter.description__icontains = filters.searchTerm;
      }
      if (filters.type !== 'all') {
        combinedFilter.transaction_type = filters.type;
      }

      const data = await CashFlow.filter(combinedFilter, '-transaction_date');
      
      const sanitized = Array.isArray(data) ? data.map(ensurePlain) : [];
      setTransactions(sanitized);
      
      logger.info('Cash flow transactions loaded', 'CashFlowPage', {
        count: sanitized.length,
        tenantId: tenantFilter.tenant_id,
        filters: filters
      });
    } catch (error) {
      logger.error('Failed to fetch cash flow transactions', 'CashFlowPage', {
        error: error.message,
        stack: error.stack,
        userId: currentUser?.id,
        selectedTenantId,
        filters
      });
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedTenantId, filters, logger]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleAddTransaction = () => {
    setEditingTransaction(null);
    setShowForm(true);
    logger.debug('Add transaction initiated', 'CashFlowPage');
  };

  const handleEditTransaction = (transaction) => {
    setEditingTransaction(ensurePlain(transaction));
    setShowForm(true);
    logger.debug('Edit transaction initiated', 'CashFlowPage', { transactionId: transaction.id });
  };

  const handleDeleteTransaction = async (id) => {
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        await CashFlow.delete(id);
        logger.info('Cash flow transaction deleted successfully', 'CashFlowPage', { transactionId: id });
        await fetchTransactions();
      } catch (error) {
        logger.error('Failed to delete transaction', 'CashFlowPage', {
          error: error.message,
          transactionId: id,
          stack: error.stack
        });
      }
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingTransaction(null);
    logger.debug('CashFlowForm closed', 'CashFlowPage');
  };

  const handleFormSubmit = async () => {
    setShowForm(false);
    setEditingTransaction(null);
    logger.info('CashFlowForm submitted, refetching transactions', 'CashFlowPage');
    await fetchTransactions();
  };

  const calculateSummary = (data) => {
    const sanitizedData = Array.isArray(data) ? data.map(ensurePlain) : [];
    
    let totalIncome = 0;
    let totalExpenses = 0;
    
    for (let i = 0; i < sanitizedData.length; i++) {
      const transaction = sanitizedData[i];
      if (!transaction) continue;
      
      const type = transaction['transaction_type'];
      const amount = parseFloat(transaction['amount']) || 0;
      
      if (type === 'income') {
        totalIncome += amount;
      } else if (type === 'expense') {
        totalExpenses += amount;
      }
    }
    
    return {
      totalIncome,
      totalExpenses,
      netCashFlow: totalIncome - totalExpenses
    };
  };

  const summary = calculateSummary(transactions);
  const safeSummary = ensurePlain(summary);
  const safeTransactions = transactions.map(ensurePlain);

  if (loading && !currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Cash Flow Management</h1>
          <p className="text-slate-600 mt-2">Track income, expenses, and financial performance</p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={handleAddTransaction}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Transaction
          </Button>
        </div>
      </div>

      <CashFlowSummary summary={safeSummary} />
      
      <CashFlowChart transactions={safeTransactions} />

      <div className="bg-slate-800 border-slate-700 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Search transactions..."
              value={filters.searchTerm}
              onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
              className="bg-slate-700 border-slate-600 text-slate-200"
            />
          </div>

          <div className="flex gap-4">
            <Select
              value={filters.type}
              onValueChange={(value) => setFilters({ ...filters, type: value })}
            >
              <SelectTrigger className="w-[180px] bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.period}
              onValueChange={(value) => setFilters({ ...filters, period: value })}
            >
              <SelectTrigger className="w-[180px] bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Last Week</SelectItem>
                <SelectItem value="month">Last Month</SelectItem>
                <SelectItem value="quarter">Last Quarter</SelectItem>
                <SelectItem value="year">Last Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-100">Recent Transactions</h2>
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto" />
            </div>
          ) : safeTransactions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400 mb-4">No transactions found</p>
              <Button onClick={handleAddTransaction}>
                Add Your First Transaction
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {safeTransactions.map((transaction, index) => {
                const t = ensurePlain(transaction);
                return (
                  <div key={t['id'] || index} className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-slate-200">{t['description']}</p>
                      <p className="text-sm text-slate-400">{t['category']}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(t['transaction_date']).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-lg font-bold ${t['transaction_type'] === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                        {t['transaction_type'] === 'income' ? '+' : '-'}${Math.abs(parseFloat(t['amount']) || 0).toFixed(2)}
                      </span>
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => handleEditTransaction(t)} 
                          variant="outline"
                          size="sm"
                        >
                          Edit
                        </Button>
                        <Button 
                          onClick={() => handleDeleteTransaction(t['id'])} 
                          variant="destructive"
                          size="sm"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4"
          style={{ zIndex: 9999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleFormClose();
            }
          }}
        >
          <div 
            className="w-full max-w-2xl bg-slate-800 rounded-lg shadow-2xl border border-slate-700" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-100">
                {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
              </h2>
              <Button 
                onClick={handleFormClose}
                variant="ghost"
                size="sm"
                className="text-slate-400 hover:text-slate-200 hover:bg-slate-700"
              >
                Close
              </Button>
            </div>
            <CashFlowForm
              transaction={editingTransaction}
              accounts={accounts}
              opportunities={opportunities}
              onSubmit={handleFormSubmit}
              onCancel={handleFormClose}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default CashFlowPage;
