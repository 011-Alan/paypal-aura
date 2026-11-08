import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  PieChart as PieChartIcon,
  BarChart3,
  Calendar,
  Sparkles,
  Layers,
  Search,
  Filter,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type DateRangePreset = '7d' | '30d' | '3m' | '6m' | '12m' | 'custom';

interface TransactionItem {
  id: string;
  date: string;
  merchant: string;
  description: string;
  category: string;
  type: 'income' | 'expense' | 'transfer';
  direction?: 'incoming' | 'outgoing';
  amount: number;
  currency: string;
  accountName: string;
  paymentMethod?: string;
  isUnusual?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  Shopping: '#8b5cf6',
  'Food & Dining': '#f59e0b',
  'Food and Dining': '#f59e0b',
  Dining: '#f59e0b',
  Transportation: '#3b82f6',
  Housing: '#10b981',
  Rent: '#10b981',
  Utilities: '#06b6d4',
  Electricity: '#06b6d4',
  Healthcare: '#ec4899',
  Entertainment: '#e11d48',
  Education: '#6366f1',
  Subscriptions: '#d946ef',
  Travel: '#14b8a6',
  'Personal Care': '#f97316',
  Income: '#10b981',
  Salary: '#10b981',
  Other: '#64748b',
};

export const SpendingIntelligence: React.FC = () => {
  const { balancesVisible } = useAuth();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedCategoryDrilldown, setSelectedCategoryDrilldown] = useState<string | null>(null);
  const [aggregationInterval, setAggregationInterval] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Load actual transactions
  useEffect(() => {
    const fetchTx = async () => {
      setLoading(true);
      try {
        const res = await apiRequest<{ rows: TransactionItem[] }>('/transactions');
        setTransactions(res.rows || []);
      } catch (err) {
        console.error('Failed to load transaction dataset for Spending Intelligence:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTx();
  }, []);

  // Filter transactions by chosen date range
  const { currentPeriodRows, previousPeriodRows, daysInRange } = useMemo(() => {
    const now = new Date();
    let days = 30;
    let startDate: Date;
    let endDate = now;

    if (dateRange === '7d') {
      days = 7;
      startDate = new Date(now.getTime() - 7 * 86400000);
    } else if (dateRange === '30d') {
      days = 30;
      startDate = new Date(now.getTime() - 30 * 86400000);
    } else if (dateRange === '3m') {
      days = 90;
      startDate = new Date(now.getTime() - 90 * 86400000);
    } else if (dateRange === '6m') {
      days = 180;
      startDate = new Date(now.getTime() - 180 * 86400000);
    } else if (dateRange === '12m') {
      days = 365;
      startDate = new Date(now.getTime() - 365 * 86400000);
    } else {
      // Custom
      startDate = customStart ? new Date(customStart) : new Date(now.getTime() - 30 * 86400000);
      endDate = customEnd ? new Date(customEnd) : now;
      days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
    }

    const prevStartDate = new Date(startDate.getTime() - days * 86400000);
    const prevEndDate = new Date(startDate.getTime());

    const current = transactions.filter((t) => {
      const d = new Date(t.date);
      return d >= startDate && d <= endDate;
    });

    const previous = transactions.filter((t) => {
      const d = new Date(t.date);
      return d >= prevStartDate && d < prevEndDate;
    });

    return { currentPeriodRows: current, previousPeriodRows: previous, daysInRange: days };
  }, [transactions, dateRange, customStart, customEnd]);

  // Activity KPIs
  const kpis = useMemo(() => {
    const totalCount = currentPeriodRows.length;
    const outgoingTxs = currentPeriodRows.filter((t) => t.type === 'expense' || t.direction === 'outgoing');
    const incomingTxs = currentPeriodRows.filter((t) => t.type === 'income' || t.direction === 'incoming');

    const totalSent = outgoingTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalReceived = incomingTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const netCashFlow = totalReceived - totalSent;
    const avgTxValue = totalCount > 0 ? (totalSent + totalReceived) / totalCount : 0;
    const largestTx = currentPeriodRows.reduce((max, t) => (t.amount > max ? t.amount : max), 0);

    // Previous period comparisons
    const prevOutgoingTxs = previousPeriodRows.filter((t) => t.type === 'expense' || t.direction === 'outgoing');
    const prevIncomingTxs = previousPeriodRows.filter((t) => t.type === 'income' || t.direction === 'incoming');
    const prevTotalSent = prevOutgoingTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
    const prevCount = previousPeriodRows.length;

    let activityChangePct: number | null = null;
    let spendChangePct: number | null = null;

    if (prevCount > 0) {
      activityChangePct = Math.round(((totalCount - prevCount) / prevCount) * 100);
    }
    if (prevTotalSent > 0) {
      spendChangePct = Math.round(((totalSent - prevTotalSent) / prevTotalSent) * 100);
    }

    return {
      totalCount,
      outgoingCount: outgoingTxs.length,
      incomingCount: incomingTxs.length,
      totalSent: Math.round(totalSent * 100) / 100,
      totalReceived: Math.round(totalReceived * 100) / 100,
      netCashFlow: Math.round(netCashFlow * 100) / 100,
      avgTxValue: Math.round(avgTxValue * 100) / 100,
      largestTx: Math.round(largestTx * 100) / 100,
      activityChangePct,
      spendChangePct,
      hasHistoricalComparison: previousPeriodRows.length > 0,
    };
  }, [currentPeriodRows, previousPeriodRows]);

  // Spending by Category Aggregation
  const categoryData = useMemo(() => {
    const expenseTxs = currentPeriodRows.filter((t) => t.type === 'expense' || t.direction === 'outgoing');
    const totalSpend = expenseTxs.reduce((sum, t) => sum + t.amount, 0) || 1;

    const map = new Map<string, { category: string; amount: number; count: number }>();
    for (const t of expenseTxs) {
      const cat = t.category || 'Other';
      const entry = map.get(cat) || { category: cat, amount: 0, count: 0 };
      entry.amount += t.amount;
      entry.count += 1;
      map.set(cat, entry);
    }

    const list = Array.from(map.values()).map((c) => ({
      ...c,
      amount: Math.round(c.amount * 100) / 100,
      percentage: Math.round((c.amount / totalSpend) * 100),
      fill: CATEGORY_COLORS[c.category] || '#64748b',
    }));

    return list.sort((a, b) => b.amount - a.amount);
  }, [currentPeriodRows]);

  // Category drilldown rows
  const drilldownRows = useMemo(() => {
    if (!selectedCategoryDrilldown) return [];
    return currentPeriodRows.filter(
      (t) => (t.type === 'expense' || t.direction === 'outgoing') && t.category === selectedCategoryDrilldown
    );
  }, [currentPeriodRows, selectedCategoryDrilldown]);

  // Spending Trends Time-Series
  const trendData = useMemo(() => {
    const dateMap = new Map<string, { date: string; incoming: number; outgoing: number; net: number }>();

    for (const t of currentPeriodRows) {
      const d = new Date(t.date);
      let key = d.toISOString().split('T')[0];
      if (aggregationInterval === 'weekly') {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        key = startOfWeek.toISOString().split('T')[0];
      } else if (aggregationInterval === 'monthly') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }

      const entry = dateMap.get(key) || { date: key, incoming: 0, outgoing: 0, net: 0 };
      if (t.type === 'income' || t.direction === 'incoming') {
        entry.incoming += t.amount;
      } else {
        entry.outgoing += t.amount;
      }
      entry.net = entry.incoming - entry.outgoing;
      dateMap.set(key, entry);
    }

    return Array.from(dateMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({
        ...entry,
        incoming: Math.round(entry.incoming),
        outgoing: Math.round(entry.outgoing),
        net: Math.round(entry.net),
      }));
  }, [currentPeriodRows, aggregationInterval]);

  // AI Financial Insights (computed strictly from actual data)
  const aiInsights = useMemo(() => {
    const insights: string[] = [];
    if (currentPeriodRows.length === 0) {
      return ['No transactions found in this period. Add income or purchases to generate financial intelligence.'];
    }

    // Top Category
    if (categoryData.length > 0) {
      const topCat = categoryData[0];
      insights.push(
        `${topCat.category} represents your largest expense stream, accounting for ${topCat.percentage}% ($${topCat.amount.toLocaleString(
          'en-US'
        )}) of total outflow across ${topCat.count} payments.`
      );
    }

    // Spend change
    if (kpis.spendChangePct !== null) {
      if (kpis.spendChangePct > 0) {
        insights.push(
          `Your expenditure increased by ${kpis.spendChangePct}% compared to the previous equivalent period ($${kpis.totalSent.toLocaleString(
            'en-US'
          )} vs previous).`
        );
      } else if (kpis.spendChangePct < 0) {
        insights.push(
          `Spending discipline improved: Outflow decreased by ${Math.abs(kpis.spendChangePct)}% compared with the previous period.`
        );
      }
    }

    // Cash flow status
    if (kpis.netCashFlow >= 0) {
      insights.push(
        `Positive cash surplus: You retained +$${kpis.netCashFlow.toLocaleString(
          'en-US'
        )} in net liquidity over the last ${daysInRange} days.`
      );
    } else {
      insights.push(
        `Deficit alert: Total outflow exceeded income by -$${Math.abs(kpis.netCashFlow).toLocaleString(
          'en-US'
        )} during this timeframe.`
      );
    }

    return insights;
  }, [currentPeriodRows, categoryData, kpis, daysInRange]);

  return (
    <div className="space-y-6">
      {/* Intelligence Header & Time Filtering */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/60 px-3 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" />
              AURA Spending Intelligence Engine
            </span>
            <span className="text-xs text-slate-400">
              Authenticated Ledger Analysis
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white mt-2">
            Spending Intelligence &amp; Cashflow Analytics
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Grounded financial observations, category breakdowns, and activity comparisons calculated from your verified accounts.
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700/60 text-xs">
            {(
              [
                { id: '7d', label: '7D' },
                { id: '30d', label: '30D' },
                { id: '3m', label: '3M' },
                { id: '6m', label: '6M' },
                { id: '12m', label: '12M' },
                { id: 'custom', label: 'Custom' },
              ] as { id: DateRangePreset; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setDateRange(p.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  dateRange === p.id
                    ? 'bg-white dark:bg-slate-700 text-navy-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-transparent text-slate-700 dark:text-slate-300 focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* 1. TRANSACTION ACTIVITY KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Outgoing Payments */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider">Total Outgoing</span>
            <span className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-navy-900 dark:text-white">
            ${kpis.totalSent.toLocaleString('en-US')}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{kpis.outgoingCount} payments</span>
            {kpis.spendChangePct !== null && (
              <span
                className={`font-semibold ${
                  kpis.spendChangePct > 0 ? 'text-rose-500' : 'text-emerald-500'
                }`}
              >
                {kpis.spendChangePct > 0 ? `+${kpis.spendChangePct}%` : `${kpis.spendChangePct}%`} vs prev
              </span>
            )}
          </div>
        </div>

        {/* Incoming Payments */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider">Total Incoming</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
              <ArrowDownLeft className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            +${kpis.totalReceived.toLocaleString('en-US')}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{kpis.incomingCount} credits</span>
            <span className="text-slate-400">Salary &amp; Transfers</span>
          </div>
        </div>

        {/* Net Cash Flow */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider">Net Cash Flow</span>
            <span className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div
            className={`text-2xl font-extrabold ${
              kpis.netCashFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {kpis.netCashFlow >= 0 ? '+' : ''}${kpis.netCashFlow.toLocaleString('en-US')}
          </div>
          <div className="text-xs text-slate-400">
            Avg: ${kpis.avgTxValue.toLocaleString('en-US')} / transaction
          </div>
        </div>

        {/* Total Activity & Largest Payment */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold uppercase tracking-wider">Activity &amp; Peaks</span>
            <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600">
              <BarChart3 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-extrabold text-navy-900 dark:text-white">
            {kpis.totalCount} txns
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Largest: ${kpis.largestTx.toLocaleString('en-US')}</span>
            {kpis.activityChangePct !== null && (
              <span className="font-semibold text-blue-500">
                {kpis.activityChangePct >= 0 ? `+${kpis.activityChangePct}%` : `${kpis.activityChangePct}%`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. AI FINANCIAL OBSERVATIONS (GROUNDED) */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-purple-950/40 via-blue-950/30 to-slate-900 border border-purple-800/40 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider">
            Grounded Financial Intelligence Observations
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {aiInsights.map((insight, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed"
            >
              {insight}
            </div>
          ))}
        </div>
      </div>

      {/* 2. SPENDING BY CATEGORY & DONUT / BAR CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Category Breakdown Donut */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-purple-500" />
                Spending by Category
              </h3>
              <span className="text-xs text-slate-400">
                {categoryData.length} categories
              </span>
            </div>

            <div className="h-64 mt-4">
              {categoryData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No expenditure in this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(val: any) => [`$${Number(val).toLocaleString('en-US')}`, 'Expenditure']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Quick Legend & Distribution */}
          <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-800 max-h-48 overflow-y-auto pr-1">
            {categoryData.map((c) => (
              <div
                key={c.category}
                onClick={() =>
                  setSelectedCategoryDrilldown(
                    selectedCategoryDrilldown === c.category ? null : c.category
                  )
                }
                className={`p-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition ${
                  selectedCategoryDrilldown === c.category
                    ? 'bg-purple-50 dark:bg-purple-950/60 font-bold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: c.fill }}
                  />
                  <span className="text-slate-700 dark:text-slate-300">{c.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-navy-900 dark:text-white">
                    ${c.amount.toLocaleString('en-US')}
                  </span>
                  <span className="text-[11px] text-slate-400">({c.percentage}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Horizontal Bar & Drilldown */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-500" />
                  Category Expenditure Distribution &amp; Drill-down
                </h3>
                <p className="text-xs text-slate-400">
                  Click any category to inspect specific underlying transactions.
                </p>
              </div>
              {selectedCategoryDrilldown && (
                <button
                  onClick={() => setSelectedCategoryDrilldown(null)}
                  className="text-xs text-purple-600 hover:underline"
                >
                  Clear Drill-down
                </button>
              )}
            </div>

            {/* Horizontal Bar Chart */}
            <div className="h-56 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData.slice(0, 7)} layout="vertical">
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                  <YAxis dataKey="category" type="category" width={100} tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(val: any) => [`$${Number(val).toLocaleString()}`, 'Amount']} />
                  <Bar dataKey="amount" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Drilldown Table when a category is selected */}
          {selectedCategoryDrilldown && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                Drill-down: {selectedCategoryDrilldown} ({drilldownRows.length} transactions)
              </span>

              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {drilldownRows.map((t) => (
                  <div
                    key={t.id}
                    className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-navy-900 dark:text-white">
                        {t.merchant}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {t.date ? new Date(t.date).toLocaleDateString() : ''} • {t.description}
                      </div>
                    </div>
                    <span className="font-bold text-rose-600 dark:text-rose-400">
                      -${t.amount.toLocaleString('en-US')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. SPENDING TRENDS OVER TIME */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-500" />
              Cash Inflow vs Outflow Trends
            </h3>
            <p className="text-xs text-slate-400">
              Aggregated daily, weekly, or monthly cashflow over selected timeline.
            </p>
          </div>

          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
            {(['daily', 'weekly', 'monthly'] as const).map((int) => (
              <button
                key={int}
                onClick={() => setAggregationInterval(int)}
                className={`px-3 py-1 rounded-lg capitalize font-semibold transition ${
                  aggregationInterval === int
                    ? 'bg-white dark:bg-slate-700 text-navy-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-navy-900'
                }`}
              >
                {int}
              </button>
            ))}
          </div>
        </div>

        <div className="h-72 w-full">
          {trendData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              No trend data available for this range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                <RechartsTooltip formatter={(val: any) => [`$${Number(val).toLocaleString()}`]} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="incoming"
                  name="Incoming"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                />
                <Area
                  type="monotone"
                  dataKey="outgoing"
                  name="Outgoing"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
