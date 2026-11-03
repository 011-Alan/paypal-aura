import React from 'react';
import { PieChart, TrendingUp, ShieldAlert, Calendar, CheckCircle2, DollarSign } from 'lucide-react';

export interface FinancialMetric {
  label: string;
  value: string;
  change?: string;
  status?: 'good' | 'warning' | 'alert' | 'neutral';
}

export interface FinancialSummaryCardProps {
  title?: string;
  liquidBalance?: number;
  monthlyIncome?: number;
  discretionaryRemaining?: number;
  upcomingCommitmentsTotal?: number;
  savingsRatePercent?: number;
  accountsCount?: number;
  className?: string;
}

export const FinancialSummaryCard: React.FC<FinancialSummaryCardProps> = ({
  title = 'Financial Reality Snapshot',
  liquidBalance = 84250,
  monthlyIncome = 60000,
  discretionaryRemaining = 18000,
  upcomingCommitmentsTotal = 16599,
  savingsRatePercent = 25,
  accountsCount = 3,
  className = '',
}) => {
  return (
    <div className={`my-4 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 sm:p-5 text-left ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <PieChart className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-navy-900 dark:text-white leading-tight">
              {title}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Synchronized with MongoDB, Bryntum &amp; Elastic Memory
            </p>
          </div>
        </div>

        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
          Verified Active
        </span>
      </div>

      {/* Grid of metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
            Liquid Balance
          </span>
          <span className="text-base font-extrabold text-navy-900 dark:text-white">
            ₹{liquidBalance.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {accountsCount} accounts active
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
            Discretionary Buffer
          </span>
          <span className="text-base font-extrabold text-blue-600 dark:text-blue-400">
            ₹{discretionaryRemaining.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Current month free pool
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
            Upcoming Commitments
          </span>
          <span className="text-base font-extrabold text-amber-600 dark:text-amber-400">
            ₹{upcomingCommitmentsTotal.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Ringfenced on Bryntum
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block">
            Savings Target
          </span>
          <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
            {savingsRatePercent}%
          </span>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Income: ₹{monthlyIncome.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    </div>
  );
};
