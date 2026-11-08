import React, { useState } from 'react';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  DollarSign,
  User,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { EcommerceOrder, FulfillmentStatus } from './EcommerceTypes';
import { apiRequest } from '../../lib/api';

interface BryntumTaskBoardProps {
  orders: EcommerceOrder[];
  onOrderUpdated: () => void;
  onOpenOrderDetails: (order: EcommerceOrder) => void;
}

interface ColumnDef {
  id: FulfillmentStatus;
  title: string;
  stageNumber: number;
  bg: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  nextStatus?: FulfillmentStatus;
  nextLabel?: string;
}

const STAGES: ColumnDef[] = [
  {
    id: 'order_confirmed',
    title: '1. Awaiting Confirmation',
    stageNumber: 1,
    bg: 'bg-blue-50/50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-900/40',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/60',
    badgeText: 'text-blue-700 dark:text-blue-300',
    nextStatus: 'processing',
    nextLabel: 'Start Processing',
  },
  {
    id: 'processing',
    title: '2. Processing',
    stageNumber: 2,
    bg: 'bg-purple-50/50 dark:bg-purple-950/20',
    border: 'border-purple-200 dark:border-purple-900/40',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/60',
    badgeText: 'text-purple-700 dark:text-purple-300',
    nextStatus: 'packed',
    nextLabel: 'Mark Packed',
  },
  {
    id: 'packed',
    title: '3. Packed',
    stageNumber: 3,
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-900/40',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/60',
    badgeText: 'text-amber-700 dark:text-amber-300',
    nextStatus: 'shipped',
    nextLabel: 'Dispatch Shipment',
  },
  {
    id: 'shipped',
    title: '4. Shipped',
    stageNumber: 4,
    bg: 'bg-indigo-50/50 dark:bg-indigo-950/20',
    border: 'border-indigo-200 dark:border-indigo-900/40',
    badgeBg: 'bg-indigo-100 dark:bg-indigo-900/60',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    nextStatus: 'out_for_delivery',
    nextLabel: 'Out for Delivery',
  },
  {
    id: 'out_for_delivery',
    title: '5. Out for Delivery',
    stageNumber: 5,
    bg: 'bg-cyan-50/50 dark:bg-cyan-950/20',
    border: 'border-cyan-200 dark:border-cyan-900/40',
    badgeBg: 'bg-cyan-100 dark:bg-cyan-900/60',
    badgeText: 'text-cyan-700 dark:text-cyan-300',
    nextStatus: 'delivered',
    nextLabel: 'Confirm Delivered',
  },
  {
    id: 'delivered',
    title: '6. Delivered',
    stageNumber: 6,
    bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
    border: 'border-emerald-200 dark:border-emerald-900/40',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/60',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
  },
];

export const BryntumTaskBoardFulfillment: React.FC<BryntumTaskBoardProps> = ({
  orders,
  onOrderUpdated,
  onOpenOrderDetails,
}) => {
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [stageNotice, setStageNotice] = useState<string>('');

  const handleAdvanceStage = async (e: React.MouseEvent, order: EcommerceOrder, nextStatus: FulfillmentStatus) => {
    e.stopPropagation();
    setAdvancingId(order._id);
    setStageNotice('');

    try {
      const trackingNumber =
        order.shipment?.trackingNumber ||
        `AURATRACK-${order.orderNumber.slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

      await apiRequest(`/ecommerce/merchant/orders/${order._id}/fulfillment`, {
        method: 'PUT',
        body: JSON.stringify({
          fulfillmentStatus: nextStatus,
          carrier: nextStatus === 'shipped' ? 'FedEx Express' : order.shipment?.carrier,
          trackingNumber: nextStatus === 'shipped' ? trackingNumber : order.shipment?.trackingNumber,
          notes: `Advanced to ${nextStatus.replace('_', ' ').toUpperCase()} via Bryntum TaskBoard`,
        }),
      });

      setStageNotice(`Order #${order.orderNumber} successfully advanced to ${nextStatus.replace('_', ' ')}.`);
      onOrderUpdated();
    } catch (err: any) {
      alert(`Failed to advance order: ${err?.message || 'Error updating order'}`);
    } finally {
      setAdvancingId(null);
    }
  };

  // Group orders into columns
  const getOrdersForStage = (status: FulfillmentStatus) => {
    return orders.filter((o) => {
      if (status === 'order_confirmed') {
        return o.fulfillmentStatus === 'order_confirmed' || o.fulfillmentStatus === 'payment_completed';
      }
      return o.fulfillmentStatus === status;
    });
  };

  return (
    <div className="space-y-4">
      {/* TaskBoard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
              Bryntum TaskBoard • Merchant Commerce Fulfillment
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                6 Stages
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Interactive kanban workflow synchronised with PayPal captures and customer shipment tracking.
            </p>
          </div>
        </div>

        {stageNotice && (
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {stageNotice}
          </div>
        )}
      </div>

      {/* 6 Kanban Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4">
        {STAGES.map((col) => {
          const colOrders = getOrdersForStage(col.id);

          return (
            <div
              key={col.id}
              className={`flex flex-col rounded-2xl border ${col.border} ${col.bg} p-3 min-h-[500px] transition-colors`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-xs font-bold text-navy-900 dark:text-white truncate">
                  {col.title}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badgeBg} ${col.badgeText}`}
                >
                  {colOrders.length}
                </span>
              </div>

              {/* Order Cards List */}
              <div className="flex-1 mt-3 space-y-3 overflow-y-auto pr-0.5 max-h-[600px]">
                {colOrders.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-[11px] text-slate-400 italic text-center">
                    No orders at this stage
                  </div>
                ) : (
                  colOrders.map((order) => {
                    const isAdvancing = advancingId === order._id;

                    return (
                      <div
                        key={order._id}
                        onClick={() => onOpenOrderDetails(order)}
                        className="group bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-purple-400 dark:hover:border-purple-600 hover:shadow-md transition cursor-pointer space-y-2.5"
                      >
                        {/* Order Header */}
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-navy-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                            #{order.orderNumber}
                          </span>
                          <span className="font-extrabold text-xs text-navy-900 dark:text-white">
                            ${order.totalAmount}
                          </span>
                        </div>

                        {/* Customer */}
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{order.customerName}</span>
                        </div>

                        {/* Items Summary */}
                        <div className="space-y-1">
                          {(order.items || []).slice(0, 2).map((item, idx) => (
                            <div
                              key={idx}
                              className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1"
                            >
                              <ShoppingBag className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                              <span className="truncate">
                                {item.quantity}x {item.name}
                              </span>
                            </div>
                          ))}
                          {(order.items || []).length > 2 && (
                            <span className="text-[9px] text-slate-400 italic">
                              +{(order.items || []).length - 2} more item(s)
                            </span>
                          )}
                        </div>

                        {/* Shipment Info / Tracking */}
                        {order.shipment?.trackingNumber && (
                          <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-500 flex items-center gap-1">
                            <Truck className="w-3 h-3 text-blue-500 shrink-0" />
                            <span className="truncate font-mono">
                              {order.shipment.trackingNumber}
                            </span>
                          </div>
                        )}

                        {/* Footer & Advance Button */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </span>

                          {col.nextStatus && (
                            <button
                              type="button"
                              onClick={(e) => handleAdvanceStage(e, order, col.nextStatus!)}
                              disabled={isAdvancing}
                              className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-[10px] font-bold flex items-center gap-1 shadow-xs transition disabled:opacity-50"
                              title={col.nextLabel}
                            >
                              {isAdvancing ? (
                                'Updating...'
                              ) : (
                                <>
                                  <span>{col.nextLabel}</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
