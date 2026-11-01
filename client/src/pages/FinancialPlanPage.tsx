import React, { useEffect, useState } from 'react';
import { PieChart, Sparkles, CheckCircle2, XCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';

export const FinancialPlanPage: React.FC = () => {
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

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

  if (loading || !plan) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" /> Loading your financial plan...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
            <Sparkles className="w-3.5 h-3.5" />
            Financial Planner &amp; Recovery Agent
          </span>
          <h2 className="text-xl font-bold text-navy-900 mt-2">{plan.title}</h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">{plan.aiSummary}</p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Recalculating via Python Engine...' : 'Recalculate Monthly Allocations'}
        </button>
      </div>

      {/* High-Level Allocation Buckets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500">Confirmed Commitments</div>
          <div className="text-2xl font-bold text-navy-900 mt-1">{formatInr(plan.totalCommitments)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Rent, EMI, Insurance, Bills</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500">Essential Living Budget</div>
          <div className="text-2xl font-bold text-navy-900 mt-1">{formatInr(plan.totalEssentialBudget)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Groceries, Healthcare, Transport</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500">Discretionary Spending</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{formatInr(plan.totalDiscretionaryBudget)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Dining, Lifestyle, Electronics</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500">Savings &amp; Goal Contributions</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{formatInr(plan.totalSavingsTarget)}</div>
          <div className="text-[11px] text-slate-500 mt-1">Emergency &amp; Active Goals</div>
        </div>
      </div>

      {/* Category Allocations & Utilization */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-600" />
              Category Allocation &amp; Live Utilisation Breakdown
            </h3>
            <p className="text-xs text-slate-500">
              Comparing planned allocation against actual MongoDB transactions
            </p>
          </div>
        </div>

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
              <div key={alloc.category} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-navy-900">{alloc.category}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white border border-slate-200 text-slate-600 uppercase">
                      {alloc.type}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-navy-900">
                    Spent {formatInr(alloc.spentAmount)} of {formatInr(alloc.plannedAmount)} ({alloc.utilizationPercent}%)
                  </div>
                </div>

                <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-slate-600">
                  <span>{alloc.recommendation}</span>
                  <span className="font-medium">
                    Remaining: {formatInr(Math.max(0, alloc.remainingAmount))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Financial Recovery Recommendations (Workflow F) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            Financial Recovery Advisor (Workflow F)
          </h3>
          <p className="text-xs text-slate-500">
            Supportive, realistic rebalancing recommendations that protect your essential commitments (Rent, Insurance, Internet, EMIs).
          </p>
        </div>

        {(plan.recoveryRecommendations || []).length === 0 ? (
          <div className="p-5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900">
            All category budgets are currently within safe thresholds. No emergency recovery rebalancing is needed right now!
          </div>
        ) : (
          <div className="space-y-3">
            {plan.recoveryRecommendations.map((rec: any) => (
              <div
                key={rec.id}
                className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-navy-900">{rec.category}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                      Overrun: {formatInr(rec.overrunAmount)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 uppercase">
                      {rec.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{rec.action}</p>
                </div>

                {rec.status === 'proposed' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRecoveryDecision(rec.id, 'accepted')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve Adjustment
                    </button>
                    <button
                      onClick={() => handleRecoveryDecision(rec.id, 'rejected')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
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
