import React, { useState, useEffect } from 'react';
import {
  Building2,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Lock,
  Filter,
  ChevronLeft,
  ChevronRight,
  Info,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { Tooltip } from './Tooltip';

export interface CurrencyBalance {
  currency: string;
  primary: boolean;
  totalBalance: number;
  availableBalance: number;
  withheldBalance: number;
  lastRefreshTime?: string;
}

export interface MerchantBalanceData {
  available: boolean;
  accountType: string;
  mode: 'sandbox' | 'live';
  primaryBalance: number | null;
  primaryCurrency: string | null;
  balances: CurrencyBalance[];
  lastRefreshedAt: string | null;
  statusMessage: string;
  details?: string;
  missingScope?: string;
  httpStatus?: number;
}

export interface MerchantTransaction {
  id: string;
  date: string;
  grossAmount: number;
  currency: string;
  fee?: number;
  netAmount?: number;
  status: string;
  rawStatus: string;
  type: string;
  eventCode?: string;
  description: string;
  payerName?: string;
  payerEmail?: string;
  payerAccountId?: string;
  shippingName?: string;
}

export interface MerchantTransactionsData {
  available: boolean;
  accountType: string;
  mode: 'sandbox' | 'live';
  transactions: MerchantTransaction[];
  totalItems: number;
  totalPages: number;
  page: number;
  pageSize: number;
  startDate: string;
  endDate: string;
  statusMessage: string;
  details?: string;
  missingScope?: string;
  httpStatus?: number;
  reportingDelayNotice: string;
}

export const PayPalSandboxBusinessReporting: React.FC = () => {
  const [balanceData, setBalanceData] = useState<MerchantBalanceData | null>(null);
  const [txnData, setTxnData] = useState<MerchantTransactionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dateRangeDays, setDateRangeDays] = useState(30);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedTxn, setSelectedTxn] = useState<MerchantTransaction | null>(null);

  const fetchReportingData = async (targetPage = page, isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      const now = new Date();
      const past = new Date(Date.now() - dateRangeDays * 24 * 60 * 60 * 1000);

      const txnParams = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(pageSize),
        startDate: past.toISOString(),
        endDate: now.toISOString(),
      });
      if (statusFilter) {
        txnParams.set('transactionStatus', statusFilter);
      }

      const [balancesRes, txnsRes] = await Promise.all([
        apiRequest('/paypal/merchant-reporting/balances'),
        apiRequest(`/paypal/merchant-reporting/transactions?${txnParams.toString()}`),
      ]);

      setBalanceData(balancesRes);
      setTxnData(txnsRes);
      setPage(targetPage);
    } catch (err: any) {
      console.error('Failed to load PayPal Sandbox Business reporting', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchReportingData(1);
  }, [dateRangeDays, pageSize, statusFilter]);

  const handleRefresh = () => {
    fetchReportingData(page, true);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && (!txnData || newPage <= txnData.totalPages)) {
      fetchReportingData(newPage);
    }
  };

  const formatCurrency = (amount: number, curr = 'USD') => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: curr,
        minimumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${curr} ${amount.toFixed(2)}`;
    }
  };

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return 'N/A';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 transition-colors">
      {/* 1. Header with Dedicated Sandbox Business Label */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/60">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-navy-900 dark:text-white tracking-tight">
                PayPal Sandbox Business Account
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800 uppercase tracking-wider">
                Merchant Reporting
              </span>
              <Tooltip content="Reflects the actual balance and transaction history of your Sandbox Business/Merchant account associated with your REST App credentials." />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Strictly reflects merchant funds and checkout order captures. Separate from personal customer wallets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition disabled:opacity-50"
            title="Refresh PayPal Reporting API"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Merchant Data'}</span>
          </button>
        </div>
      </div>

      {/* 2. PayPal 3-Hour Reporting Latency Notice */}
      <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2.5">
        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <span className="font-semibold block">PayPal Reporting Latency Notice</span>
          <p className="text-[11px] text-amber-800 dark:text-amber-400 leading-relaxed">
            PayPal Reporting APIs (<code className="font-mono">/v1/reporting/balances</code> &{' '}
            <code className="font-mono">/v1/reporting/transactions</code>) may take up to 3 hours to reflect newly executed customer payments and updated account balances.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-xs text-slate-500 space-y-2">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
          <span>Retrieving Sandbox Business Account data from PayPal...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 3. Balances Overview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                Available Merchant Balances
              </h4>
              {balanceData?.lastRefreshedAt && (
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> As of: {formatTimestamp(balanceData.lastRefreshedAt)}
                </span>
              )}
            </div>

            {balanceData?.available && balanceData.primaryBalance !== null ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Primary Available Balance */}
                <div className="p-5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/60 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      Primary Available Balance
                    </span>
                    <div className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                      {formatCurrency(balanceData.primaryBalance, balanceData.primaryCurrency || 'USD')}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-emerald-200/50 dark:border-emerald-900/40 text-[11px] text-emerald-700 dark:text-emerald-400">
                    <span>Currency: {balanceData.primaryCurrency}</span>
                    <span className="font-semibold inline-flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Live Verified
                    </span>
                  </div>
                </div>

                {/* Withheld Balance (if any) */}
                {balanceData.balances.some((b) => b.withheldBalance > 0) ? (
                  <div className="p-5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/60 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        Withheld / Reserve Balance
                      </span>
                      <div className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                        {formatCurrency(
                          balanceData.balances.reduce((acc, curr) => acc + curr.withheldBalance, 0),
                          balanceData.primaryCurrency || 'USD'
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-amber-700 dark:text-amber-400 mt-3 pt-2 border-t border-amber-200/50 dark:border-amber-900/40">
                      Pending settlement or temporary reserve holds
                    </span>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Total Balance (All Categories)
                      </span>
                      <div className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                        {formatCurrency(
                          balanceData.balances.reduce((acc, curr) => acc + curr.totalBalance, 0),
                          balanceData.primaryCurrency || 'USD'
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                      Zero withheld reserve holds reported
                    </span>
                  </div>
                )}

                {/* Multi-Currency Balances */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Currencies Reported ({balanceData.balances.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {balanceData.balances.map((b) => (
                        <span
                          key={b.currency}
                          className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-navy-900 dark:text-white"
                        >
                          {b.currency}: {b.availableBalance.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                    PayPal multi-currency merchant wallet
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <span className="text-xs font-bold text-navy-900 dark:text-white block">
                    {balanceData?.statusMessage || 'Sandbox Business Account balances unavailable.'}
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {balanceData?.details ||
                      'Requires https://uri.paypal.com/services/reporting/balances/read permission enabled on your PayPal REST Application.'}
                  </p>
                  {balanceData?.missingScope && (
                    <p className="text-[11px] font-mono text-amber-700 dark:text-amber-400">
                      Missing scope: {balanceData.missingScope}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 4. Transaction History Section */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                Sandbox Business Transactions
              </h4>

              {/* Controls: Range, Status, Page Size */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={dateRangeDays}
                  onChange={(e) => setDateRangeDays(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={90}>Last 90 Days</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  <option value="">All Statuses</option>
                  <option value="S">Completed (S)</option>
                  <option value="P">Pending (P)</option>
                  <option value="D">Denied (D)</option>
                  <option value="V">Reversed (V)</option>
                </select>

                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>
            </div>

            {txnData?.available && txnData.transactions.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Transaction ID</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3">Payer / Customer</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Gross</th>
                      <th className="py-2.5 px-3 text-right">Fee</th>
                      <th className="py-2.5 px-3 text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {txnData.transactions.map((txn) => {
                      const isPositive = txn.grossAmount >= 0;
                      return (
                        <tr
                          key={txn.id}
                          onClick={() => setSelectedTxn(txn)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition"
                        >
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {formatTimestamp(txn.date)}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                            {txn.id}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-navy-900 dark:text-white max-w-[200px] truncate">
                            {txn.description}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                            {txn.payerName || txn.payerEmail || '-'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                txn.rawStatus === 'S' || txn.rawStatus === 'COMPLETED'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                  : txn.rawStatus === 'P'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                              }`}
                            >
                              {txn.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-navy-900 dark:text-white">
                            {formatCurrency(txn.grossAmount, txn.currency)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">
                            {txn.fee !== undefined ? formatCurrency(txn.fee, txn.currency) : '-'}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold ${
                              isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                            }`}
                          >
                            {txn.netAmount !== undefined ? formatCurrency(txn.netAmount, txn.currency) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <span className="text-xs font-bold text-navy-900 dark:text-white block">
                    {txnData?.statusMessage || 'Sandbox Business Account transaction search unavailable.'}
                  </span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {txnData?.details ||
                      'Requires https://uri.paypal.com/services/reporting/search/read permission enabled on your PayPal REST Application.'}
                  </p>
                  {txnData?.missingScope && (
                    <p className="text-[11px] font-mono text-amber-700 dark:text-amber-400">
                      Missing scope: {txnData.missingScope}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Pagination Controls */}
            {txnData?.available && txnData.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-400">
                  Showing page {txnData.page} of {txnData.totalPages} ({txnData.totalItems} total transactions)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold px-2">{page}</span>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= txnData.totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 5. Selected Transaction Detail Modal */}
          {selectedTxn && (
            <div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={() => setSelectedTxn(null)}
            >
              <div
                className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-xl space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h4 className="text-sm font-bold text-navy-900 dark:text-white">Transaction Details</h4>
                  <button
                    onClick={() => setSelectedTxn(null)}
                    className="text-slate-400 hover:text-slate-600 text-xs font-semibold px-2 py-1"
                  >
                    Close
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400">Transaction ID</span>
                    <span className="font-mono font-bold text-navy-900 dark:text-white">{selectedTxn.id}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400">Initiation Date</span>
                    <span>{formatTimestamp(selectedTxn.date)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400">Description</span>
                    <span className="font-medium text-navy-900 dark:text-white">{selectedTxn.description}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400">Status</span>
                    <span className="font-semibold text-emerald-600">{selectedTxn.status}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400">Payer Name</span>
                    <span>{selectedTxn.payerName || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400">Payer Email</span>
                    <span>{selectedTxn.payerEmail || '-'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400">Gross Amount</span>
                    <span className="font-bold">{formatCurrency(selectedTxn.grossAmount, selectedTxn.currency)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-400">PayPal Fee</span>
                    <span className="text-slate-500">
                      {selectedTxn.fee !== undefined ? formatCurrency(selectedTxn.fee, selectedTxn.currency) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-sm">
                    <span className="text-navy-900 dark:text-white">Net Settled</span>
                    <span className="text-emerald-600">
                      {selectedTxn.netAmount !== undefined
                        ? formatCurrency(selectedTxn.netAmount, selectedTxn.currency)
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6. Footer Disclosures */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-slate-400 gap-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-600" /> OAuth 2.0 Client Credentials
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-indigo-500" /> Read-Only Reporting Isolation
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Clock className="w-3 h-3" />
              <span>Sandbox Base URL: https://api-m.sandbox.paypal.com</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
