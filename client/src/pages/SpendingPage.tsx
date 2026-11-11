import React, { useEffect, useState, useMemo } from 'react';
import { ColDef } from 'ag-grid-community';
import {
  Search,
  Sparkles,
  Filter,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingDown,
  Layers,
  X,
  CreditCard,
  PieChart,
} from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { SpendingIntelligence } from '../components/SpendingIntelligence';
import { AuraDataGrid } from '../components/grid/AuraDataGrid';
import { pageActionDispatcher } from '../lib/pageActionDispatcher';
import { gridStateManager } from '../lib/gridStateManager';

interface TransactionRow {
  id: string;
  date: string;
  merchant: string;
  description: string;
  category: string;
  accountName: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  status?: string;
  isUnusual?: boolean;
  unusualReason?: string;
  paymentMethod?: string;
}

export const SpendingPage: React.FC = () => {
  const { balancesVisible, formatMoney } = useAuth();
  const [spendingView, setSpendingView] = useState<'activity' | 'insights'>('activity');
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [quickSearch, setQuickSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');

  // Row Inspection Modal
  const [selectedTx, setSelectedTx] = useState<TransactionRow | null>(null);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/transactions');
      const rawRows = res.agGrid?.rows || [];
      setRows(rawRows);
      pageActionDispatcher.setPageReady('transactions', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();

    const unregister = pageActionDispatcher.registerPage('transactions', {
      executeAction: async (actionType: string, payload: any = {}) => {
        const norm = (actionType || '').toLowerCase();
        if (norm === 'filter_transactions' || norm === 'search_transactions' || norm === 'show_transactions' || norm === 'open_transactions') {
          if (payload.quickSearch || payload.query) {
            setQuickSearch(payload.quickSearch || payload.query);
          }
          if (payload.category) {
            setSelectedCategory(payload.category);
          }
          if (payload.type) {
            setTypeFilter(payload.type);
          }
          const minAmount = payload.minAmount || payload.amountMin || (payload.filterModel?.amount?.filter);
          if (minAmount) {
            gridStateManager.applyFilters('transactions-grid', {
              amount: {
                filterType: 'number',
                type: 'greaterThan',
                filter: Number(minAmount),
              },
            });
          } else if (payload.filterModel) {
            gridStateManager.applyFilters('transactions-grid', payload.filterModel);
          } else if (norm === 'show_transactions' || norm === 'search_transactions' || payload.action === 'show_recent') {
            handleResetFilters();
            await loadTransactions();
          }
          return true;
        }
        if (norm === 'sort_transactions') {
          gridStateManager.applySorting('transactions-grid', [
            { colId: payload.field || 'amount', sort: payload.direction || 'desc' },
          ]);
          return true;
        }
        return true;
      },
      isReady: () => !loading,
    });

    return () => {
      unregister();
      pageActionDispatcher.setPageReady('transactions', false);
    };
  }, []);

  const handleResetFilters = () => {
    setQuickSearch('');
    setSelectedCategory('');
    setSelectedAccount('');
    setTypeFilter('all');
    loadTransactions();
  };

  // Filtered Rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (selectedCategory && r.category !== selectedCategory) return false;
      if (selectedAccount && r.accountName !== selectedAccount) return false;
      if (quickSearch.trim()) {
        const term = quickSearch.toLowerCase();
        const matchesMerchant = r.merchant?.toLowerCase().includes(term);
        const matchesDesc = r.description?.toLowerCase().includes(term);
        const matchesCat = r.category?.toLowerCase().includes(term);
        if (!matchesMerchant && !matchesDesc && !matchesCat) return false;
      }
      return true;
    });
  }, [rows, typeFilter, selectedCategory, selectedAccount, quickSearch]);

  // Unique Accounts & Categories
  const uniqueCategories = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      if (r.type === 'expense') {
        map.set(r.category, (map.get(r.category) || 0) + (r.amount || 0));
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const uniqueAccounts = useMemo(() => {
    const set = new Set<string>(rows.map((r) => r.accountName).filter(Boolean));
    return Array.from(set);
  }, [rows]);

  // Summary Metrics: Exactly the 3 requested: Total Spent, Total Received, Transaction Count
  const summaryMetrics = useMemo(() => {
    const expense = filteredRows
      .filter((r) => r.type === 'expense')
      .reduce((s, r) => s + (r.amount || 0), 0);
    const income = filteredRows
      .filter((r) => r.type === 'income')
      .reduce((s, r) => s + (r.amount || 0), 0);
    return {
      totalSpent: expense,
      totalReceived: income,
      count: filteredRows.length,
    };
  }, [filteredRows]);

  const totalAllExpense = useMemo(() => {
    return rows.filter((r) => r.type === 'expense').reduce((s, r) => s + (r.amount || 0), 0) || 1;
  }, [rows]);

  const columnDefs: ColDef<TransactionRow>[] = useMemo(() => [
    {
      field: 'date',
      headerName: 'Date',
      filter: 'agDateColumnFilter',
      sortable: true,
      width: 130,
    },
    {
      field: 'merchant',
      headerName: 'Merchant',
      filter: 'agTextColumnFilter',
      sortable: true,
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: any) => (
        <span className="font-semibold text-navy-900 dark:text-white">
          {params.value}
        </span>
      ),
    },
    {
      field: 'description',
      headerName: 'Description',
      filter: 'agTextColumnFilter',
      sortable: true,
      flex: 1.5,
      minWidth: 180,
      cellRenderer: (params: any) => (
        <span className="text-slate-600 dark:text-slate-300 truncate block">
          {params.value}
        </span>
      ),
    },
    {
      field: 'category',
      headerName: 'Category',
      filter: 'agTextColumnFilter',
      sortable: true,
      width: 140,
      cellRenderer: (params: any) => (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          {params.value}
        </span>
      ),
    },
    {
      field: 'amount',
      headerName: 'Amount',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 130,
      cellRenderer: (params: any) => {
        const isIncome = params.data?.type === 'income';
        return (
          <span className={`font-bold ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-navy-900 dark:text-white'}`}>
            {isIncome ? '+' : '-'}
            {!balancesVisible ? '••••••' : formatMoney(params.value)}
          </span>
        );
      },
    },
    {
      field: 'isUnusual',
      headerName: 'Status',
      filter: 'agTextColumnFilter',
      sortable: true,
      width: 120,
      cellRenderer: (params: any) => {
        const isUnusual = params.value;
        return isUnusual ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-3 h-3" /> Flagged
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Normal
          </span>
        );
      },
    },
    {
      headerName: 'Action',
      width: 90,
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedTx(params.data);
          }}
          className="text-blue-600 dark:text-blue-400 hover:underline font-semibold text-xs"
        >
          View
        </button>
      ),
    },
  ], [balancesVisible, formatMoney]);

  return (
    <div className="space-y-6">
      {/* Header & Tab Selector */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white">
            Transactions
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Review your activity, search records, and analyze spending patterns.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700/60 self-start sm:self-center text-xs font-semibold">
          <button
            type="button"
            onClick={() => setSpendingView('activity')}
            className={`px-4 py-2 rounded-xl transition ${
              spendingView === 'activity'
                ? 'bg-white dark:bg-slate-700 text-navy-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
            }`}
          >
            Activity &amp; Records
          </button>
          <button
            type="button"
            onClick={() => setSpendingView('insights')}
            className={`px-4 py-2 rounded-xl transition ${
              spendingView === 'insights'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
            }`}
          >
            Spending Intelligence
          </button>
        </div>
      </div>

      {spendingView === 'insights' ? (
        <SpendingIntelligence />
      ) : (
        <>
          {/* A. Summary Metrics Strip: Total Spent, Total Received, Transaction Count */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Spent</span>
                <div className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                  {!balancesVisible ? '••••••' : formatMoney(summaryMetrics.totalSpent)}
                </div>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Outflow in selected period</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Received</span>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {!balancesVisible ? '••••••' : formatMoney(summaryMetrics.totalReceived)}
                </div>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Inflow in selected period</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Transactions</span>
                <div className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                  {summaryMetrics.count}
                </div>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Filtered records</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* B. Compact Category Breakdown Cards */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Top Spending Categories
              </span>
              {selectedCategory && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('')}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Show all categories
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {uniqueCategories.slice(0, 6).map(([cat, total]) => {
                const pct = Math.round((total / totalAllExpense) * 100);
                const isSelected = selectedCategory === cat;

                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(isSelected ? '' : cat)}
                    className={`p-3.5 rounded-2xl border text-left transition ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/50 dark:bg-purple-950/40 ring-2 ring-purple-500/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold text-navy-900 dark:text-white truncate">
                      {cat}
                    </div>
                    <div className="text-sm font-extrabold text-navy-900 dark:text-white mt-1">
                      {!balancesVisible ? '••••••' : formatMoney(total)}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {pct}% of spending
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* D. Scannable Transaction Table */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={quickSearch}
                    onChange={(e) => setQuickSearch(e.target.value)}
                    placeholder="Search merchant or description..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as any)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Flow</option>
                  <option value="expense">Expenses Only</option>
                  <option value="income">Income Only</option>
                </select>

                {uniqueAccounts.length > 1 && (
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Accounts</option>
                    {uniqueAccounts.map((acc) => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {(quickSearch || selectedCategory || selectedAccount || typeFilter !== 'all') && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs text-slate-500 hover:text-navy-900 dark:hover:text-white flex items-center gap-1 self-start sm:self-center"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset filters
                </button>
              )}
            </div>

            {/* AG Grid Data Table */}
            <div className="mt-4">
              <AuraDataGrid
                gridId="transactions-grid"
                source="transactions"
                rowData={filteredRows}
                columnDefs={columnDefs}
                quickSearch={quickSearch}
                onRowClicked={(row: any) => setSelectedTx(row)}
                height="540px"
              />
            </div>
          </div>
        </>
      )}

      {/* Transaction Details Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-navy-900 dark:text-white">Transaction Details</h3>
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-navy-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Date</span>
                <span className="text-slate-700 dark:text-slate-300">{selectedTx.date}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Merchant</span>
                <span className="font-bold text-navy-900 dark:text-white">{selectedTx.merchant}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Category</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedTx.category}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Account</span>
                <span className="text-slate-700 dark:text-slate-300">{selectedTx.accountName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Amount</span>
                <span className="font-bold text-sm text-navy-900 dark:text-white">
                  {selectedTx.type === 'income' ? '+' : '-'}
                  {formatMoney(selectedTx.amount)}
                </span>
              </div>
              {selectedTx.unusualReason && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs">
                  <span className="font-bold block mb-0.5">Audit Note:</span>
                  {selectedTx.unusualReason}
                </div>
              )}
              {selectedTx.description && (
                <div className="py-1">
                  <span className="text-slate-400 block mb-0.5">Description</span>
                  <span className="text-slate-700 dark:text-slate-300">{selectedTx.description}</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTx(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
