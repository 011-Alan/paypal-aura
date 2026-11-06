import React, { useEffect, useState } from 'react';
import { Users, ShieldCheck, Lock, Target, Repeat, PlusCircle, CheckCircle2 } from 'lucide-react';
import { apiRequest, formatInr, formatDateShort } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';

export const FamilyPage: React.FC = () => {
  const { user, balancesVisible } = useAuth();
  const [familyData, setFamilyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newBudget, setNewBudget] = useState('');
  const [setupMode, setSetupMode] = useState(false);
  const [householdName, setHouseholdName] = useState('');
  const [setupBudget, setSetupBudget] = useState('40000');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFamily = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest('/family');
      setFamilyData(res);
      setNewBudget(String(res.sharedSummary?.sharedMonthlyBudget || 40000));
    } catch (err: any) {
      setError(err?.message || 'Failed to load family finance overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFamily();
  }, []);

  const handleUpdateSharedBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/family/shared-budget', {
        method: 'POST',
        body: JSON.stringify({ sharedMonthlyBudget: Number(newBudget) }),
      });
      await loadFamily();
    } catch (err: any) {
      alert(err?.message || 'Failed to update shared budget');
    }
  };

  const handleSetupHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await apiRequest('/family/setup', {
        method: 'POST',
        body: JSON.stringify({
          name: householdName.trim() || `${user?.name || 'My'}'s Household`,
          sharedMonthlyBudget: Number(setupBudget) || 30000,
        }),
      });
      setSetupMode(false);
      await loadFamily();
    } catch (err: any) {
      alert(err?.message || 'Failed to initialize household');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 dark:text-slate-400">
        Loading family finance overview...
      </div>
    );
  }

  const { familyGroup, sharedSummary, sharedGoals, sharedCommitments, sharedTransactions, privacyBoundaryPolicy } =
    familyData || {};

  // Case: No household configured for current user -> Render clean Empty State inviting them to set one up
  if (!familyGroup) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/60">
            <Users className="w-7 h-7" />
          </div>

          <div className="space-y-2 max-w-xl">
            <h3 className="text-xl font-bold text-navy-900 dark:text-white">
              No Household Configured Yet
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Family Finance allows you to share dedicated monthly spending envelopes and household goals with family members, while keeping your personal bank accounts, private balances, and individual transactions strictly hidden.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-1">
              <span className="text-xs font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" /> Complete Privacy
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Other family members only see aggregate shared contributions, never your private purchases.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-1">
              <span className="text-xs font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-blue-600" /> Joint Goals
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Track shared savings for family vacations, emergency funds, or household improvements.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-1">
              <span className="text-xs font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5 text-indigo-600" /> Shared Utilities
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Manage recurring household bills and shared commitments with clear transparency.
              </p>
            </div>
          </div>

          {!setupMode ? (
            <div className="pt-2">
              <button
                onClick={() => setSetupMode(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
              >
                <PlusCircle className="w-4 h-4" />
                Set Up Your Household
              </button>
            </div>
          ) : (
            <form onSubmit={handleSetupHousehold} className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-4 max-w-lg transition-colors">
              <h4 className="text-sm font-bold text-navy-900 dark:text-white">
                Initialize Household
              </h4>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Household / Family Name
                </label>
                <input
                  type="text"
                  placeholder={`${user?.name || 'My'}'s Household`}
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-navy-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                  Shared Monthly Spending Envelope (INR)
                </label>
                <input
                  type="number"
                  placeholder="30000"
                  value={setupBudget}
                  onChange={(e) => setSetupBudget(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-navy-900 dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Household'}
                </button>
                <button
                  type="button"
                  onClick={() => setSetupMode(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Privacy Boundary Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-colors">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
            <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Strict Family Financial Privacy Boundaries Active
          </span>
          <h2 className="text-xl font-bold text-navy-900 dark:text-white mt-2">
            {familyGroup?.name || 'Family Finance'}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
            {privacyBoundaryPolicy?.rule ||
              'Individual bank balances, personal accounts, and non-shared transactions of other family members are strictly private and never returned.'}
          </p>
        </div>

        <form onSubmit={handleUpdateSharedBudget} className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            value={newBudget}
            onChange={(e) => setNewBudget(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-navy-900 dark:text-white text-xs w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-navy-900 dark:bg-blue-600 hover:bg-navy-800 dark:hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
          >
            Update Shared Budget
          </button>
        </form>
      </div>

      {/* Shared Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
            Shared Household Budget
            <Tooltip content="Joint monthly spending envelope agreed upon by household members." />
          </div>
          <div className="text-2xl font-bold text-navy-900 dark:text-white mt-2">
            {formatInr(sharedSummary?.sharedMonthlyBudget || 0, !balancesVisible)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
            Shared Spent This Month
            <Tooltip content="Sum of transactions explicitly tagged as household shared expenses." />
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
            {formatInr(sharedSummary?.sharedSpentThisMonth || 0, !balancesVisible)}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
            Remaining Shared Buffer
            <Tooltip content="Available shared cushion before hitting household budget limits." />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {formatInr(sharedSummary?.remainingSharedBudget || 0, !balancesVisible)}
          </div>
        </div>
      </div>

      {/* Family Members & Contribution Summary */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Family Member Profiles &amp; Shared Contributions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(familyGroup?.members || []).map((m: any, i: number) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between transition-colors"
            >
              <div>
                <div className="text-sm font-bold text-navy-900 dark:text-white">{m.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {m.relationship} • Privacy Mode:{' '}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">{m.privacyLevel}</span>
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Personal bank accounts &amp; private transactions hidden
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 dark:text-slate-400">Monthly Contribution</div>
                <div className="text-base font-bold text-navy-900 dark:text-white">
                  {formatInr(m.monthlySharedContribution || 0, !balancesVisible)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shared Goals & Shared Commitments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
          <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Shared Family Goals
          </h3>
          {sharedGoals && sharedGoals.length > 0 ? (
            sharedGoals.map((g: any) => (
              <div
                key={g._id}
                className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 space-y-2 transition-colors"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-navy-900 dark:text-white">{g.title}</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatInr(g.currentAmount)} / {formatInr(g.targetAmount)}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100))}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
              No shared family goals linked yet.
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
          <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
            <Repeat className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Shared Household Commitments
          </h3>
          {sharedCommitments && sharedCommitments.length > 0 ? (
            sharedCommitments.map((c: any) => (
              <div
                key={c._id}
                className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 flex items-center justify-between text-xs transition-colors"
              >
                <div>
                  <div className="font-bold text-navy-900 dark:text-white">{c.title}</div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {c.merchant} • Due {c.dueDayOfMonth}th of month
                  </div>
                </div>
                <div className="font-bold text-navy-900 dark:text-white">{formatInr(c.amount)}</div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
              No shared household commitments configured.
            </p>
          )}
        </div>
      </div>

      {/* Shared Household Transactions */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <h3 className="text-sm font-bold text-navy-900 dark:text-white mb-3">
          Authorised Shared Household Transactions Only
        </h3>
        {sharedTransactions && sharedTransactions.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {sharedTransactions.map((t: any) => (
              <div key={t._id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-navy-900 dark:text-white">{t.merchant}</span>
                  <span className="text-slate-500 dark:text-slate-400 ml-2">
                    ({t.category} • {formatDateShort(t.date)})
                  </span>
                </div>
                <span className="font-bold text-navy-900 dark:text-white">{formatInr(t.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
            No shared household transactions recorded this month.
          </p>
        )}
      </div>
    </div>
  );
};
