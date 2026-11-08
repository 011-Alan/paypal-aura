import React, { useState } from 'react';
import {
  ArrowLeft,
  ShoppingBag,
  CreditCard,
  Check,
  Star,
  ShieldCheck,
  Truck,
  RotateCcw,
  Sparkles,
  Info,
  ExternalLink,
} from 'lucide-react';
import { EcommerceProduct } from './EcommerceTypes';

interface EcommerceProductDetailsProps {
  product: EcommerceProduct;
  onBack: () => void;
  onAddToCart: (product: EcommerceProduct, variant: string, quantity: number) => Promise<void>;
  onBuyNow: (product: EcommerceProduct, variant: string, quantity: number) => void;
}

export const EcommerceProductDetails: React.FC<EcommerceProductDetailsProps> = ({
  product,
  onBack,
  onAddToCart,
  onBuyNow,
}) => {
  const images = product.images && product.images.length > 0 ? product.images : [product.imageUrl];
  const [selectedImage, setSelectedImage] = useState(images[0]);
  const [selectedVariant, setSelectedVariant] = useState(product.variants?.[0] || 'Standard');
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [addedMessage, setAddedMessage] = useState(false);

  const handleAddToCart = async () => {
    setIsAdding(true);
    try {
      await onAddToCart(product, selectedVariant, quantity);
      setAddedMessage(true);
      setTimeout(() => setAddedMessage(false), 2500);
    } finally {
      setIsAdding(false);
    }
  };

  const handleBuyNow = () => {
    onBuyNow(product, selectedVariant, quantity);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Back Breadcrumb Navigation */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Storefront
      </button>

      {/* Main Details Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-6 lg:p-10">
          {/* Left Column: Image Gallery */}
          <div className="lg:col-span-6 space-y-4">
            <div className="aspect-4/3 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200/80 dark:border-slate-800">
              <img
                src={selectedImage}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>

            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImage(img)}
                    className={`w-20 h-20 rounded-xl overflow-hidden border-2 shrink-0 transition ${
                      selectedImage === img
                        ? 'border-blue-600 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                    }`}
                  >
                    <img src={img} alt={`${product.name} view ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Confidence Badges */}
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <div className="font-bold text-navy-900 dark:text-white">Simulated Shipping</div>
                  <div className="text-[11px] text-slate-500">Fast multi-stage demo delivery</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <div className="font-bold text-navy-900 dark:text-white">PayPal Sandbox</div>
                  <div className="text-[11px] text-slate-500">Verified Orders v2 execution</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Product Info & Purchase Controls */}
          <div className="lg:col-span-6 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900">
                  {product.brand} • {product.category}
                </span>

                {product.availability === 'in_stock' ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    In Stock &amp; Ready
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                    Limited Availability
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white leading-snug">
                {product.name}
              </h1>

              {product.rating && (
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                    ))}
                  </div>
                  <span className="font-bold text-navy-900 dark:text-white">{product.rating}</span>
                  <span>({product.reviewCount || 128} verified customer reviews)</span>
                </div>
              )}

              {/* Price Box */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  AURA Demo Store Price:
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-extrabold text-navy-900 dark:text-white">
                    ${product.demoPriceUsd.toFixed(2)}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                    10% Demo Promo
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                  Original Retailer Reference:{' '}
                  <span className="line-through font-semibold text-slate-600 dark:text-slate-300">
                    ${product.retailPriceRefUsd.toFixed(2)}
                  </span>{' '}
                  via {product.retailerName}
                </div>
              </div>

              {/* Multi-Merchant Offers from Channel3 */}
              {product.merchantOffers && product.merchantOffers.length > 0 && (
                <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      Channel3 Verified Merchant Offers ({product.merchantOffers.length})
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Live Multi-Retailer Prices
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {product.merchantOffers.map((offer, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                          offer.isLowestPrice
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            {offer.retailerName}
                            {offer.isLowestPrice && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
                                Lowest
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {offer.deliveryTimeframe || '2-4 business days'} • {offer.inStock ? 'In Stock' : 'Pre-order'}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-navy-900 dark:text-white">
                            ${offer.offerPriceUsd}
                          </span>
                          <a
                            href={offer.affiliateAttributionUrl || offer.purchaseUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Visit retailer store with attribution"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Variant Selector */}
              {product.variants && product.variants.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-navy-900 dark:text-white uppercase tracking-wider">
                    Select Variant / Size:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setSelectedVariant(v)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                          selectedVariant === v
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-navy-900 dark:text-white uppercase tracking-wider">
                  Quantity:
                </label>
                <div className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300"
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-sm font-bold text-navy-900 dark:text-white">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.min(10, quantity + 1))}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300"
                  >
                    +
                  </button>
                </div>
              </div>

              {addedMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 font-semibold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  Added {quantity} × "{product.name}" ({selectedVariant}) to your cart!
                </div>
              )}
            </div>

            {/* Purchase Buttons */}
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={isAdding}
                  className="py-3 px-5 rounded-2xl border-2 border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 active:scale-98 text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2"
                >
                  <ShoppingBag className="w-4 h-4" />
                  {isAdding ? 'Adding to Cart...' : 'Add to Cart'}
                </button>

                <button
                  type="button"
                  onClick={handleBuyNow}
                  className="py-3 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  Buy Now (${(product.demoPriceUsd * quantity).toFixed(2)})
                </button>
              </div>

              {/* Retailer & Demo Disclaimer */}
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>AURA Store Disclaimer:</strong> This purchase runs on the AURA Demo Store via PayPal Sandbox. The original retailer ({product.retailerName}) does not receive this order. Sourced through Channel3.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Specifications & Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Description & Key Features */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-bold text-navy-900 dark:text-white">Product Description</h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              {product.description}
            </p>
          </div>

          {product.features && product.features.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-navy-900 dark:text-white">Key Highlights &amp; Features</h3>
              <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                {product.features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Technical Specifications Table */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-navy-900 dark:text-white">Specifications</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {Object.entries(product.specifications || {}).map(([key, val]) => (
              <div key={key} className="py-2.5 flex justify-between gap-4">
                <span className="font-semibold text-slate-500 dark:text-slate-400">{key}</span>
                <span className="font-bold text-navy-900 dark:text-white text-right">{val}</span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <a
              href={product.purchaseUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
            >
              Inspect Original Retailer Listing <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
