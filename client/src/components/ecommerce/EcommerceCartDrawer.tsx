import React from 'react';
import {
  X,
  Trash2,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  Truck,
  Plus,
  Minus,
} from 'lucide-react';
import { EcommerceCart } from './EcommerceTypes';

interface EcommerceCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: EcommerceCart | null;
  loading: boolean;
  onUpdateQuantity: (productId: string, quantity: number) => Promise<void>;
  onRemoveItem: (productId: string) => Promise<void>;
  onClearCart: () => Promise<void>;
  onProceedToCheckout: () => void;
}

export const EcommerceCartDrawer: React.FC<EcommerceCartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  loading,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onProceedToCheckout,
}) => {
  if (!isOpen) return null;

  const items = cart?.items || [];
  const subtotal = cart?.subtotal || 0;
  const shippingFee = cart?.shippingFee || 0;
  const totalAmount = cart?.totalAmount || 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between">
          {/* Drawer Header */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-bold text-navy-900 dark:text-white">Shopping Cart</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                {cart?.itemCount || 0}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Close cart"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Item List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-navy-900 dark:text-white">Your cart is empty</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  Explore genuine products in our store catalog and add them to your cart.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
                >
                  Start Shopping
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={`${item.productId}-${item.selectedVariant}`}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 flex gap-4 transition hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-20 h-20 rounded-xl object-cover bg-slate-100 dark:bg-slate-700 shrink-0"
                    />

                    <div className="flex-1 flex flex-col justify-between">
                      <div className="space-y-0.5">
                        <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                          {item.brand}
                        </div>
                        <h4 className="text-xs font-bold text-navy-900 dark:text-white line-clamp-1">
                          {item.name}
                        </h4>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Variant: {item.selectedVariant}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-sm font-extrabold text-navy-900 dark:text-white">
                          ${(item.demoPrice * item.quantity).toFixed(2)}
                        </span>

                        <div className="flex items-center gap-2">
                          {/* Quantity stepper */}
                          <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-l-md text-slate-600 dark:text-slate-300"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-bold text-navy-900 dark:text-white">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-r-md text-slate-600 dark:text-slate-300"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Delete item */}
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.productId)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition"
                            title="Remove from cart"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={onClearCart}
                    className="text-xs text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 font-semibold"
                  >
                    Clear All Items
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer & Checkout Controls */}
          {items.length > 0 && (
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 space-y-4">
              {/* Order Totals Summary */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span className="font-bold text-navy-900 dark:text-white">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" /> Shipping
                  </span>
                  <span className="font-bold text-navy-900 dark:text-white">
                    {shippingFee === 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">FREE</span>
                    ) : (
                      `$${shippingFee.toFixed(2)}`
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Estimated Tax</span>
                  <span className="font-bold text-navy-900 dark:text-white">$0.00</span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-sm font-bold text-navy-900 dark:text-white">
                  <span>Total Amount</span>
                  <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400">
                    ${totalAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              {subtotal < 100 && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                  Add ${(100 - subtotal).toFixed(2)} more to qualify for <strong>FREE shipping</strong>!
                </div>
              )}

              {/* Checkout Button */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onProceedToCheckout();
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-600/20 transition flex items-center justify-center gap-2"
                >
                  Proceed to Checkout <ArrowRight className="w-4 h-4" />
                </button>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Secured by PayPal Sandbox Orders v2
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
