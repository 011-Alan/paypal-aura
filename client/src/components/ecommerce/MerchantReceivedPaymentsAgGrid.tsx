import React, { useState, useEffect, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import {
  DollarSign,
  Search,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowDownLeft,
  ExternalLink,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';

export const MerchantReceivedPaymentsAgGrid: React.FC = () => {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [quickSearch, setQuickSearch] = useState('');
  const [summary, setSummary] = useState<any>(null);

  const fetchPayments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<{
        success: boolean;
        payments: any[];
        summary: any;
      }>('/ecommerce/merchant/received-payments');
      setPayments(res.payments || []);
      setSummary(res.summary || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load received payments.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncPayPal = async () => {
    setSyncing(true);
    setError('');
    try {
      await apiRequest('/paypal/sync', {
        method: 'POST',
        body: JSON.stringify({ fullHistoricalSync: true, monthsBack: 3 }),
      });
      await fetchPayments();
    } catch (err: any) {
      setError(err?.message || 'Failed to synchronize with PayPal.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const columnDefs = useMemo<ColDef[]>(
    () => [
      {
        field: 'date',
        headerName: 'Payment Date',
        sortable: true,
        filter: true,
        width: 140,
        cellRenderer: (params: any) => (
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {params.value ? new Date(params.value).toLocaleDateString() : '—'}
          </span>
        ),
      },
      {
        field: 'orderNumber',
        headerName: 'Order #',
        sortable: true,
        filter: true,
        width: 140,
        cellRenderer: (params: any) => (
          <span className="font-mono font-bold text-navy-900 dark:text-white">
            #{params.value}
          </span>
        ),
      },
      {
        field: 'customerName',
        headerName: 'Customer / Payer',
        sortable: true,
        filter: true,
        flex: 1.2,
        minWidth: 160,
      },
      {
        field: 'payerEmail',
        headerName: 'Payer Email',
        sortable: true,
        filter: true,
        flex: 1.2,
        minWidth: 180,
      },
      {
        field: 'amount',
        headerName: 'Gross Received',
        sortable: true,
        filter: 'agNumberColumnFilter',
        width: 140,
        cellRenderer: (params: any) => (
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            +${Number(params.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        ),
      },
      {
        field: 'feeAmount',
        headerName: 'PayPal Fee',
        sortable: true,
        filter: 'agNumberColumnFilter',
        width: 120,
        cellRenderer: (params: any) => (
          <span className="text-slate-500">
            ${Number(params.value || 0).toFixed(2)}
          </span>
        ),
      },
      {
        field: 'netAmount',
        headerName: 'Net Settled',
        sortable: true,
        filter: 'agNumberColumnFilter',
        width: 130,
        cellRenderer: (params: any) => (
          <span className="font-extrabold text-navy-900 dark:text-white">
            ${Number(params.value || params.data?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        ),
      },
      {
        field: 'paymentMethod',
        headerName: 'Gateway',
        sortable: true,
        width: 120,
        cellRenderer: (params: any) => (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            {params.value || 'PayPal'}
          </span>
        ),
      },
      {
        field: 'paypalCaptureId',
        headerName: 'PayPal Capture ID',
        sortable: true,
        filter: true,
        width: 170,
        cellRenderer: (params: any) => (
          <span className="font-mono text-xs text-slate-500 truncate" title={params.value}>
            {params.value || 'Local Simulation'}
          </span>
        ),
      },
      {
        field: 'status',
        headerName: 'Settlement Status',
        sortable: true,
        width: 140,
        cellRenderer: (params: any) => {
          const st = (params.value || 'completed').toLowerCase();
          if (st === 'pending') {
            return (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-3.5 h-3.5" />
                Pending
              </span>
            );
          }
          if (st === 'refunded' || st === 'reversed') {
            return (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                {st === 'refunded' ? 'Refunded' : 'Reversed'}
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed
            </span>
          );
        },
      },
    ],
    []
  );

  const filteredRows = useMemo(() => {
    if (!quickSearch.trim()) return payments;
    const q = quickSearch.toLowerCase();
    return payments.filter(
      (p) =>
        p.orderNumber?.toLowerCase().includes(q) ||
        p.customerName?.toLowerCase().includes(q) ||
        p.payerEmail?.toLowerCase().includes(q) ||
        p.paypalCaptureId?.toLowerCase().includes(q)
    );
  }, [payments, quickSearch]);

  return (
    <div className="space-y-4">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
            <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
            Received Payments
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Review incoming customer payments and transaction records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Search payments, orders, captures..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={handleSyncPayPal}
            disabled={syncing || loading}
            className="px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
            title="Synchronize latest transactions directly with PayPal Sandbox"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync PayPal'}
          </button>

          <button
            onClick={fetchPayments}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            title="Refresh payments"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading && !syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary Highlights */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Total Paid Orders</span>
            <div className="text-lg font-bold text-navy-900 dark:text-white mt-0.5">
              {summary.totalReceivedPayments} orders
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Total Revenue Settled</span>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              +${Number(summary.totalGrossAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Net After Fees</span>
            <div className="text-lg font-bold text-navy-900 dark:text-white mt-0.5">
              +${Number(summary.totalNetAmount || summary.totalGrossAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 font-semibold">
          {error}
        </div>
      )}

      {/* AG Grid Table */}
      <div className="ag-theme-quartz w-full h-[450px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xs">
        <AgGridReact
          rowData={filteredRows}
          columnDefs={columnDefs}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 25, 50]}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
          }}
        />
      </div>
    </div>
  );
};
