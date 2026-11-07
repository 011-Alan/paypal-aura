import React, { useEffect, useState, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import {
  Search,
  Sparkles,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Database,
  RotateCcw,
} from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';

const PRESET_NL_QUERIES = [
  'Show my dining expenditure over the last three months.',
  'How much did I spend on travel during my last holiday?',
  'Show unusual transactions above $50',
  'Show my rent and internet expenditure',
];

export const SpendingPage: React.FC = () => {
  const { balancesVisible } = useAuth();
  const [agGridData, setAgGridData] = useState<any>(null);
  const [pythonAnalytics, setPythonAnalytics] = useState<any>(null);
  const [nlQuery, setNlQuery] = useState('');
  const [aiExplanation, setAiExplanation] = useState('');
  const [elasticResult, setElasticResult] = useState<any>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [onlyUnusual, setOnlyUnusual] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/transactions');
      setAgGridData(res.agGrid);
      setPythonAnalytics(res.pythonAnalytics);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const handleNaturalLanguageSearch = async (queryText: string) => {
    const q = queryText.trim();
    setNlQuery(q);
    if (!q) {
      setAiExplanation('');
      setElasticResult(null);
      await loadTransactions();
      return;
    }

    setLoading(true);
    try {
      const [aiRes, elasticRes] = await Promise.all([
        apiRequest('/ai/ask', {
          method: 'POST',
          body: JSON.stringify({ prompt: q }),
        }),
        apiRequest('/elastic/search', {
          method: 'POST',
          body: JSON.stringify({ query: q, scope: 'transactions' }),
        }),
      ]);

      if (aiRes.agGridAnalytics) {
        setAgGridData(aiRes.agGridAnalytics);
      }
      setAiExplanation(aiRes.explanation || '');
      setElasticResult(elasticRes);
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const base = agGridData?.rows || [];
    return base.filter((r: any) => {
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (accountFilter && r.accountName !== accountFilter) return false;
      if (onlyUnusual && !r.isUnusual) return false;
      if (quickSearch.trim()) {
        const term = quickSearch.toLowerCase();
        return (
          r.merchant.toLowerCase().includes(term) ||
          r.description.toLowerCase().includes(term) ||
          r.category.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [agGridData, categoryFilter, accountFilter, onlyUnusual, quickSearch]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>((agGridData?.rows || []).map((r: any) => r.category));
    return Array.from(set);
  }, [agGridData]);

  const uniqueAccounts = useMemo(() => {
    const set = new Set<string>((agGridData?.rows || []).map((r: any) => r.accountName));
    return Array.from(set);
  }, [agGridData]);

  const columnDefs = useMemo<ColDef[]>(
    () => [
      {
        field: 'date',
        headerName: 'Date',
        sortable: true,
        filter: true,
        width: 125,
      },
      {
        field: 'merchant',
        headerName: 'Merchant',
        sortable: true,
        filter: true,
        flex: 1.2,
        minWidth: 170,
        cellRenderer: (params: any) => (
          <div className="font-semibold text-navy-900 dark:text-white">{params.value}</div>
        ),
      },
      {
        field: 'description',
        headerName: 'Description',
        sortable: true,
        filter: true,
        flex: 1.5,
        minWidth: 200,
      },
      {
        field: 'category',
        headerName: 'Category',
        sortable: true,
        filter: true,
        width: 135,
        cellRenderer: (params: any) => (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {params.value}
          </span>
        ),
      },
      {
        field: 'accountName',
        headerName: 'Account',
        sortable: true,
        filter: true,
        width: 175,
      },
      {
        field: 'amount',
        headerName: 'Amount',
        sortable: true,
        filter: 'agNumberColumnFilter',
        width: 140,
        cellRenderer: (params: any) => {
          const isInc = params.data?.type === 'income';
          return (
            <span className={`font-bold ${isInc ? 'text-emerald-600 dark:text-emerald-400' : 'text-navy-900 dark:text-white'}`}>
              {isInc ? '+' : '-'}
              {formatInr(params.value, !balancesVisible)}
            </span>
          );
        },
      },
      {
        field: 'status',
        headerName: 'Intelligence Status',
        sortable: true,
        width: 175,
        cellRenderer: (params: any) => {
          if (params.data?.isUnusual) {
            return (
              <span
                title={params.data?.unusualReason}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Unusual Pattern
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Normal
            </span>
          );
        },
      },
    ],
    [balancesVisible]
  );

  const summaryMetrics = useMemo(() => {
    const income = filteredRows.filter((r: any) => r.type === 'income').reduce((s: number, r: any) => s + r.amount, 0);
    const expense = filteredRows.filter((r: any) => r.type === 'expense').reduce((s: number, r: any) => s + r.amount, 0);
    const unusual = filteredRows.filter((r: any) => r.isUnusual).length;
    return { income, expense, net: income - expense, unusual, count: filteredRows.length };
  }, [filteredRows]);

  return (
    <div className="space-y-6">
      {/* Natural-Language Analytics Header (AG Grid + Gemini + Elastic) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-navy-900 dark:text-white">
              Interactive Spending &amp; Financial Analytics Workbench
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Powered by AG Grid Financial Analytics Engine, Elastic Financial Memory &amp; Python Anomaly Detection
            </p>
          </div>
          <button
            onClick={() => handleNaturalLanguageSearch('')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 self-start transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset All Filters
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNaturalLanguageSearch(nlQuery);
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              placeholder='Ask in natural language: e.g. "Show my dining expenditure over the last three months."'
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white text-xs sm:text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
          >
            {loading ? 'Querying...' : 'Run Natural-Language Analytics'}
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {PRESET_NL_QUERIES.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleNaturalLanguageSearch(preset)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:text-blue-700 dark:hover:text-blue-300 text-xs text-slate-600 dark:text-slate-300 font-medium border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition"
            >
              “{preset}”
            </button>
          ))}
        </div>

        {aiExplanation && (
          <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 text-xs sm:text-sm text-navy-900 dark:text-slate-200 space-y-2 transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> AURA Verified Findings (No Invented Figures)
              </span>
              {elasticResult && (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                  <Database className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  Elastic + MongoDB Verified: {formatInr(elasticResult.summary?.verifiedTotalExpense)}
                </span>
              )}
            </div>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{aiExplanation}</p>
          </div>
        )}
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400">Filtered Transactions</div>
          <div className="text-xl font-bold text-navy-900 dark:text-white mt-1">{summaryMetrics.count} Records</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400">Filtered Expenditure</div>
          <div className="text-xl font-bold text-navy-900 dark:text-white mt-1">{formatInr(summaryMetrics.expense)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400">Filtered Income</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatInr(summaryMetrics.income)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400">Unusual Transactions</div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{summaryMetrics.unusual} Flagged</div>
        </div>
      </div>

      {/* AG Grid Interactive Toolbar & Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Quick search merchant or tag..."
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white text-xs placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              {uniqueCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Accounts</option>
              {uniqueAccounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyUnusual}
                onChange={(e) => setOnlyUnusual(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-blue-600"
              />
              <Filter className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Only Unusual Spend
            </label>
          </div>
        </div>

        <div className="ag-theme-quartz w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800" style={{ height: 440 }}>
          <AgGridReact
            rowData={filteredRows}
            columnDefs={columnDefs}
            pagination={true}
            paginationPageSize={10}
            paginationPageSizeSelector={[10, 25, 50]}
            animateRows={true}
          />
        </div>
      </div>

      {/* Category-Wise Aggregation Cards */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <h3 className="text-sm font-bold text-navy-900 dark:text-white mb-4">
          Category-Wise Expenditure &amp; Anomaly Breakdown
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(agGridData?.categoryAggregations || []).map((cat: any) => (
            <div
              key={cat.category}
              onClick={() => setCategoryFilter(cat.category === categoryFilter ? '' : cat.category)}
              className={`p-4 rounded-2xl border cursor-pointer transition ${
                categoryFilter === cat.category
                  ? 'border-blue-500 dark:border-blue-400 bg-blue-50/60 dark:bg-blue-950/60'
                  : 'border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-navy-900 dark:text-white">{cat.category}</span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{cat.sharePercent}%</span>
              </div>
              <div className="text-lg font-bold text-navy-900 dark:text-white mt-1">{formatInr(cat.totalAmount, !balancesVisible)}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {cat.count} txns • Avg {formatInr(cat.avgAmount, !balancesVisible)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
