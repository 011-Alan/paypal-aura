import React, { useEffect, useState } from 'react';
import { Target, Trophy, Plus, Sparkles, CheckCircle2 } from 'lucide-react';
import { apiRequest, formatInr, formatDateShort } from '../lib/api';

export const GoalsPage: React.FC = () => {
  const [goals, setGoals] = useState<any[]>([]);
  const [celebrationMsg, setCelebrationMsg] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Technology');
  const [targetAmount, setTargetAmount] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [deadline, setDeadline] = useState('');
  const [isShared, setIsShared] = useState(false);

  const loadGoals = async () => {
    const res = await apiRequest('/goals');
    setGoals(res.goals || []);
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const handleContribute = async (goal: any) => {
    const res = await apiRequest(`/goals/${goal._id}/contribute`, {
      method: 'PATCH',
      body: JSON.stringify({ amount: goal.monthlyContribution }),
    });
    if (res.newlyReachedMilestone) {
      setCelebrationMsg(
        `Milestone Celebration! You reached ${res.newlyReachedMilestone}% of "${goal.title}" and AURA triggered your milestone celebration notification!`
      );
    } else {
      setCelebrationMsg(`Added ${formatInr(goal.monthlyContribution)} towards "${goal.title}".`);
    }
    await loadGoals();
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !targetAmount) return;
    await apiRequest('/goals', {
      method: 'POST',
      body: JSON.stringify({
        title,
        category,
        targetAmount: Number(targetAmount),
        monthlyContribution: Number(monthlyContribution || Math.ceil(Number(targetAmount) / 6)),
        deadline: deadline || undefined,
        isSharedWithFamily: isShared,
      }),
    });
    setTitle('');
    setTargetAmount('');
    setMonthlyContribution('');
    await loadGoals();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <h2 className="text-xl font-bold text-navy-900 dark:text-white">Personal &amp; Family Financial Goals</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Track savings progress, celebrate 25% / 50% / 75% / 100% milestones, and synchronise target deadlines with your Financial Life Calendar.
        </p>
      </div>

      {celebrationMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
          <span className="font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {celebrationMsg}
          </span>
          <button onClick={() => setCelebrationMsg('')} className="text-xs font-bold hover:underline">
            Close
          </button>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-slate-200 dark:border-slate-800 text-center transition-colors">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
            <Target className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-navy-900 dark:text-white">No active financial goals</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
            Create your first savings goal below (such as an Emergency Reserve, Vacation, or Technology Purchase) to start tracking milestones and calendar synchronisation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {goals.map((g) => {
            const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
            return (
              <div
                key={g._id}
                className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/60">
                      {g.category}
                    </span>
                    {g.isSharedWithFamily && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Shared Family Goal
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-navy-900 dark:text-white">{g.title}</h3>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Saved: <strong className="text-navy-900 dark:text-white">{formatInr(g.currentAmount)}</strong>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      Target: <strong className="text-navy-900 dark:text-white">{formatInr(g.targetAmount)}</strong>
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>

                  {/* Milestone Badges */}
                  <div className="flex items-center justify-between pt-1">
                    {(g.milestones || []).map((ms: any) => (
                      <span
                        key={ms.percentage}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold flex items-center gap-1 ${
                          ms.reached
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {ms.reached && <CheckCircle2 className="w-3 h-3" />}
                        {ms.percentage}%
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Monthly Plan: {formatInr(g.monthlyContribution)}</span>
                    <span>By {formatDateShort(g.deadline)}</span>
                  </div>
                  <button
                    onClick={() => handleContribute(g)}
                    disabled={pct >= 100}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white dark:disabled:text-slate-600 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {pct >= 100 ? 'Goal Completed!' : `Record +${formatInr(g.monthlyContribution)} Contribution`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create New Goal */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Create New Financial Goal
        </h3>
        <form onSubmit={handleCreateGoal} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Goal Title (e.g. New Laptop Fund)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Emergency Fund">Emergency Fund</option>
            <option value="Technology">Technology</option>
            <option value="Travel">Travel</option>
            <option value="Education">Education</option>
            <option value="Family">Family</option>
            <option value="Home">Home</option>
          </select>
          <input
            type="number"
            placeholder="Target Amount (INR)"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            required
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <input
            type="number"
            placeholder="Monthly Savings (INR)"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Create Goal
          </button>
        </form>
      </div>
    </div>
  );
};
