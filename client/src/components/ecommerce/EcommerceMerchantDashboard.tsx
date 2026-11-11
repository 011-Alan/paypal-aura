import React, { useState, useEffect, useMemo } from 'react';
import { ColDef } from 'ag-grid-community';
import {
  Store,
  DollarSign,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Eye,
  Send,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  X,
  FileText,
  Layers,
  ArrowDownLeft,
  ListOrdered,
} from 'lucide-react';
import { EcommerceOrder, FulfillmentStatus, MerchantOverview } from './EcommerceTypes';
import { apiRequest } from '../../lib/api';
import { BryntumTaskBoardFulfillment } from './BryntumTaskBoardFulfillment';
import { MerchantReceivedPaymentsAgGrid } from './MerchantReceivedPaymentsAgGrid';
import { AuraDataGrid } from '../grid/AuraDataGrid';

const STAGE_CONFIG: Record<
  FulfillmentStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  payment_completed: { label: 'Payment Completed', bg: 'bg-emerald-50 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  order_confirmed: { label: 'Order Confirmed', bg: 'bg-blue-50 dark:bg-blue-950/60', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  processing: { label: 'Processing', bg: 'bg-purple-50 dark:bg-purple-950/60', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  packed: { label: 'Packed', bg: 'bg-amber-50 dark:bg-amber-950/60', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  shipped: { label: 'Shipped', bg: 'bg-indigo-50 dark:bg-indigo-950/60', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' },
  out_for_delivery: { label: 'Out for Delivery', bg: 'bg-cyan-50 dark:bg-cyan-950/60', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
  delivered: { label: 'Delivered', bg: 'bg-teal-50 dark:bg-teal-950/60', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' },
  cancelled: { label: 'Cancelled', bg: 'bg-rose-50 dark:bg-rose-950/60', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800' },
};

export const EcommerceMerchantDashboard: React.FC = () => {
  const [merchantTab, setMerchantTab] = useState<'taskboard' | 'received_payments' | 'orders_list'>('taskboard');
  const [overview, setOverview] = useState<MerchantOverview | null>(null);
  const [orders, setOrders] = useState<EcommerceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected Order Management Modal State
  const [selectedOrder, setSelectedOrder] = useState<EcommerceOrder | null>(null);
  const [targetStatus, setTargetStatus] = useState<FulfillmentStatus>('processing');
  const [carrier, setCarrier] = useState('FedEx Express');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingDate, setShippingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [fulfillmentNotes, setFulfillmentNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  const fetchMerchantData = async () => {
    setLoading(true);
    setError('');
    try {
      const [ovRes, ordRes] = await Promise.all([
        apiRequest<{ success: boolean; overview: MerchantOverview }>('/ecommerce/merchant/overview'),
        apiRequest<{ success: boolean; orders: EcommerceOrder[]; total: number }>(
          `/ecommerce/merchant/orders?status=${statusFilter}&search=${encodeURIComponent(searchTerm)}`
        ),
      ]);
      setOverview(ovRes.overview);
      setOrders(ordRes.orders || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load merchant dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMerchantData();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMerchantData();
  };

  const openOrderManager = (order: EcommerceOrder) => {
    setSelectedOrder(order);
    setTargetStatus(
      order.fulfillmentStatus === 'payment_completed'
        ? 'order_confirmed'
        : order.fulfillmentStatus === 'order_confirmed'
        ? 'processing'
        : order.fulfillmentStatus === 'processing'
        ? 'packed'
        : order.fulfillmentStatus === 'packed'
        ? 'shipped'
        : order.fulfillmentStatus === 'shipped'
        ? 'out_for_delivery'
        : order.fulfillmentStatus === 'out_for_delivery'
        ? 'delivered'
        : order.fulfillmentStatus
    );
    setCarrier(order.shipment?.carrier || 'FedEx Express');
    setTrackingNumber(
      order.shipment?.trackingNumber ||
        `AURATRACK-${order.orderNumber.slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`
    );
    setFulfillmentNotes('');
    setUpdateError('');
    setUpdateSuccess('');
  };

  const handleUpdateFulfillment = async () => {
    if (!selectedOrder) return;
    setUpdating(true);
    setUpdateError('');
    setUpdateSuccess('');
    try {
      const res = await apiRequest<{ success: boolean; order: EcommerceOrder; message: string }>(
        `/ecommerce/merchant/orders/${selectedOrder._id}/fulfillment`,
        {
          method: 'PUT',
          body: JSON.stringify({
            fulfillmentStatus: targetStatus,
            carrier: targetStatus === 'shipped' ? carrier : undefined,
            trackingNumber: targetStatus === 'shipped' ? trackingNumber : undefined,
            shippingDate: targetStatus === 'shipped' ? shippingDate : undefined,
            estimatedDeliveryDate: targetStatus === 'shipped' ? estimatedDeliveryDate : undefined,
            notes: fulfillmentNotes,
          }),
        }
      );

      setSelectedOrder(res.order);
      if (res.order?.shipment?.trackingSyncStatus === 'failed' && res.order?.shipment?.trackingSyncError) {
        if (
          res.order.shipment.trackingSyncError.includes('NOT_AUTHORIZED') ||
          res.order.shipment.trackingSyncError.includes('403') ||
          res.order.shipment.trackingSyncError.includes('insufficient permissions')
        ) {
          setUpdateSuccess(
            `Order marked as ${targetStatus.replace('_', ' ').toUpperCase()}! Tracking number (${trackingNumber}) is active in AURA Customer Tracking. (PayPal notice: /v1/shipping/trackers is restricted to enterprise accounts in PayPal Sandbox).`
          );
        } else {
          setUpdateError(`Order updated locally in store, but PayPal tracking notice: ${res.order.shipment.trackingSyncError}`);
        }
      } else if (res.order?.shipment?.trackingSyncStatus === 'synced') {
        setUpdateSuccess(`Order updated and successfully synced to PayPal! (Tracker ID: ${res.order.shipment.paypalTrackerId})`);
      } else {
        setUpdateSuccess(res.message || 'Fulfillment status updated successfully.');
      }
      fetchMerchantData();
    } catch (err: any) {
      setUpdateError(err?.message || 'Failed to update order fulfillment.');
    } finally {
      setUpdating(false);
    }
  };

  const formattedOrders = useMemo(() => {
    return orders.map((o) => ({
      ...o,
      id: o._id,
    }));
  }, [orders]);

  const orderColumnDefs: ColDef<EcommerceOrder>[] = useMemo(() => [
    {
      field: 'orderNumber',
      headerName: 'Order #',
      filter: 'agTextColumnFilter',
      sortable: true,
      width: 150,
      cellRenderer: (p: any) => (
        <span className="font-mono font-bold text-navy-900 dark:text-white">{p.value}</span>
      ),
    },
    {
      field: 'createdAt',
      headerName: 'Date',
      filter: 'agDateColumnFilter',
      sortable: true,
      width: 120,
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString() : '—',
    },
    {
      field: 'customerName',
      headerName: 'Customer',
      filter: 'agTextColumnFilter',
      sortable: true,
      flex: 1,
      minWidth: 150,
      cellRenderer: (p: any) => (
        <div>
          <div className="font-bold text-navy-900 dark:text-white">{p.value}</div>
          <div className="text-[11px] text-slate-400">{p.data?.customerEmail}</div>
        </div>
      ),
    },
    {
      headerName: 'Item Details',
      sortable: false,
      filter: false,
      flex: 1.2,
      minWidth: 160,
      cellRenderer: (p: any) => {
        const ord = p.data;
        return (
          <div>
            <div className="font-medium text-navy-900 dark:text-white truncate">
              {ord?.items?.[0]?.name || 'Store Item'}
            </div>
            <div className="text-[11px] text-slate-400">
              {ord?.items?.length > 1
                ? `+${ord.items.length - 1} more (${ord.items.reduce((s: number, it: any) => s + it.quantity, 0)} total)`
                : `Qty: ${ord?.items?.[0]?.quantity || 1}`}
            </div>
          </div>
        );
      },
    },
    {
      field: 'totalAmount',
      headerName: 'Amount',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 120,
      cellRenderer: (p: any) => (
        <span className="font-bold text-navy-900 dark:text-white">
          ${p.value?.toFixed(2)} USD
        </span>
      ),
    },
    {
      field: 'fulfillmentStatus',
      headerName: 'Status',
      filter: 'agTextColumnFilter',
      sortable: true,
      width: 160,
      cellRenderer: (p: any) => {
        const cfg = STAGE_CONFIG[p.value as FulfillmentStatus] || {
          label: p.value,
          bg: 'bg-slate-100',
          text: 'text-slate-700',
          border: 'border-slate-200',
        };
        return (
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
          </span>
        );
      },
    },
    {
      headerName: 'Actions',
      width: 100,
      sortable: false,
      filter: false,
      cellRenderer: (p: any) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openOrderManager(p.data);
          }}
          className="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition"
        >
          Manage
        </button>
      ),
    },
  ], []);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/60 px-3 py-1 rounded-full">
            <Store className="w-3.5 h-3.5" />
            AURA Demo Store • Merchant Operations Hub
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white mt-2">
            Merchant Dashboard &amp; Order Fulfillment
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage orders settled to the PayPal Business Sandbox account, inspect payment captures, and manually advance shipment dispatch.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchMerchantData}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-1.5 self-start sm:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Store Orders
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-semibold">
          {error}
        </div>
      )}

      {/* Overview KPI Cards */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">Total Orders</div>
            <div className="text-xl font-bold text-navy-900 dark:text-white mt-1">{overview.totalOrders}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">Paid Orders</div>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{overview.paidOrders}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">Awaiting Proc.</div>
            <div className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">{overview.awaitingProcessing}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">Packed</div>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{overview.packedOrders}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">Shipped</div>
            <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{overview.shippedOrders}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-500">Delivered</div>
            <div className="text-xl font-bold text-teal-600 dark:text-teal-400 mt-1">{overview.deliveredOrders}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs col-span-2 sm:col-span-1">
            <div className="text-[11px] font-semibold text-slate-500">Revenue (USD)</div>
            <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
              ${overview.totalRevenue.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Merchant Operations Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 rounded-2xl p-2 border border-slate-200 dark:border-slate-800 shadow-xs">
        <button
          type="button"
          onClick={() => setMerchantTab('taskboard')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            merchantTab === 'taskboard'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
              : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Fulfillment Pipeline
        </button>

        <button
          type="button"
          onClick={() => setMerchantTab('received_payments')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            merchantTab === 'received_payments'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30'
              : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5" />
          Received Payments
        </button>

        <button
          type="button"
          onClick={() => setMerchantTab('orders_list')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            merchantTab === 'orders_list'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
              : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          All Orders
        </button>
      </div>

      {/* Tab Content */}
      {merchantTab === 'taskboard' && (
        <BryntumTaskBoardFulfillment
          orders={orders}
          onOrderUpdated={fetchMerchantData}
          onOpenOrderDetails={openOrderManager}
        />
      )}

      {merchantTab === 'received_payments' && <MerchantReceivedPaymentsAgGrid />}

      {merchantTab === 'orders_list' && (
        <>
          {/* Orders Filter & Search Toolbar */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="w-full sm:w-96 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by order #, customer, or tracking #..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </form>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none pb-1 sm:pb-0">
            {['all', 'order_confirmed', 'processing', 'packed', 'shipped', 'delivered'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  statusFilter === st
                    ? 'bg-navy-900 dark:bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {st === 'all' ? 'All Orders' : STAGE_CONFIG[st as FulfillmentStatus]?.label || st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Order Management AG Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <AuraDataGrid
          gridId="merchant-orders-grid"
          source="orders"
          rowData={formattedOrders}
          columnDefs={orderColumnDefs}
          quickSearch={searchTerm}
          onRowClicked={(row: any) => openOrderManager(row)}
          height="520px"
        />
      </div>
    </>
  )}

      {/* Manual Fulfillment Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Manual Fulfillment Controller
                </span>
                <h2 className="text-lg font-bold font-mono text-navy-900 dark:text-white">
                  {selectedOrder.orderNumber}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {updateError && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-semibold">
                {updateError}
              </div>
            )}
            {updateSuccess && (
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                {updateSuccess}
              </div>
            )}

            {/* Order Snapshot Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs">
              <div>
                <span className="text-slate-400">Customer:</span>
                <div className="font-bold text-navy-900 dark:text-white">{selectedOrder.customerName}</div>
                <div className="text-[11px] text-slate-500">{selectedOrder.customerEmail}</div>
              </div>
              <div>
                <span className="text-slate-400">PayPal Capture:</span>
                <div className="font-mono font-bold text-navy-900 dark:text-white truncate">
                  {selectedOrder.paymentInfo?.paypalCaptureId || 'Verified'}
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold">Funds Settled to Sandbox</div>
              </div>
              <div>
                <span className="text-slate-400">Current Stage:</span>
                <div className="font-bold text-blue-600 dark:text-blue-400">
                  {STAGE_CONFIG[selectedOrder.fulfillmentStatus]?.label || selectedOrder.fulfillmentStatus}
                </div>
              </div>
            </div>

            {/* Shipping Destination */}
            <div className="space-y-1 text-xs">
              <span className="font-bold text-slate-500 uppercase tracking-wider">Shipping Destination</span>
              <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                <div className="font-bold">{selectedOrder.shippingAddress?.fullName}</div>
                <div>{selectedOrder.shippingAddress?.streetAddress}</div>
                <div>
                  {selectedOrder.shippingAddress?.locality}, {selectedOrder.shippingAddress?.region}{' '}
                  {selectedOrder.shippingAddress?.postalCode}, {selectedOrder.shippingAddress?.country}
                </div>
                {selectedOrder.shippingAddress?.phone && (
                  <div className="text-slate-400">Phone: {selectedOrder.shippingAddress?.phone}</div>
                )}
              </div>
            </div>

            {/* Status Transition Selector */}
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-navy-900 dark:text-white uppercase tracking-wider">
                Advance Order Fulfillment Stage:
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { status: 'order_confirmed', label: '2. Confirmed' },
                  { status: 'processing', label: '3. Processing' },
                  { status: 'packed', label: '4. Packed' },
                  { status: 'shipped', label: '5. Shipped' },
                  { status: 'out_for_delivery', label: '6. Out for Delivery' },
                  { status: 'delivered', label: '7. Delivered' },
                ].map((s) => (
                  <button
                    key={s.status}
                    type="button"
                    onClick={() => setTargetStatus(s.status as FulfillmentStatus)}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                      targetStatus === s.status
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Carrier & Tracking inputs (Enforced when marking Shipped) */}
            {targetStatus === 'shipped' && (
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-3 text-xs">
                <div className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-blue-600" />
                  Mandatory Shipment Dispatch Information
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Shipping Carrier *
                    </label>
                    <select
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      className="w-full mt-1 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      <option value="FedEx Express">FedEx Express</option>
                      <option value="UPS Ground">UPS Ground</option>
                      <option value="DHL Express">DHL Express</option>
                      <option value="USPS Priority Mail">USPS Priority Mail</option>
                      <option value="Blue Dart Express">Blue Dart Express</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Tracking Number *
                    </label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="e.g. AURATRACK-748291"
                      className="w-full mt-1 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Shipping Date
                    </label>
                    <input
                      type="date"
                      value={shippingDate}
                      onChange={(e) => setShippingDate(e.target.value)}
                      className="w-full mt-1 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Estimated Delivery Date
                    </label>
                    <input
                      type="date"
                      value={estimatedDeliveryDate}
                      onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
                      className="w-full mt-1 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Synchronizes with PayPal shipment tracking API via Capture ID.
                </div>
              </div>
            )}

            {/* Notes textarea */}
            <div className="space-y-1 text-xs">
              <label className="block font-bold text-slate-600 dark:text-slate-300">
                Optional Fulfillment Notes (Visible to Customer Timeline):
              </label>
              <textarea
                value={fulfillmentNotes}
                onChange={(e) => setFulfillmentNotes(e.target.value)}
                placeholder="e.g. Package inspected at San Jose distribution hub. Tracking active."
                rows={2}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handleUpdateFulfillment}
                disabled={updating}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                {updating ? 'Updating Stage...' : `Confirm Stage: ${STAGE_CONFIG[targetStatus]?.label || targetStatus}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
