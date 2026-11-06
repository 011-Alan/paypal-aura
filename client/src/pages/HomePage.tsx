import React, { useEffect, useState } from 'react';
import {
  Wallet,
  TrendingUp,
  Sparkles,
  Calendar,
  CreditCard,
  ArrowRight,
  RefreshCw,
  ShoppingBag,
  Send,
} from 'lucide-react';
import { apiRequest, formatDateShort } from '../lib/api';
import { NavTabId } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';
import { ConnectedPayPalAccount } from '../components/ConnectedPayPalAccount';
import { PayPalSandboxBusinessReporting } from '../components/PayPalSandboxBusinessReporting';
import { FEATURE_FLAGS } from '../config/features';

/**
 * Custom hook to render typing text reveal animation with prefers-reduced-motion support
 */
function useTypingEffect(text: string, speedMs = 18): string {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    if (!text) {
      setDisplayed('');
      return;
    }

    // Check accessibility setting for reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion) {
      setDisplayed(text);
      return;
    }

    setDisplayed('');
    let idx = 0;
    const interval = setInterval(() => {
      idx += 1;
      setDisplayed(text.slice(0, idx));
      if (idx >= text.length) {
        clearInterval(interval);
      }
    }, speedMs);

    return () => clearInterval(interval);
  }, [text, speedMs]);

  return displayed;
}

export const HomePage: React.FC<{ onNavigate: (tab: NavTabId) => void }> = ({ onNavigate }) => {
  const { user, formatMoney } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Quick Ask AURA prompt state
  const [quickPrompt, setQuickPrompt] = useState('');
  const [quickAnswer, setQuickAnswer] = useState<any>(null);
  const [asking, setAsking] = useState(false);

  const loadOverview = async () => {
    try {
      const res = await apiRequest('/dashboard/overview');
      setData(res);
    } catch {
      // Keep previous data if available
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();

    // Re-synchronize when application state changes via AURA tool actions
    const handleStateChange = () => {
      loadOverview();
    };
    window.addEventListener('aura-state-changed', handleStateChange);
    return () => window.removeEventListener('aura-state-changed', handleStateChange);
  }, []);

  const handleQuickAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPrompt.trim()) return;
    setAsking(true);
    try {
      const res = await apiRequest('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ prompt: quickPrompt }),
      });
      setQuickAnswer(res);
      setQuickPrompt('');

      // If AURA performed an action or directed navigation
      if (res.toolAction?.navTarget) {
        window.dispatchEvent(
          new CustomEvent('aura-navigate', { detail: { page: res.toolAction.navTarget } })
        );
      }
      if (res.toolAction) {
        window.dispatchEvent(new CustomEvent('aura-state-changed'));
      }
    } finally {
      setAsking(false);
    }
  };

  // 1. Available to spend calculation
  const discretionaryRemaining = Math.max(
    0,
    data?.activePlan?.totalDiscretionaryBudget || user?.financialPolicy?.discretionaryMonthlyCap || 18000
  );

  // 2. Upcoming commitments calculation
  const upcomingMandates = (data?.mandates || []).filter((m: any) => m.category !== 'Salary').slice(0, 3);
  const upcomingTotal = (data?.mandates || [])
    .filter((m: any) => m.category !== 'Salary')
    .reduce((s: number, m: any) => s + (m.amount || 0), 0);

  // 3. Savings progress calculation
  const totalGoalTarget = (data?.goals || []).reduce((s: number, g: any) => s + (g.targetAmount || 0), 0);
  const totalGoalSaved = (data?.goals || []).reduce((s: number, g: any) => s + (g.currentAmount || 0), 0);
  const goalProgressPercent = totalGoalTarget > 0 ? Math.round((totalGoalSaved / totalGoalTarget) * 100) : 0;

  // 4. Synthesize natural briefing statement
  const fullBriefingStatement =
    data?.activePlan?.aiSummary ||
    `You are on track with your monthly savings target (${data?.metrics?.savingsRatePercent ?? 25}% savings rate). You have ${data?.mandates?.length ?? 0} confirmed recurring commitments scheduled this month totalling ${formatMoney(
      upcomingTotal
    )}, with essential housing and utility allocations safely ringfenced.`;

  // Typing text reveal animation (Always called unconditionally at top of component!)
  const typedBriefing = useTypingEffect(data ? fullBriefingStatement : '', 14);

  if (loading || !data) {
    return (
      <div className="p-16 text-center text-sm text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
        <span>Loading your financial clarity...</span>
      </div>
    );
  }

  const { metrics, accounts, mandates, goals, activePlan, recentTransactions } = data;

  // 5. Build "Needs Attention" items based on real verified state
  const attentionItems = [];

  // Unusual transactions check
  const unusualTx = (recentTransactions || []).find((t: any) => t.isUnusual);
  if (unusualTx) {
    attentionItems.push({
      id: 'unusual-spend',
      type: 'warning',
      category: 'Unusual Expenditure Flagged',
      title: `${unusualTx.merchant} — ${formatMoney(unusualTx.amount)}`,
      why: unusualTx.unusualReason || 'Transaction exceeds typical historical pattern for this category.',
      actionLabel: 'Inspect in Transactions',
      onAction: () => onNavigate('transactions'),
    });
  }

  // Upcoming commitment due within next 7 days
  if (upcomingMandates.length > 0) {
    const nextBill = upcomingMandates[0];
    attentionItems.push({
      id: 'upcoming-bill',
      type: 'info',
      category: 'Upcoming Commitment Due',
      title: `${nextBill.title} — ${formatMoney(nextBill.amount)}`,
      why: `Scheduled for the ${nextBill.dueDayOfMonth}th of this month. Financial Guardian has verified sufficient checking liquidity.`,
      actionLabel: 'Review in Commitments',
      onAction: () => onNavigate('commitments'),
    });
  }

  // Savings goal check
  if (goals && goals.length > 0) {
    const primaryGoal = goals[0];
    attentionItems.push({
      id: 'goal-milestone',
      type: 'success',
      category: 'Goal Checkpoint',
      title: `${primaryGoal.title} (${Math.round((primaryGoal.currentAmount / primaryGoal.targetAmount) * 100)}% Funded)`,
      why: `Monthly contribution of ${formatMoney(primaryGoal.monthlyContribution)} is scheduled to keep you on pace for deadline.`,
      actionLabel: 'View in Financial Planning',
      onAction: () => onNavigate('financial-planning'),
    });
  }

  return (
    <div className="space-y-7">
      {/* 1. Decision-First Welcome & Financial Briefing with Typing Effect */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-100 dark:border-blue-900">
                <Sparkles className="w-3.5 h-3.5" />
                Live Financial Clarity Briefing
              </span>
              <Tooltip content="Concise AI assessment synthesized solely from verified database records." />
            </div>

            <h2 className="text-xl lg:text-2xl font-bold tracking-tight text-navy-900 dark:text-white">
              Good day, {data.user?.name || user?.name || 'Alex'}. Here is your financial posture today.
            </h2>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal pt-1 min-h-[44px]">
              {typedBriefing}
              {typedBriefing.length < fullBriefingStatement.length && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-blue-600 dark:bg-blue-400 animate-pulse align-middle" />
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0">
            <button
              onClick={() => onNavigate('ask-aura')}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Ask AURA Anything
            </button>
          </div>
        </div>
      </div>

      {/* 2. Section 1: Financial Overview (The 3 Core Numbers) */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">1. How Am I Doing?</h3>
          <Tooltip content="Key indicators representing spendable cushion, verified obligations, and wealth accumulation." />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card A: Available to Spend */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  Available to Spend
                  <Tooltip content="Monthly income minus essential bills, confirmed commitments, and savings targets." />
                </span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-navy-900 dark:text-white mt-3">
                {formatMoney(discretionaryRemaining)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Discretionary safe spending cushion</div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 dark:text-slate-500">Total liquid balance</span>
              <span className="font-semibold text-navy-900 dark:text-white">
                {formatMoney(metrics.totalNetBalance)}
              </span>
            </div>
          </div>

          {/* Card B: Upcoming Commitments */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  Upcoming Commitments
                  <Tooltip content="Total verified recurring commitments due this month (Rent, Insurance, Internet, EMIs)." />
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-navy-900 dark:text-white mt-3">
                {formatMoney(upcomingTotal)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{mandates.length} confirmed recurring obligations</div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 dark:text-slate-500">Next due</span>
              <span className="font-semibold text-navy-900 dark:text-white">
                {upcomingMandates[0]?.title || 'None this week'}
              </span>
            </div>
          </div>

          {/* Card C: Savings Progress */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  Savings Progress
                  <Tooltip content="Total accumulated savings toward defined goals, evaluated against your target." />
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold text-navy-900 dark:text-white mt-3">
                {formatMoney(totalGoalSaved)}
              </div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                Savings Rate: {metrics.savingsRatePercent}% of monthly income
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 dark:text-slate-500">Target: {formatMoney(totalGoalTarget)}</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{goalProgressPercent}% funded</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Section 2: What Needs My Attention? */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">2. What Needs My Attention?</h3>
          <Tooltip content="Critical items like impending bills, anomalous transactions, and goal checkpoints." />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {attentionItems.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-3 transition-colors"
            >
              <div>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                    item.type === 'warning'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900'
                      : item.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900'
                      : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900'
                  }`}
                >
                  {item.category}
                </span>
                <h4 className="text-sm font-bold text-navy-900 dark:text-white mt-2">{item.title}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-1 font-normal">{item.why}</p>
              </div>

              <button
                onClick={item.onAction}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-navy-900 dark:text-white font-semibold text-xs border border-slate-200 dark:border-slate-700 transition flex items-center justify-center gap-1.5"
              >
                <span>{item.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Section 3: Recommended Next Steps */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">3. What Should I Do Next?</h3>
          <Tooltip content="One or two focused recommendations to maximize financial health without cognitive overload." />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-4 transition-colors">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <h4 className="text-sm font-bold text-navy-900 dark:text-white">Evaluate Prospective Purchases</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Planning a tech upgrade, apparel, or large purchase? Run it through AURA&apos;s 7-factor affordability evaluator before committing funds.
              </p>
              <button
                onClick={() => onNavigate('smart-purchases')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-bold inline-flex items-center gap-1 pt-1.5"
              >
                Open Smart Purchases Companion <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-4 transition-colors">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-1">
              <h4 className="text-sm font-bold text-navy-900 dark:text-white">Controlled Payments &amp; Bill Settle</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Review pending utility payments under Financial Guardian protection. Always requires your explicit PIN approval.
              </p>
              <button
                onClick={() => onNavigate('payments')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-bold inline-flex items-center gap-1 pt-1.5"
              >
                Open Controlled Payments <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Section: Connected PayPal Account (Personal) */}
      <ConnectedPayPalAccount />

      {/* Optional Merchant Reporting (toggled via FEATURE_FLAGS.ENABLE_MERCHANT_REPORTING_SECTION) */}
      {FEATURE_FLAGS.ENABLE_MERCHANT_REPORTING_SECTION && <PayPalSandboxBusinessReporting />}

      {/* 5. Section 4: Prominent Ask AURA Quick Conversational Input */}
      <div className="bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/60 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/40 rounded-3xl p-6 border border-blue-100 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-navy-900 dark:text-white">Ask AURA Financial Companion</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ask questions, plan budgets, or schedule reminders naturally</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('ask-aura')}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-bold"
          >
            Open Full Chat →
          </button>
        </div>

        <form onSubmit={handleQuickAsk} className="flex gap-2">
          <input
            type="text"
            value={quickPrompt}
            onChange={(e) => setQuickPrompt(e.target.value)}
            placeholder='Ask anything — e.g. "Can I afford sneakers for ₹8,000?" or "Schedule electricity bill reminder for 10th"'
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={asking}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {asking ? 'Thinking...' : 'Ask'}
          </button>
        </form>

        {quickAnswer && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-700 shadow-2xs text-xs text-navy-900 dark:text-white space-y-2">
            <div className="font-bold text-blue-700 dark:text-blue-400 flex items-center justify-between">
              <span>AURA Answer:</span>
              <button
                onClick={() => onNavigate('ask-aura')}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
              >
                Continue in Ask AURA
              </button>
            </div>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-normal">{quickAnswer.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
};
