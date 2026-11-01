import React, { useEffect, useState } from 'react';
import { Users, ShieldCheck, Lock, Target, Repeat } from 'lucide-react';
import { apiRequest, formatInr, formatDateShort } from '../lib/api';

export const FamilyPage: React.FC = () => {
  const [familyData, setFamilyData] = useState<any>(null);
  const [newBudget, setNewBudget] = useState('');

  const loadFamily = async () => {
    const res = await apiRequest('/family');
    setFamilyData(res);
    setNewBudget(String(res.sharedSummary?.sharedMonthlyBudget || 40000));
  };

  useEffect(() => {
    loadFamily();
  }, []);

  const handleUpdateSharedBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/family/shared-budget', {
      method: 'POST',
      body: JSON.stringify({ sharedMonthlyBudget: Number(newBudget) }),
    });
    await loadFamily();
  };

  if (!familyData) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading family finance overview...</div>;
  }

  const { familyGroup, sharedSummary, sharedGoals, sharedCommitments, sharedTransactions, privacyBoundaryPolicy } =
    familyData;

  return (
    <div className="space-y-6">
      {/* Privacy Boundary Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            <Lock className="w-3.5 h-3.5" />
            Strict Family Financial Privacy Boundaries Active
          </span>
          <h2 className="text-xl font-bold text-navy-900 mt-2">{familyGroup?.name || 'Family Finance'}</h2>
          <p className="text-xs text-slate-600 mt-1 max-w-3xl">{privacyBoundaryPolicy?.rule}</p>
        </div>

        <form onSubmit={handleUpdateSharedBudget} className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            value={newBudget}
            onChange={(e) => setNewBudget(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs w-36"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold"
          >
            Update Shared Budget
          </button>
        </form>
      </div>

      {/* Shared Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500">Shared Household Monthly Budget</div>
          <div className="text-2xl font-bold text-navy-900 mt-1">{formatInr(sharedSummary.sharedMonthlyBudget)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500">Shared Spent This Month</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{formatInr(sharedSummary.sharedSpentThisMonth)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500">Remaining Shared Buffer</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{formatInr(sharedSummary.remainingSharedBudget)}</div>
        </div>
      </div>

      {/* Family Members & Contribution Summary */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-blue-600" />
          Family Member Profiles &amp; Shared Contributions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(familyGroup?.members || []).map((m: any, i: number) => (
            <div key={i} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-navy-900">{m.name}</div>
                <div className="text-xs text-slate-500">
                  {m.relationship} • Privacy Mode:{' '}
                  <span className="font-semibold text-emerald-700">{m.privacyLevel}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Personal bank accounts &amp; private transactions hidden
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Monthly Contribution</div>
                <div className="text-base font-bold text-navy-900">{formatInr(m.monthlySharedContribution)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shared Goals & Shared Commitments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-600" />
            Shared Family Goals
          </h3>
          {sharedGoals.map((g: any) => (
            <div key={g._id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-navy-900">{g.title}</span>
                <span className="font-semibold text-blue-600">
                  {formatInr(g.currentAmount)} / {formatInr(g.targetAmount)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{ width: `${Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
            <Repeat className="w-4 h-4 text-blue-600" />
            Shared Household Commitments
          </h3>
          {sharedCommitments.map((c: any) => (
            <div
              key={c._id}
              className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs"
            >
              <div>
                <div className="font-bold text-navy-900">{c.title}</div>
                <div className="text-slate-500">
                  {c.merchant} • Due {c.dueDayOfMonth}th of month
                </div>
              </div>
              <div className="font-bold text-navy-900">{formatInr(c.amount)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Shared Household Transactions */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-sm font-bold text-navy-900 mb-3">Authorised Shared Household Transactions Only</h3>
        <div className="divide-y divide-slate-100 text-xs">
          {sharedTransactions.map((t: any) => (
            <div key={t._id} className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-semibold text-navy-900">{t.merchant}</span>
                <span className="text-slate-500 ml-2">
                  ({t.category} • {formatDateShort(t.date)})
                </span>
              </div>
              <span className="font-bold text-navy-900">{formatInr(t.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
