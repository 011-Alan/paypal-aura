import React, { useEffect, useState, useMemo } from 'react';
import { ColDef } from 'ag-grid-community';
import { PieChart, Sparkles, CheckCircle2, XCircle, RefreshCw, ShieldAlert, Table } from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';
import { AuraDataGrid } from '../components/grid/AuraDataGrid';

export const FinancialPlanPage: React.FC = () => {
  const { balancesVisible } = useAuth();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [allocationView, setAllocationView] = useState<'cards' | 'grid'>('cards');

  const loadPlan = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/plans');
      setPlan(res.activePlan);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlan();
  }, []);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const res = await apiRequest('/plans/generate', { method: 'POST', body: JSON.stringify({}) });
      setPlan(res.plan);
    } finally {
      setRegenerating(false);
    }
  };

  const handleRecoveryDecision = async (recId: string, status: 'accepted' | 'rejected') => {
    if (!plan) return;
    const res = await apiRequest(`/plans/${plan._id}/recovery/${recId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setPlan(res.plan);
  };

  const allocationRows = useMemo(() => {
    return (plan?.allocations || []).map((alloc: any, idx: number) => ({
      ...alloc,
      id: alloc.category || `cat-${idx}`,
    }));
  }, [plan]);

  const allocationColumnDefs: ColDef[] = useMemo(() => [
    {
      field: 'category',
      headerName: 'Category',
      filter: 'agTextColumnFilter',
      sortable: true,
      width: 150,
      cellRenderer: (p: any) => (
        <span className="font-bold text-navy-900 dark:text-white">{p.value}</span>
      ),
    },
    {
      field: 'type',
      headerName: 'Classification',
      filter: 'agTextColumnFilter',
      sortable: true,
      width: 130,
      cellRenderer: (p: any) => (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 uppercase">
          {p.value}
        </span>
      ),
    },
    {
      field: 'plannedAmount',
      headerName: 'Planned Budget',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 140,
      cellRenderer: (p: any) => formatInr(p.value, !balancesVisible),
    },
    {
      field: 'spentAmount',
      headerName: 'Actual Spent',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 140,
      cellRenderer: (p: any) => formatInr(p.value, !balancesVisible),
    },
    {
      field: 'remainingAmount',
      headerName: 'Remaining',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 130,
      cellRenderer: (p: any) => formatInr(Math.max(0, p.value), !balancesVisible),
    },
    {
      field: 'utilizationPercent',
      headerName: 'Utilisation',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 120,
      cellRenderer: (p: any) => (
        <span className={`font-semibold ${p.value > 100 ? 'text-rose-600' : p.value > 85 ? 'text-amber-600' : 'text-blue-600'}`}>
          {p.value}%
        </span>
      ),
    },
    {
      field: 'recommendation',
      headerName: 'AI Guidance',
      filter: 'agTextColumnFilter',
      flex: 1.5,
      minWidth: 220,
      cellRenderer: (p: any) => (
        <span className="text-xs text-slate-600 dark:text-slate-300">{p.value}</span>
      ),
    },
  ], [balancesVisible]);

  if (loading && !plan) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" /> Loading your financial plan...
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-slate-200 dark:border-slate-800 text-center transition-colors">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-navy-900 dark:text-white">No active financial plan</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 mb-4">
          Generate an AI-powered financial plan tailored to your recurring commitments, discretionary budget, and savings milestones.
        </p>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Generating Plan...' : 'Generate Financial Plan'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-colors">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 px-3 py-1 rounded-full">
            <Sparkles className="w-3.5 h-3.5" />
            Financial Planner &amp; Recovery Agent
          </span>
          <h2 className="text-xl font-bold text-navy-900 dark:text-white mt-2">{plan.title}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-3xl leading-relaxed">{plan.aiSummary?.replace(/₹/g, '$')}</p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 transition shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Recalculating via Python Engine...' : 'Recalculate Monthly Allocations'}
        </button>
      </div>

      {/* High-Level Allocation Buckets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
            Confirmed Commitments
            <Tooltip content="Essential recurring outlays like Rent, EMIs, Insurance, and Utilities that cannot be skipped." />
          </div>
          <div className="text-2xl font-bold text-navy-900 dark:text-white mt-2">{formatInr(plan.totalCommitments, !balancesVisible)}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Rent, EMI, Insurance, Bills</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
            Essential Living Budget
            <Tooltip content="Everyday non-negotiable living costs including Groceries, Healthcare, and Transit." />
          </div>
          <div className="text-2xl font-bold text-navy-900 dark:text-white mt-2">{formatInr(plan.totalEssentialBudget, !balancesVisible)}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Groceries, Healthcare, Transport</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
            Discretionary Spending
            <Tooltip content="Flexible lifestyle allocation for dining out, entertainment, and shopping." />
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{formatInr(plan.totalDiscretionaryBudget, !balancesVisible)}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Dining, Lifestyle, Electronics</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
            Savings &amp; Goals Target
            <Tooltip content="Monthly contribution toward emergency reserve and long-term financial milestones." />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{formatInr(plan.totalSavingsTarget, !balancesVisible)}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Emergency &amp; Active Goals</div>
        </div>
      </div>

      {/* Category Allocations & Utilization */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Category Allocation &amp; Live Utilisation Breakdown
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Comparing planned allocation against actual MongoDB transactions
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setAllocationView('cards')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                allocationView === 'cards'
                  ? 'bg-white dark:bg-slate-700 text-navy-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
              }`}
            >
              Visual Cards
            </button>
            <button
              type="button"
              onClick={() => setAllocationView('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                allocationView === 'grid'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              AG Grid Workspace
            </button>
          </div>
        </div>

        {allocationView === 'grid' ? (
          <AuraDataGrid
            gridId="budget-allocations-grid"
            source="budget"
            rowData={allocationRows}
            columnDefs={allocationColumnDefs}
            height="400px"
          />
        ) : (
          <div className="space-y-4">
            {(plan.allocations || []).map((alloc: any) => {
              const pct = Math.min(100, Math.round(alloc.utilizationPercent || 0));
              const barColor =
                alloc.status === 'overrun'
                  ? 'bg-rose-500'
                  : alloc.status === 'warning'
                  ? 'bg-amber-500'
                  : 'bg-blue-600';

              return (
                <div key={alloc.category} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-navy-900 dark:text-white">{alloc.category}</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 uppercase">
                        {alloc.type}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-navy-900 dark:text-white">
                      Spent {formatInr(alloc.spentAmount, !balancesVisible)} of {formatInr(alloc.plannedAmount, !balancesVisible)} ({alloc.utilizationPercent}%)
                    </div>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>{alloc.recommendation}</span>
                    <span className="font-medium">
                      Remaining: {formatInr(Math.max(0, alloc.remainingAmount), !balancesVisible)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Financial Recovery Recommendations (Workflow F) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div>
          <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            Financial Recovery Advisor (Workflow F)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Supportive, realistic rebalancing recommendations that protect your essential commitments (Rent, Insurance, Internet, EMIs).
          </p>
        </div>

        {(plan.recoveryRecommendations || []).length === 0 ? (
          <div className="p-5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-xs text-emerald-900 dark:text-emerald-300">
            All category budgets are currently within safe thresholds. No emergency recovery rebalancing is needed right now!
          </div>
        ) : (
          <div className="space-y-3">
            {plan.recoveryRecommendations.map((rec: any) => (
              <div
                key={rec.id}
                className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-navy-900 dark:text-white">{rec.category}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                      Overrun: {formatInr(rec.overrunAmount)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 uppercase">
                      {rec.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{rec.action}</p>
                </div>

                {rec.status === 'proposed' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRecoveryDecision(rec.id, 'accepted')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve Adjustment
                    </button>
                    <button
                      onClick={() => handleRecoveryDecision(rec.id, 'rejected')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-xs"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
