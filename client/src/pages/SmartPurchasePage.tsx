import React, { useEffect, useState, useCallback } from 'react';
import {
  ShoppingBag,
  Package,
  Store,
  Sparkles,
  Globe,
  ShieldCheck,
  Target,
  CreditCard,
  ExternalLink,
  Info,
  Check,
  ShoppingCart,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';
import { NavTabId } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';

// E-Commerce Components
import { EcommerceStorefront } from '../components/ecommerce/EcommerceStorefront';
import { EcommerceProductDetails } from '../components/ecommerce/EcommerceProductDetails';
import { EcommerceCartDrawer } from '../components/ecommerce/EcommerceCartDrawer';
import { EcommerceCheckout } from '../components/ecommerce/EcommerceCheckout';
import { EcommerceCustomerTracking } from '../components/ecommerce/EcommerceCustomerTracking';
import { EcommerceMerchantDashboard } from '../components/ecommerce/EcommerceMerchantDashboard';
import {
  EcommerceProduct,
  EcommerceCart,
  EcommerceCartItem,
} from '../components/ecommerce/EcommerceTypes';

const PRESET_SHOPPING_PROMPTS = [
  { label: 'Can I afford a laptop for $750?', query: 'laptop', maxPrice: 800 },
  { label: 'Find a phone under $300', query: 'phone', maxPrice: 300 },
  { label: 'Compare noise-cancelling headphones', query: 'headphones', maxPrice: 150 },
];

export const SmartPurchasePage: React.FC<{ onNavigate: (tab: NavTabId) => void }> = ({ onNavigate }) => {
  const { balancesVisible, user } = useAuth();

  // Navigation tab state: 'storefront' | 'my-purchases' | 'merchant-hub' | 'affordability'
  const [activeTab, setActiveTab] = useState<'storefront' | 'my-purchases' | 'merchant-hub' | 'affordability'>('storefront');

  // Sub-views
  const [selectedProduct, setSelectedProduct] = useState<EcommerceProduct | null>(null);
  const [isCheckout, setIsCheckout] = useState(false);
  const [checkoutDirectItems, setCheckoutDirectItems] = useState<EcommerceCartItem[] | null>(null);

  // Cart State
  const [cart, setCart] = useState<EcommerceCart | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);

  // Notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [targetTrackingOrderId, setTargetTrackingOrderId] = useState<string | undefined>(undefined);

  // Existing Affordability Evaluation State
  const [query, setQuery] = useState('laptop');
  const [maxPrice, setMaxPrice] = useState('800');
  const [includeKernel, setIncludeKernel] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  // --------------------------------------------------------------------------
  // Cart Management
  // --------------------------------------------------------------------------
  const loadCart = useCallback(async () => {
    setCartLoading(true);
    try {
      const res = await apiRequest<{
        success: boolean;
        cart: any;
        subtotal: number;
        shippingFee: number;
        tax: number;
        totalAmount: number;
        itemCount: number;
      }>('/ecommerce/cart');

      setCart({
        items: res.cart?.items || [],
        subtotal: res.subtotal || 0,
        shippingFee: res.shippingFee || 0,
        tax: res.tax || 0,
        totalAmount: res.totalAmount || 0,
        itemCount: res.itemCount || 0,
      });
    } catch {
      // Ignored if user not yet logged in
    } finally {
      setCartLoading(false);
    }
  }, []);

  const handleAddToCart = async (product: EcommerceProduct, variant?: string, qty = 1) => {
    try {
      const res = await apiRequest<{
        success: boolean;
        cart: any;
        subtotal: number;
        shippingFee: number;
        tax: number;
        totalAmount: number;
        itemCount: number;
      }>('/ecommerce/cart/items', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          quantity: qty,
          selectedVariant: variant,
        }),
      });

      setCart({
        items: res.cart?.items || [],
        subtotal: res.subtotal || 0,
        shippingFee: res.shippingFee || 0,
        tax: res.tax || 0,
        totalAmount: res.totalAmount || 0,
        itemCount: res.itemCount || 0,
      });

      setNotification({
        type: 'success',
        message: `Added ${qty} × "${product.name}" to cart!`,
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to add item to cart.' });
    }
  };

  const handleUpdateCartQuantity = async (productId: string, quantity: number) => {
    try {
      const res = await apiRequest<{
        success: boolean;
        cart: any;
        subtotal: number;
        shippingFee: number;
        tax: number;
        totalAmount: number;
        itemCount: number;
      }>(`/ecommerce/cart/items/${encodeURIComponent(productId)}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity }),
      });

      setCart({
        items: res.cart?.items || [],
        subtotal: res.subtotal || 0,
        shippingFee: res.shippingFee || 0,
        tax: res.tax || 0,
        totalAmount: res.totalAmount || 0,
        itemCount: res.itemCount || 0,
      });
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to update item quantity.' });
    }
  };

  const handleRemoveCartItem = async (productId: string) => {
    try {
      const res = await apiRequest<{
        success: boolean;
        cart: any;
        subtotal: number;
        shippingFee: number;
        tax: number;
        totalAmount: number;
        itemCount: number;
      }>(`/ecommerce/cart/items/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
      });

      setCart({
        items: res.cart?.items || [],
        subtotal: res.subtotal || 0,
        shippingFee: res.shippingFee || 0,
        tax: res.tax || 0,
        totalAmount: res.totalAmount || 0,
        itemCount: res.itemCount || 0,
      });
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to remove item.' });
    }
  };

  const handleClearCart = async () => {
    try {
      const res = await apiRequest<{
        success: boolean;
        cart: any;
        subtotal: number;
        shippingFee: number;
        tax: number;
        totalAmount: number;
        itemCount: number;
      }>('/ecommerce/cart', {
        method: 'DELETE',
      });

      setCart({
        items: res.cart?.items || [],
        subtotal: 0,
        shippingFee: 0,
        tax: 0,
        totalAmount: 0,
        itemCount: 0,
      });
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to clear cart.' });
    }
  };

  const handleBuyNow = (product: EcommerceProduct, variant?: string, qty = 1) => {
    const selectedVariant = variant || product.variants?.[0] || 'Standard';
    const singleItem: EcommerceCartItem = {
      productId: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
      imageUrl: product.imageUrl,
      retailerName: product.retailerName,
      purchaseUrl: product.purchaseUrl,
      originalPrice: product.retailPriceRefUsd,
      demoPrice: product.demoPriceUsd,
      currency: 'USD',
      selectedVariant,
      quantity: qty,
      availableVariants: product.variants || ['Standard'],
    };

    setCheckoutDirectItems([singleItem]);
    setSelectedProduct(null);
    setIsCheckout(true);
  };

  const handleProceedToCheckoutFromCart = () => {
    setCheckoutDirectItems(null); // Use standard cart
    setSelectedProduct(null);
    setIsCheckout(true);
  };

  // --------------------------------------------------------------------------
  // Handling PayPal Sandbox Return & Capture
  // --------------------------------------------------------------------------
  useEffect(() => {
    loadCart();

    if (typeof window !== 'undefined' && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const checkoutStatus = params.get('view') || params.get('status');
      const orderToken = params.get('token');
      const orderNumber = params.get('orderNumber');

      if (checkoutStatus === 'checkout-success' || checkoutStatus === 'approved' || (orderToken && params.has('PayerID'))) {
        const orderIdToCapture = orderToken || orderNumber;
        if (orderIdToCapture) {
          setNotification({
            type: 'info',
            message: 'PayPal payment approved by buyer! Capturing payment with PayPal Sandbox...',
          });

          apiRequest<{ success: boolean; order: any; captureId: string }>('/ecommerce/orders/capture-payment', {
            method: 'POST',
            body: JSON.stringify({
              orderNumber: orderNumber || undefined,
              paypalOrderId: orderToken || orderNumber,
            }),
          })
            .then((res) => {
              setNotification({
                type: 'success',
                message: `Payment successfully captured by PayPal Sandbox! Capture ID: ${res.captureId}. Order confirmed.`,
              });
              loadCart();
              setActiveTab('my-purchases');
              setTargetTrackingOrderId(res.order?.orderNumber || res.order?._id);
            })
            .catch((err) => {
              setNotification({
                type: 'error',
                message: `PayPal capture notice: ${err?.message}`,
              });
              setActiveTab('my-purchases');
            });
        }

        // Clean URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (checkoutStatus === 'checkout-cancelled' || checkoutStatus === 'cancelled') {
        setNotification({
          type: 'info',
          message: 'PayPal Checkout was cancelled. Your items remain in your shopping cart.',
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [loadCart]);

  // --------------------------------------------------------------------------
  // Affordability Evaluation
  // --------------------------------------------------------------------------
  const runEvaluation = async (q = query, price = maxPrice, withKernel = includeKernel) => {
    setLoading(true);
    setActionMessage('');
    try {
      const res = await apiRequest('/purchase/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          query: q,
          maxPriceInr: price ? Number(price) : undefined,
          includeKernelResearch: withKernel,
        }),
      });
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSavingsGoal = async (product: any, plan: any) => {
    await apiRequest('/goals', {
      method: 'POST',
      body: JSON.stringify({
        title: `Smart Purchase Plan: ${product.name.slice(0, 32)}`,
        category: 'Technology',
        targetAmount: product.priceInr,
        currentAmount: 0,
        monthlyContribution: plan.monthlyContributionInr,
        deadline: plan.targetCompletionDate,
      }),
    });
    setActionMessage(
      `Created savings goal for "${product.name}" at ${formatInr(plan.monthlyContributionInr)}/month for ${plan.monthsRequired} months!`
    );
  };

  const getBadgeStyle = (tier: string) => {
    if (tier === 'Comfortable within the current plan') {
      return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    }
    if (tier === 'Possible with budget adjustments') {
      return 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    }
    if (tier === 'Better postponed') {
      return 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
    return 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : notification.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-blue-50 dark:bg-blue-950/80 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {notification.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top E-Commerce Navigation Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Branding & Feature Identification */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-600/20 shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-navy-900 dark:text-white">AURA E-Commerce</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                Channel3 + PayPal Sandbox
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Modern online store, authoritative checkout, merchant management &amp; multi-stage tracking.
            </p>
          </div>
        </div>

        {/* Navigation Tabs & Actions */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <div className="inline-flex rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 p-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('storefront');
                setSelectedProduct(null);
                setIsCheckout(false);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'storefront' && !selectedProduct && !isCheckout
                  ? 'bg-white dark:bg-slate-900 text-navy-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🛍️ Storefront
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('my-purchases');
                setSelectedProduct(null);
                setIsCheckout(false);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'my-purchases'
                  ? 'bg-white dark:bg-slate-900 text-navy-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📦 My Purchases
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('merchant-hub');
                setSelectedProduct(null);
                setIsCheckout(false);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'merchant-hub'
                  ? 'bg-white dark:bg-slate-900 text-navy-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🏪 Merchant Hub
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('affordability');
                setSelectedProduct(null);
                setIsCheckout(false);
                if (!result) runEvaluation('laptop', '800', true);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'affordability'
                  ? 'bg-white dark:bg-slate-900 text-navy-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              💡 Affordability Lab
            </button>
          </div>

          {/* Shopping Cart Pill Button */}
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="relative px-3.5 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-xs transition flex items-center gap-2 shrink-0 ml-1"
            title="Open Shopping Cart"
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">Cart</span>
            {cart && cart.itemCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-400 text-navy-950 text-[11px] font-extrabold flex items-center justify-center">
                {cart.itemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Slide-over Cart Drawer */}
      <EcommerceCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        loading={cartLoading}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        onProceedToCheckout={handleProceedToCheckoutFromCart}
      />

      {/* ========================================================================= */}
      {/* 1. CHECKOUT VIEW */}
      {/* ========================================================================= */}
      {isCheckout ? (
        <EcommerceCheckout
          items={checkoutDirectItems || cart?.items || []}
          subtotal={
            checkoutDirectItems
              ? checkoutDirectItems.reduce((s, it) => s + it.demoPrice * it.quantity, 0)
              : cart?.subtotal || 0
          }
          shippingFee={
            checkoutDirectItems
              ? checkoutDirectItems.reduce((s, it) => s + it.demoPrice * it.quantity, 0) >= 100
                ? 0
                : 9.99
              : cart?.shippingFee || 0
          }
          totalAmount={
            checkoutDirectItems
              ? Math.round(
                  (checkoutDirectItems.reduce((s, it) => s + it.demoPrice * it.quantity, 0) +
                    (checkoutDirectItems.reduce((s, it) => s + it.demoPrice * it.quantity, 0) >= 100 ? 0 : 9.99)) *
                    100
                ) / 100
              : cart?.totalAmount || 0
          }
          onBackToCart={() => {
            setIsCheckout(false);
            setCheckoutDirectItems(null);
          }}
          onPaymentSuccess={(orderId, orderNumber) => {
            setIsCheckout(false);
            setCheckoutDirectItems(null);
            loadCart();
            setActiveTab('my-purchases');
            setTargetTrackingOrderId(orderNumber || orderId);
          }}
        />
      ) : selectedProduct ? (
        /* ======================================================================= */
        /* 2. PRODUCT DETAILS VIEW                                                 */
        /* ======================================================================= */
        <EcommerceProductDetails
          product={selectedProduct}
          onBack={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
        />
      ) : activeTab === 'storefront' ? (
        /* ======================================================================= */
        /* 3. STOREFRONT DISCOVERY VIEW                                            */
        /* ======================================================================= */
        <EcommerceStorefront
          onSelectProduct={(p) => setSelectedProduct(p)}
          onAddToCart={(p, v) => handleAddToCart(p, v, 1)}
          onBuyNow={handleBuyNow}
        />
      ) : activeTab === 'my-purchases' ? (
        /* ======================================================================= */
        /* 4. CUSTOMER ORDER TRACKING VIEW                                         */
        /* ======================================================================= */
        <EcommerceCustomerTracking
          initialOrderId={targetTrackingOrderId}
          onBrowseStore={() => setActiveTab('storefront')}
        />
      ) : activeTab === 'merchant-hub' ? (
        /* ======================================================================= */
        /* 5. MERCHANT DASHBOARD & MANUAL FULFILLMENT                              */
        /* ======================================================================= */
        <EcommerceMerchantDashboard />
      ) : (
        /* ======================================================================= */
        /* 6. ORIGINAL AFFORDABILITY EVALUATION LAB                                */
        /* ======================================================================= */
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 px-3 py-1 rounded-full">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Channel3 Smart Purchase Companion + KERNEL Assisted Research
                </span>
                <h2 className="text-xl font-bold text-navy-900 dark:text-white mt-2">
                  Intelligent Shopping &amp; 7-Factor Affordability Evaluation
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Evaluates every product against your discretionary budget, upcoming commitments, active savings goals, and spending preferences.
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                runEvaluation(query, maxPrice, includeKernel);
              }}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3"
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Product or category (e.g. laptop, phone, headphones)"
                className="sm:col-span-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Target Budget Ceiling (USD)"
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-xs"
              >
                {loading ? 'Evaluating Affordability...' : 'Search & Evaluate Affordability'}
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {PRESET_SHOPPING_PROMPTS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setQuery(p.query);
                      setMaxPrice(String(p.maxPrice));
                      runEvaluation(p.query, String(p.maxPrice), includeKernel);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 hover:text-blue-700 dark:hover:text-blue-300 text-xs text-slate-700 dark:text-slate-300 font-medium transition"
                  >
                    “{p.label}”
                  </button>
                ))}
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeKernel}
                  onChange={(e) => setIncludeKernel(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700"
                />
                <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Include KERNEL Assisted Research
              </label>
            </div>
          </div>

          {actionMessage && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 font-semibold">
              {actionMessage}
            </div>
          )}

          {/* Financial Context Strip */}
          {result?.financialContextSummary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                  Available Discretionary Budget
                  <Tooltip content="Current month discretionary allowance available after all essential commitments are ringfenced." />
                </div>
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                  {formatInr(result.financialContextSummary.availableDiscretionaryBudgetInr, !balancesVisible)}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                  Upcoming Commitments
                  <Tooltip content="Confirmed bills and subscriptions that must be preserved." />
                </div>
                <div className="text-xl font-bold text-navy-900 dark:text-white mt-2">
                  {formatInr(result.financialContextSummary.upcomingCommitmentsInr, !balancesVisible)}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                  Monthly Goal Targets
                  <Tooltip content="Active monthly contributions toward your defined savings goals." />
                </div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
                  {formatInr(result.financialContextSummary.activeGoalsMonthlyTargetInr, !balancesVisible)}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                  Channel3 Discovery Mode
                  <Tooltip content="Real-time product discovery catalog powered by Channel3." />
                </div>
                <div className="text-xs font-semibold text-navy-900 dark:text-white mt-2 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  {result.liveChannel3ApiUsed ? 'Channel3 Live API' : 'Verified Reference Catalog'}
                </div>
              </div>
            </div>
          )}

          {/* Product Cards with 7-Factor Affordability Evaluation */}
          {(!result?.evaluatedProducts || result.evaluatedProducts.length === 0) && !loading ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 border border-slate-200 dark:border-slate-800 text-center transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-navy-900 dark:text-white">No products evaluated yet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
                Enter a product query above or click a preset prompt to run a 7-factor financial affordability evaluation.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {(result?.evaluatedProducts || []).map(({ product, evaluation }: any) => (
                <div
                  key={product.id}
                  className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col justify-between transition-colors"
                >
                  <div>
                    <div className="p-5 flex flex-col sm:flex-row gap-4 border-b border-slate-100 dark:border-slate-800">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full sm:w-32 h-28 object-cover rounded-2xl bg-slate-100 dark:bg-slate-800 shrink-0"
                      />
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {product.brand} • {product.category}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getBadgeStyle(
                              evaluation.guidanceCategory
                            )}`}
                          >
                            {evaluation.guidanceCategory}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-navy-900 dark:text-white">{product.name}</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{product.description}</p>
                        <div className="pt-1 flex items-center justify-between">
                          <span className="text-xl font-bold text-navy-900 dark:text-white">{formatInr(product.priceInr, !balancesVisible)}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">Retailer: {product.retailerName}</span>
                        </div>
                      </div>
                    </div>

                    {/* AURA Evaluation Box */}
                    <div className="p-5 bg-slate-50/60 dark:bg-slate-800/40 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-navy-900 dark:text-white flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          AURA Affordability Assessment (Score: {evaluation.affordabilityScore}/100)
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          Uses {evaluation.impactOnDiscretionaryPercent}% of monthly discretionary cap
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{evaluation.explanation}</p>

                      {evaluation.suggestedSavingsPlan && (
                        <div className="p-3 rounded-2xl bg-blue-50/80 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <div className="font-bold text-blue-800 dark:text-blue-300">Recommended Savings Plan</div>
                            <div className="text-slate-700 dark:text-slate-300">{evaluation.suggestedSavingsPlan.summary}</div>
                          </div>
                          <button
                            onClick={() => handleCreateSavingsGoal(product, evaluation.suggestedSavingsPlan)}
                            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
                          >
                            <Target className="w-3.5 h-3.5" /> Start Savings Plan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      No automatic purchase — explicit approval required
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          handleAddToCart(product, product.variants?.[0], 1);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-xs"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        Add to AURA Cart
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* KERNEL Assisted Research Results */}
          {result?.kernelResearch && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    AURA Assisted Research (KERNEL Controlled Browser Module)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{result.kernelResearch.statusNotice}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {result.kernelResearch.executionMode}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(result.kernelResearch.structuredFindings || []).map((finding: any, idx: number) => (
                  <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                    <div className="font-bold text-navy-900 dark:text-white">{finding.title}</div>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{finding.sanitizedSummary}</p>
                    <ul className="space-y-1 text-slate-700 dark:text-slate-300 list-disc list-inside">
                      {(finding.keyFacts || []).map((f: string, i: number) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
