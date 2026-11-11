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

export const SmartPurchasePage: React.FC<{
  onNavigate: (tab: NavTabId) => void;
  initialTab?: 'storefront' | 'my-purchases' | 'merchant-hub';
}> = ({ onNavigate, initialTab }) => {
  const { balancesVisible, user, switchAccountType, switchDemoPersona } = useAuth();
  const isMerchantAuthorized = Boolean(
    user?.merchantAccessEnabled === true &&
    user?.auraAccountType === 'BUSINESS' &&
    user?.merchantVerificationStatus === 'VERIFIED'
  );

  // Navigation tab state: 'storefront' | 'my-purchases' | 'merchant-hub'
  const [activeTab, setActiveTab] = useState<'storefront' | 'my-purchases' | 'merchant-hub'>(() => {
    if (initialTab === 'merchant-hub' && isMerchantAuthorized) return 'merchant-hub';
    if (initialTab) return initialTab;
    return 'storefront';
  });

  // Ensure non-business accounts cannot remain in merchant hub
  useEffect(() => {
    if (!isMerchantAuthorized && activeTab === 'merchant-hub') {
      setActiveTab('storefront');
    }
  }, [isMerchantAuthorized, activeTab]);

  // Reset to storefront when a search or filter action is triggered by Ask AURA
  useEffect(() => {
    const handleResetToStorefront = () => {
      setActiveTab('storefront');
      setSelectedProduct(null);
      setIsCheckout(false);
    };

    window.addEventListener('aura-commerce-search', handleResetToStorefront);
    window.addEventListener('aura-commerce-filter', handleResetToStorefront);
    return () => {
      window.removeEventListener('aura-commerce-search', handleResetToStorefront);
      window.removeEventListener('aura-commerce-filter', handleResetToStorefront);
    };
  }, []);

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
              <h2 className="text-lg font-bold text-navy-900 dark:text-white">Store &amp; Orders</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                Direct Checkout &amp; Tracking
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

            {isMerchantAuthorized && (
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
            )}
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
      ) : (
        /* ======================================================================= */
        /* 5. MERCHANT DASHBOARD & MANUAL FULFILLMENT                              */
        /* ======================================================================= */
        isMerchantAuthorized ? (
          <EcommerceMerchantDashboard />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xs max-w-2xl mx-auto text-center space-y-5 animate-fadeIn">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-navy-900 dark:text-white">
                Merchant Operations Hub Restricted
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto leading-relaxed mt-1">
                The Merchant Operations Hub and fulfillment tools are restricted to verified Business and Merchant accounts. You are currently signed in as a <span className="font-bold text-navy-900 dark:text-white">Personal Account ({user?.email})</span>.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-left space-y-3">
              <span className="font-bold text-navy-900 dark:text-white uppercase tracking-wider text-[11px]">
                Authorized Merchant Access Options:
              </span>
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">Switch to Verified Merchant Persona</div>
                    <div className="text-[11px] text-slate-400">Log in as Bruce Wayne (Wayne Enterprises • Verified Business Account)</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchDemoPersona('bruce')}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition self-start sm:self-center"
                  >
                    Switch to Bruce
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">Upgrade Current Account to Business</div>
                    <div className="text-[11px] text-slate-400">Upgrades accountType to 'business' and provisions a Merchant Settlement account</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchAccountType('business')}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition self-start sm:self-center"
                  >
                    Upgrade to Business
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      )}
      
    </div>
  );
};
