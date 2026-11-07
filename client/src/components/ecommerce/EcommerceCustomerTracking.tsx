import React, { useState, useEffect } from 'react';
import {
  Package,
  Clock,
  CheckCircle2,
  Truck,
  ArrowRight,
  ShieldCheck,
  Calendar,
  ExternalLink,
  ShoppingBag,
  Info,
  RefreshCw,
} from 'lucide-react';
import { EcommerceOrder, FulfillmentStatus } from './EcommerceTypes';
import { apiRequest } from '../../lib/api';

const FULFILLMENT_STAGES: Array<{ status: FulfillmentStatus; label: string; description: string }> = [
  { status: 'payment_completed', label: 'Payment Completed', description: 'PayPal Sandbox payment confirmed' },
  { status: 'order_confirmed', label: 'Order Confirmed', description: 'Queued for merchant processing' },
  { status: 'processing', label: 'Processing', description: 'Item verified and staged at warehouse' },
  { status: 'packed', label: 'Packed', description: 'Packaged & courier shipping label printed' },
  { status: 'shipped', label: 'Shipped', description: 'Dispatched with shipping carrier' },
  { status: 'out_for_delivery', label: 'Out for Delivery', description: 'On courier vehicle for final drop-off' },
  { status: 'delivered', label: 'Delivered', description: 'Successfully handed over to recipient' },
];

export const EcommerceCustomerTracking: React.FC<{
  initialOrderId?: string;
  onBrowseStore: () => void;
}> = ({ initialOrderId, onBrowseStore }) => {
  const [orders, setOrders] = useState<EcommerceOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<EcommerceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = async (selectId?: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ success: boolean; orders: EcommerceOrder[] }>('/ecommerce/orders/my-orders');
      const orderList = res.orders || [];
      setOrders(orderList);

      if (selectId) {
        const found = orderList.find((o) => o._id === selectId || o.orderNumber === selectId);
        if (found) setSelectedOrder(found);
        else if (orderList.length > 0) setSelectedOrder(orderList[0]);
      } else if (orderList.length > 0 && !selectedOrder) {
        setSelectedOrder(orderList[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load your orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders(initialOrderId);
  }, [initialOrderId]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchOrders(selectedOrder?._id);
  };

  const getStageIndex = (status: FulfillmentStatus): number => {
    const idx = FULFILLMENT_STAGES.findIndex((s) => s.status === status);
    return idx >= 0 ? idx : 0;
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 px-3 py-1 rounded-full">
            <Package className="w-3.5 h-3.5" />
            AURA Customer Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white mt-2">
            My Purchases &amp; Order Tracking
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track real-time fulfillment, carrier dispatch, and timeline updates for your AURA orders.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onBrowseStore}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Continue Shopping
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-44 rounded-3xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-slate-200 dark:border-slate-800 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <Package className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-navy-900 dark:text-white">No purchases found yet</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            You haven't placed any orders in the AURA Demo Store yet. Explore our product catalog and try a simulated PayPal Sandbox purchase!
          </p>
          <button
            type="button"
            onClick={onBrowseStore}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
          >
            Browse Products
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Order Selector List (Left Column) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              Your Orders ({orders.length})
            </div>
            <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
              {orders.map((ord) => {
                const isSelected = selectedOrder?._id === ord._id;
                const stage = getStageIndex(ord.fulfillmentStatus);
                return (
                  <div
                    key={ord._id}
                    onClick={() => setSelectedOrder(ord)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-bold text-navy-900 dark:text-white">
                        {ord.orderNumber}
                      </span>
                      <span>{new Date(ord.createdAt).toLocaleDateString()}</span>
                    </div>

                    <div className="mt-2 flex items-center gap-3">
                      {ord.items?.[0] && (
                        <img
                          src={ord.items[0].imageUrl}
                          alt={ord.items[0].name}
                          className="w-12 h-12 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-navy-900 dark:text-white truncate">
                          {ord.items?.[0]?.name || 'AURA Store Item'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {ord.items?.length > 1 ? `+${ord.items.length - 1} more items` : `Qty: ${ord.items?.[0]?.quantity || 1}`}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="font-extrabold text-navy-900 dark:text-white">
                        ${ord.totalAmount.toFixed(2)} USD
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          ord.fulfillmentStatus === 'delivered'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : ord.fulfillmentStatus === 'shipped' || ord.fulfillmentStatus === 'out_for_delivery'
                            ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {FULFILLMENT_STAGES[stage]?.label || ord.fulfillmentStatus}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Order Full Tracking & Timeline (Right Column) */}
          {selectedOrder && (
            <div className="lg:col-span-8 space-y-6">
              {/* Order Overview Header Card */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Order Number</span>
                    <h2 className="text-lg font-bold font-mono text-navy-900 dark:text-white">
                      {selectedOrder.orderNumber}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Paid via PayPal Sandbox
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      Simulated Order
                    </span>
                  </div>
                </div>

                {/* Key Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Order Date</div>
                    <div className="font-bold text-navy-900 dark:text-white mt-0.5">
                      {new Date(selectedOrder.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Amount Paid</div>
                    <div className="font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
                      ${selectedOrder.totalAmount.toFixed(2)} USD
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">PayPal Capture ID</div>
                    <div className="font-mono font-bold text-navy-900 dark:text-white mt-0.5 truncate" title={selectedOrder.paymentInfo?.paypalCaptureId}>
                      {selectedOrder.paymentInfo?.paypalCaptureId || 'Verified'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Shipping Carrier</div>
                    <div className="font-bold text-navy-900 dark:text-white mt-0.5">
                      {selectedOrder.shipment?.carrier || 'Pending Dispatch'}
                    </div>
                  </div>
                </div>

                {/* Carrier & Tracking Number banner if shipped */}
                {selectedOrder.shipment?.trackingNumber && (
                  <div className="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        Courier Tracking Information
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                        Carrier: <strong>{selectedOrder.shipment.carrier}</strong> • Tracking #{' '}
                        <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                          {selectedOrder.shipment.trackingNumber}
                        </span>
                      </div>
                      {selectedOrder.shipment.estimatedDeliveryAt && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Estimated Delivery:{' '}
                          {new Date(selectedOrder.shipment.estimatedDeliveryAt).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      )}
                    </div>

                    <span className="px-3 py-1 rounded-xl bg-white dark:bg-slate-800 text-[11px] font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 self-start sm:self-center">
                      Simulated Courier Tracking
                    </span>
                  </div>
                )}
              </div>

              {/* Visual 7-Stage Fulfillment Progress Timeline */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Fulfillment Progress Timeline
                  </h3>
                  <span className="text-xs text-slate-500">
                    Stage {getStageIndex(selectedOrder.fulfillmentStatus) + 1} of 7
                  </span>
                </div>

                {/* Horizontal Progress Bar for Desktop, Vertical for Mobile */}
                <div className="relative">
                  <div className="space-y-6">
                    {FULFILLMENT_STAGES.map((st, idx) => {
                      const currentStageIdx = getStageIndex(selectedOrder.fulfillmentStatus);
                      const isCompleted = idx <= currentStageIdx;
                      const isCurrent = idx === currentStageIdx;

                      // Check if there is a matching history entry
                      const historyItem = selectedOrder.statusHistory?.find((h) => h.status === st.status);

                      return (
                        <div key={st.status} className="flex items-start gap-4 relative">
                          {/* Connecting line */}
                          {idx < FULFILLMENT_STAGES.length - 1 && (
                            <div
                              className={`absolute left-4 top-8 w-0.5 h-12 -ml-px transition-colors ${
                                idx < currentStageIdx ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-200 dark:bg-slate-800'
                              }`}
                            />
                          )}

                          {/* Node Icon */}
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10 transition-all ${
                              isCompleted
                                ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-950'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                          </div>

                          {/* Stage Content */}
                          <div className="flex-1 pb-4">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span
                                className={`text-xs sm:text-sm font-bold ${
                                  isCurrent
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : isCompleted
                                    ? 'text-navy-900 dark:text-white'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              >
                                {st.label}
                                {isCurrent && (
                                  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                                    Current Status
                                  </span>
                                )}
                              </span>

                              {historyItem && (
                                <span className="text-[11px] text-slate-400">
                                  {new Date(historyItem.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}{' '}
                                  • {new Date(historyItem.timestamp).toLocaleDateString()}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {historyItem?.notes || st.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Items in this Order */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wider">
                  Purchased Items ({selectedOrder.items?.length || 0})
                </h3>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedOrder.items?.map((it, idx) => (
                    <div key={idx} className="py-3 flex items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-3">
                        <img
                          src={it.imageUrl}
                          alt={it.name}
                          className="w-12 h-12 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                        />
                        <div>
                          <div className="font-bold text-navy-900 dark:text-white">{it.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {it.brand} • Variant: {it.selectedVariant} • Qty: {it.quantity}
                          </div>
                        </div>
                      </div>

                      <div className="font-bold text-navy-900 dark:text-white text-right">
                        ${(it.demoPrice * it.quantity).toFixed(2)} USD
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shipping Address Destination */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-2 text-xs">
                <h3 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wider">
                  Delivery Destination
                </h3>
                <div className="text-slate-700 dark:text-slate-300 font-semibold">
                  {selectedOrder.shippingAddress?.fullName}
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  {selectedOrder.shippingAddress?.streetAddress}, {selectedOrder.shippingAddress?.locality},{' '}
                  {selectedOrder.shippingAddress?.region} {selectedOrder.shippingAddress?.postalCode},{' '}
                  {selectedOrder.shippingAddress?.country}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
