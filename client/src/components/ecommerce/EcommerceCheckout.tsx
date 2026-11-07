import React, { useState } from 'react';
import {
  ArrowLeft,
  ShieldCheck,
  CreditCard,
  Lock,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Edit2,
  ExternalLink,
  Info,
} from 'lucide-react';
import { EcommerceCartItem, EcommerceShippingAddress } from './EcommerceTypes';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface EcommerceCheckoutProps {
  items: EcommerceCartItem[];
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  onBackToCart: () => void;
  onPaymentSuccess: (orderId: string, orderNumber: string) => void;
}

export const EcommerceCheckout: React.FC<EcommerceCheckoutProps> = ({
  items,
  subtotal,
  shippingFee,
  totalAmount,
  onBackToCart,
  onPaymentSuccess,
}) => {
  const { user } = useAuth();

  // Shipping Address Form State
  const [address, setAddress] = useState<EcommerceShippingAddress>({
    fullName: user?.name || 'Alex Sandbox Buyer',
    streetAddress: '2211 North First Street',
    locality: 'San Jose',
    region: 'CA',
    postalCode: '95131',
    country: 'US',
    phone: '+1 (408) 555-0199',
  });

  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [paypalApprovalUrl, setPaypalApprovalUrl] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrderNumber, setActiveOrderNumber] = useState<string | null>(null);

  const handlePayWithPayPal = async () => {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      // 1. Create order & PayPal order via backend
      const res = await apiRequest<{
        success: boolean;
        order: any;
        paypalOrderId: string;
        approvalUrl: string;
      }>('/ecommerce/orders/create-paypal-order', {
        method: 'POST',
        body: JSON.stringify({
          shippingAddress: address,
          items: items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            selectedVariant: it.selectedVariant,
          })),
        }),
      });

      setActiveOrderId(res.order._id);
      setActiveOrderNumber(res.order.orderNumber);
      setPaypalApprovalUrl(res.approvalUrl);

      // Open PayPal approval window or redirect
      if (res.approvalUrl) {
        window.location.href = res.approvalUrl;
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to initiate PayPal Checkout.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Header & Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToCart}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Shopping Cart
        </button>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <Lock className="w-3.5 h-3.5" />
          Encrypted Sandbox Checkout
        </div>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-900 dark:text-white">
          Order Confirmation &amp; Checkout
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
          Please review your product selections, shipping destination, and authoritative order total before authorizing payment.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: Products & Breakdown on Left, Shipping & Payment on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Products & Totals */}
        <div className="lg:col-span-7 space-y-6">
          {/* Product Items Table */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              1. Product Information ({items.length} {items.length === 1 ? 'Item' : 'Items'})
            </h2>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((it) => (
                <div key={`${it.productId}-${it.selectedVariant}`} className="py-4 flex gap-4">
                  <img
                    src={it.imageUrl}
                    alt={it.name}
                    className="w-16 h-16 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                      {it.brand}
                    </div>
                    <h3 className="text-xs font-bold text-navy-900 dark:text-white line-clamp-1">{it.name}</h3>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Variant: <span className="font-semibold text-slate-700 dark:text-slate-300">{it.selectedVariant}</span> • Qty: {it.quantity}
                    </div>
                    <div className="text-xs font-bold text-navy-900 dark:text-white pt-1">
                      ${it.demoPrice.toFixed(2)} each × {it.quantity} = ${(it.demoPrice * it.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Authoritative Order Breakdown */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wider">
              2. Order Summary Breakdown
            </h2>

            <div className="space-y-2 text-xs divide-y divide-slate-100 dark:divide-slate-800">
              <div className="flex justify-between py-1 text-slate-600 dark:text-slate-400">
                <span>Subtotal ({items.reduce((s, it) => s + it.quantity, 0)} items)</span>
                <span className="font-bold text-navy-900 dark:text-white">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5" /> Shipping Charges
                </span>
                <span className="font-bold text-navy-900 dark:text-white">
                  {shippingFee === 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">FREE (Orders &gt; $100)</span>
                  ) : (
                    `$${shippingFee.toFixed(2)}`
                  )}
                </span>
              </div>
              <div className="flex justify-between py-1 text-slate-600 dark:text-slate-400">
                <span>Applicable Taxes</span>
                <span className="font-bold text-navy-900 dark:text-white">$0.00</span>
              </div>
              <div className="flex justify-between py-2 text-sm font-bold text-navy-900 dark:text-white border-t-2 border-slate-200 dark:border-slate-700">
                <span>Final Amount Payable</span>
                <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
                  ${totalAmount.toFixed(2)} USD
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Shipping Details & PayPal Action */}
        <div className="lg:col-span-5 space-y-6">
          {/* Shipping Address Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-navy-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                3. Shipping Information
              </h2>
              <button
                type="button"
                onClick={() => setIsEditingAddress(!isEditingAddress)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1"
              >
                <Edit2 className="w-3 h-3" />
                {isEditingAddress ? 'Done' : 'Edit'}
              </button>
            </div>

            {isEditingAddress ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Recipient Full Name</label>
                  <input
                    type="text"
                    value={address.fullName}
                    onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                    className="w-full mt-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Street Address</label>
                  <input
                    type="text"
                    value={address.streetAddress}
                    onChange={(e) => setAddress({ ...address, streetAddress: e.target.value })}
                    className="w-full mt-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">City</label>
                    <input
                      type="text"
                      value={address.locality}
                      onChange={(e) => setAddress({ ...address, locality: e.target.value })}
                      className="w-full mt-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">State / Region</label>
                    <input
                      type="text"
                      value={address.region}
                      onChange={(e) => setAddress({ ...address, region: e.target.value })}
                      className="w-full mt-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Postal Code</label>
                    <input
                      type="text"
                      value={address.postalCode}
                      onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                      className="w-full mt-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Country</label>
                    <input
                      type="text"
                      value={address.country}
                      onChange={(e) => setAddress({ ...address, country: e.target.value })}
                      className="w-full mt-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">Phone</label>
                  <input
                    type="text"
                    value={address.phone || ''}
                    onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                    className="w-full mt-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <div className="font-bold text-navy-900 dark:text-white">{address.fullName}</div>
                <div className="text-slate-600 dark:text-slate-300">{address.streetAddress}</div>
                <div className="text-slate-600 dark:text-slate-300">
                  {address.locality}, {address.region} {address.postalCode}, {address.country}
                </div>
                {address.phone && <div className="text-slate-500 text-[11px]">Phone: {address.phone}</div>}
              </div>
            )}
          </div>

          {/* Mandatory Simulated Storefront Notice Box */}
          <div className="p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
              <Info className="w-4 h-4 shrink-0 text-amber-600" />
              AURA Demo Store Notice
            </div>
            <p className="leading-relaxed text-[11px]">
              You are purchasing through the <strong>AURA Demo Store</strong>. This is a simulated transaction using <strong>PayPal Sandbox</strong>. The original product retailer is not receiving this order, and physical delivery is not included unless separately arranged.
            </p>
          </div>

          {/* Pay With PayPal CTA */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <button
              type="button"
              onClick={handlePayWithPayPal}
              disabled={isSubmitting}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-navy-950 font-extrabold text-sm shadow-lg shadow-amber-500/25 active:scale-98 transition flex items-center justify-center gap-3 cursor-pointer"
            >
              {/* PayPal Dual Tone Logo */}
              <div className="flex items-center font-black tracking-tight text-base">
                <span className="text-blue-900">Pay</span>
                <span className="text-blue-700">Pal</span>
              </div>
              <span className="border-l border-navy-900/20 pl-3">
                {isSubmitting ? 'Creating PayPal Order...' : `Pay $${totalAmount.toFixed(2)} USD`}
              </span>
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 text-center">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              PayPal Sandbox Orders v2 • Instant Capture • Merchant Isolated
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
