import React, { useEffect, useState } from 'react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Sparkles,
  Calendar,
  ShoppingBag,
  CreditCard,
  ArrowUpRight,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { apiRequest, formatInr, formatDateShort } from '../lib/api';
import { NavTabId } from '../components/AppShell';

const CHART_COLORS = ['#2563eb', '#0891b2', '#4f46e5', '#10b981', '#f59e0b', '#ec4899'];

export const HomePage: React.FC<{ onNavigate: (tab: NavTabId) => void }> = ({ onNavigate }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quickPrompt, setQuickPrompt] = useState('');
  const [quickAnswer, setQuickAnswer] = useState<any>(null);
  const [asking, setAsking] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/dashboard/overview');
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
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
    } finally {
      setAsking(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-12 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
        Loading your financial ecosystem...
      </div>
    );
  }

  const { metrics, accounts, recentTransactions, pythonAnalytics, mandates, goals, activePlan } = data;
  const categoryChartData = (pythonAnalytics?.categoryBreakdown || []).slice(0, 6);
  const trendChartData = pythonAnalytics?.monthlyTrends || [];

  return (
    <div className="space-y-6">
      {/* Welcome & Companion Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
            <Sparkles className="w-3.5 h-3.5" />
            Autonomous Understanding &amp; Resource Allocation
          </span>
          <h2 className="text-xl lg:text-2xl font-bold text-navy-900 mt-2">
            Welcome back, {data.user?.name || 'Alex'}. Here is your financial clarity today.
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
            {activePlan?.aiSummary}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button
            onClick={() => onNavigate('smart-purchase')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
          >
            <ShoppingBag className="w-4 h-4" />
            Smart Purchase Companion
          </button>
          <button
            onClick={() => onNavigate('payments')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold transition"
          >
            <CreditCard className="w-4 h-4" />
            Controlled PayPal Payment
          </button>
        </div>
      </div>

      {/* Quick Conversational Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
        <form onSubmit={handleQuickAsk} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={quickPrompt}
              onChange={(e) => setQuickPrompt(e.target.value)}
              placeholder='Ask AURA anything — e.g., "Can I afford a laptop for ₹55,000?" or "What payments are coming up next week?"'
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={asking}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shrink-0"
          >
            {asking ? 'Analyzing...' : 'Ask AURA'}
          </button>
        </form>

        {quickAnswer && (
          <div className="mt-4 p-4 rounded-xl bg-blue-50/60 border border-blue-100 text-sm text-navy-900 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                AURA Financial Companion ({quickAnswer.astropodsOrchestration?.primaryAgent})
              </span>
              <button
                onClick={() => onNavigate('ask-aura')}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Open Full Multi-Agent View →
              </button>
            </div>
            <p className="text-slate-700 leading-relaxed">{quickAnswer.explanation}</p>
          </div>
        )}
      </div>

      {/* Key Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Liquid Balance</span>
            <Wallet className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-navy-900 mt-2">{formatInr(metrics.totalNetBalance)}</div>
          <div className="text-xs text-slate-500 mt-1">Across {accounts.length} active accounts</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Monthly Income</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-navy-900 mt-2">{formatInr(metrics.monthlyIncome)}</div>
          <div className="text-xs text-emerald-600 font-medium mt-1">
            Savings Rate: {metrics.savingsRatePercent}%
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tracked Expenditure</span>
            <TrendingDown className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-navy-900 mt-2">{formatInr(metrics.totalExpense)}</div>
          <div className="text-xs text-slate-500 mt-1">
            Next Month Forecast: {formatInr(metrics.forecastNextMonthExpense)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Unusual Spend Alerts</span>
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-navy-900 mt-2">{metrics.unusualTransactionsCount} Flagged</div>
          <button
            onClick={() => onNavigate('spending')}
            className="text-xs text-blue-600 hover:underline font-medium mt-1 inline-flex items-center gap-1"
          >
            Inspect in AG Grid <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Charts Row: Monthly Cashflow Trend & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-navy-900">Income vs Expenditure Trend</h3>
              <p className="text-xs text-slate-500">Calculated by AURA Python Analytics Engine</p>
            </div>
            <button
              onClick={() => onNavigate('spending')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Explore in AG Grid →
            </button>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip formatter={(value: any) => formatInr(Number(value))} />
                <Bar dataKey="income" name="Income" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name="Expenditure" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-navy-900">Category Expenditure Share</h3>
            <p className="text-xs text-slate-500">Top spending categories</p>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryChartData}
                  dataKey="totalAmount"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                >
                  {categoryChartData.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: any) => formatInr(Number(val))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {categoryChartData.slice(0, 4).map((c: any, idx: number) => (
              <div key={c.category} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-600">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                  />
                  {c.category}
                </span>
                <span className="font-semibold text-navy-900">
                  {formatInr(c.totalAmount)} ({c.sharePercent}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Accounts, Upcoming Commitments & Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-navy-900">My Financial Accounts</h3>
            <button onClick={() => onNavigate('my-money')} className="text-xs font-semibold text-blue-600">
              Manage →
            </button>
          </div>
          <div className="space-y-3">
            {accounts.map((acc: any) => (
              <div
                key={acc._id}
                className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-semibold text-navy-900">{acc.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {acc.institution} • {acc.accountNumberMasked}
                  </div>
                </div>
                <div className="text-sm font-bold text-navy-900">{formatInr(acc.balance)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Commitments */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-navy-900">Upcoming Commitments</h3>
            <button onClick={() => onNavigate('calendar')} className="text-xs font-semibold text-blue-600 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Life Calendar →
            </button>
          </div>
          <div className="space-y-2.5">
            {mandates
              .filter((m: any) => m.category !== 'Salary')
              .slice(0, 5)
              .map((m: any) => (
                <div
                  key={m._id}
                  className="p-3 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-navy-900">{m.title}</div>
                    <div className="text-slate-500">
                      Due {m.dueDayOfMonth}th of month •{' '}
                      <span
                        className={
                          m.status === 'confirmed' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'
                        }
                      >
                        {m.status === 'confirmed' ? 'Confirmed' : 'Inferred Pattern'}
                      </span>
                    </div>
                  </div>
                  <div className="font-bold text-navy-900">{formatInr(m.amount)}</div>
                </div>
              ))}
          </div>
        </div>

        {/* Active Goals */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-navy-900">Financial Goals Progress</h3>
            <button onClick={() => onNavigate('goals')} className="text-xs font-semibold text-blue-600">
              All Goals →
            </button>
          </div>
          <div className="space-y-4">
            {goals.map((g: any) => {
              const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
              return (
                <div key={g._id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-navy-900">{g.title}</span>
                    <span className="text-blue-700 font-bold">{pct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Saved: {formatInr(g.currentAmount)}</span>
                    <span>Target: {formatInr(g.targetAmount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Transactions Preview */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-navy-900">Recent Transactions</h3>
            <p className="text-xs text-slate-500">Synchronised between MongoDB and Elastic Financial Memory</p>
          </div>
          <button onClick={() => onNavigate('spending')} className="text-xs font-semibold text-blue-600">
            Open Full AG Grid Workbench →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Merchant</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Account</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentTransactions.map((tx: any) => (
                <tr key={tx._id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 text-slate-600">{formatDateShort(tx.date)}</td>
                  <td className="py-2.5 px-3 font-medium text-navy-900">{tx.merchant}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{tx.category}</span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">{tx.accountName}</td>
                  <td className="py-2.5 px-3">
                    {tx.isUnusual ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                        Unusual Spend
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-bold ${
                      tx.type === 'income' ? 'text-emerald-600' : 'text-navy-900'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}
                    {formatInr(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
