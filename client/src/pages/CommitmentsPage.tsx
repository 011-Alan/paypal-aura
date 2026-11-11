import React, { useEffect, useState, useMemo } from 'react';
import { ColDef } from 'ag-grid-community';
import { Repeat, CheckCircle2, AlertCircle, Plus, Calendar, Clock, Layers, ListOrdered, ShieldCheck } from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { FinancialSchedulerView } from '../components/FinancialSchedulerView';
import { AuraDataGrid } from '../components/grid/AuraDataGrid';

export const CommitmentsPage: React.FC = () => {
  const { balancesVisible, formatMoney } = useAuth();
  const [viewMode, setViewMode] = useState<'scheduler' | 'list'>('scheduler');
  const [mandates, setMandates] = useState<any[]>([]);
  const [confirmedTotal, setConfirmedTotal] = useState(0);

  // New mandate form
  const [title, setTitle] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('Subscription');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('5');
  const [submitting, setSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const loadMandates = async () => {
    try {
      const res = await apiRequest('/mandates');
      setMandates(res.mandates || []);
      setConfirmedTotal(res.confirmedMonthlyOutflow || 0);
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    loadMandates();
  }, []);

  const handleConfirmMandate = async (id: string) => {
    await apiRequest(`/mandates/${id}/confirm`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed' }),
    });
    await loadMandates();
  };

  const handleCreateMandate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !merchant || !amount) return;
    setSubmitting(true);
    try {
      await apiRequest('/mandates', {
        method: 'POST',
        body: JSON.stringify({
          title,
          merchant,
          category,
          amount: Number(amount),
          dueDayOfMonth: Number(dueDay || 5),
        }),
      });
      setTitle('');
      setMerchant('');
      setAmount('');
      setShowAddForm(false);
      await loadMandates();
    } finally {
      setSubmitting(false);
    }
  };

  // Summary Metrics (Section 3.A)
  const upcomingCommitments = useMemo(() => {
    return mandates.filter((m) => m.category !== 'Salary');
  }, [mandates]);

  const upcomingOutflow = useMemo(() => {
    return upcomingCommitments.reduce((s, m) => s + (m.amount || 0), 0);
  }, [upcomingCommitments]);

  const overdueCount = useMemo(() => {
    const today = new Date().getDate();
    return upcomingCommitments.filter((m) => m.dueDayOfMonth < today && m.status === 'inferred').length;
  }, [upcomingCommitments]);

  const formattedMandates = useMemo(() => {
    return mandates.map((m) => ({
      ...m,
      id: m._id || m.id,
    }));
  }, [mandates]);

  const columnDefs: ColDef[] = useMemo(() => [
    {
      field: 'dueDayOfMonth',
      headerName: 'Due Day',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 140,
      valueFormatter: (params) => `${params.value}th of month`,
    },
    {
      field: 'title',
      headerName: 'Title',
      filter: 'agTextColumnFilter',
      sortable: true,
      flex: 1.2,
      minWidth: 150,
      cellRenderer: (params: any) => (
        <span className="font-bold text-navy-900 dark:text-white">
          {params.value}
        </span>
      ),
    },
    {
      field: 'merchant',
      headerName: 'Payee / Merchant',
      filter: 'agTextColumnFilter',
      sortable: true,
      flex: 1,
      minWidth: 140,
      cellRenderer: (params: any) => (
        <span className="text-slate-600 dark:text-slate-300">
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
      cellRenderer: (params: any) => (
        <span className="font-bold text-navy-900 dark:text-white">
          {!balancesVisible ? '••••••' : formatMoney(params.value)}
        </span>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      filter: 'agTextColumnFilter',
      sortable: true,
      width: 130,
      cellRenderer: (params: any) => {
        const isConfirmed = params.value === 'confirmed';
        return isConfirmed ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3" /> Confirmed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-3 h-3" /> Inferred
          </span>
        );
      },
    },
    {
      headerName: 'Action',
      width: 110,
      sortable: false,
      filter: false,
      cellRenderer: (params: any) => {
        if (params.data?.status === 'inferred') {
          return (
            <button
              type="button"
              onClick={() => handleConfirmMandate(params.data._id || params.data.id)}
              className="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition"
            >
              Confirm
            </button>
          );
        }
        return <span className="text-slate-400 text-xs">--</span>;
      },
    },
  ], [balancesVisible, formatMoney]);

  return (
    <div className="space-y-6">
      {/* Header & View Mode Switcher */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white tracking-tight">
            Bills &amp; Commitments
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your recurring obligations, subscriptions, and scheduled payments.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('scheduler')}
              className={`px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                viewMode === 'scheduler'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-700 text-navy-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              List
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Bill</span>
          </button>
        </div>
      </div>

      {/* A. Summary Metrics Strip (Section 3.A) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Upcoming Commitments</span>
            <div className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
              {upcomingCommitments.length}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Recurring this month</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center">
            <Repeat className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Upcoming Outflow</span>
            <div className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
              {!balancesVisible ? '••••••' : formatMoney(upcomingOutflow)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">Ringfenced from monthly income</span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Overdue Commitments</span>
            <div className={`text-2xl font-bold mt-1 ${overdueCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {overdueCount}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {overdueCount > 0 ? 'Action required' : 'All obligations on track'}
            </span>
          </div>
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
            overdueCount > 0 ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'
          }`}>
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Expandable Add Commitment Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-navy-900 dark:text-white">Add Recurring Commitment</h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleCreateMandate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Electric Bill"
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Merchant / Payee</label>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="e.g. National Grid"
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-blue-500"
              >
                <option value="Rent">Rent &amp; Housing</option>
                <option value="Utilities">Utilities &amp; Bills</option>
                <option value="Subscription">Subscription</option>
                <option value="Insurance">Insurance</option>
                <option value="Loan EMI">Loan Repayment</option>
                <option value="Education">Education</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Amount ($)</label>
              <input
                type="number"
                min="1"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="100"
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Due Day</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className="w-20 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
                >
                  {submitting ? 'Adding...' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Main Experience: Either Scheduler Timeline OR Commitments List (Never competing simultaneously) */}
      {viewMode === 'scheduler' ? (
        <FinancialSchedulerView />
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-navy-900 dark:text-white">Scheduled Commitments</h3>
              <p className="text-xs text-slate-400">Explore, sort, filter and analyze your recurring commitments</p>
            </div>
            <span className="text-xs text-slate-400 font-medium">{mandates.length} Total</span>
          </div>

          <AuraDataGrid
            gridId="commitments-grid"
            source="commitments"
            rowData={formattedMandates}
            columnDefs={columnDefs}
            height="460px"
          />
        </div>
      )}
    </div>
  );
};
