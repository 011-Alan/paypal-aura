import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  ExternalLink,
  ShoppingCart,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Building2,
  DollarSign,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { EcommerceProduct, Channel3MerchantOffer } from './EcommerceTypes';
import { apiRequest } from '../../lib/api';

interface ProductComparisonModalProps {
  products: EcommerceProduct[];
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: EcommerceProduct, variant?: string) => void;
}

interface FinancialImpactAnalysis {
  recommendation: string;
  cheapestOption: { id: string; name: string; price: number };
  mostExpensiveOption: { id: string; name: string; price: number };
  potentialSavings: number;
  monthlyBudgetImpactPct: number;
  aiAdvice: string;
}

export const Channel3ProductComparisonModal: React.FC<ProductComparisonModalProps> = ({
  products,
  isOpen,
  onClose,
  onAddToCart,
}) => {
  const [analysis, setAnalysis] = useState<FinancialImpactAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  useEffect(() => {
    if (!isOpen || products.length < 2) return;

    const fetchAnalysis = async () => {
      setLoadingAnalysis(true);
      try {
        const data = await apiRequest<{
          success: boolean;
          comparison: any;
        }>('/ecommerce/products/compare', {
          method: 'POST',
          body: JSON.stringify({
            productIds: products.map((p) => p.id),
          }),
        });

        if (data.success && data.comparison) {
          setAnalysis({
            recommendation: data.comparison.recommendation || '',
            cheapestOption: data.comparison.cheapestOption,
            mostExpensiveOption: data.comparison.mostExpensiveOption,
            potentialSavings: data.comparison.potentialSavings || 0,
            monthlyBudgetImpactPct: data.comparison.monthlyBudgetImpactPct || 0,
            aiAdvice: data.comparison.aiAdvice || '',
          });
        }
      } catch (err) {
        console.error('Failed to fetch product comparison analysis:', err);
      } finally {
        setLoadingAnalysis(false);
      }
    };

    fetchAnalysis();
  }, [isOpen, products]);

  if (!isOpen || products.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">Product Comparison</h3>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  {products.length} Products
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Compare merchant pricing, specifications, and AI-evaluated financial impact.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI Financial Consequence Banner */}
        {products.length >= 2 && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-blue-950/40 to-slate-900 border border-purple-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                    AURA Financial Consequence Analysis
                  </span>
                  {analysis?.potentialSavings ? (
                    <span className="px-2 py-0.2 text-[11px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Save up to ${analysis.potentialSavings}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-300 mt-1">
                  {loadingAnalysis ? (
                    <span className="text-slate-400 italic">Evaluating cashflow and savings budget impact...</span>
                  ) : analysis?.aiAdvice ? (
                    analysis.aiAdvice
                  ) : (
                    `Comparing ${products.map((p) => p.name).join(' vs ')}. The lowest price is $${Math.min(
                      ...products.map((p) => p.demoPriceUsd)
                    )}.`
                  )}
                </p>
              </div>
            </div>
            {analysis?.recommendation && (
              <div className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
                <span className="text-slate-400">Best Value Pick: </span>
                <span className="font-semibold text-purple-300">{analysis.recommendation}</span>
              </div>
            )}
          </div>
        )}

        {/* Comparison Grid Content */}
        <div className="flex-1 overflow-x-auto overflow-y-auto p-6">
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${products.length}, minmax(260px, 1fr))`,
            }}
          >
            {products.map((product) => {
              const lowestOfferPrice = product.lowestPriceUsd || product.demoPriceUsd;
              const hasMultiOffers = (product.merchantOffers?.length || 0) > 1;

              return (
                <div
                  key={product.id}
                  className="flex flex-col bg-slate-800/60 border border-slate-700/70 rounded-xl overflow-hidden hover:border-slate-600 transition"
                >
                  {/* Product Header & Image */}
                  <div className="p-4 bg-slate-900/60 border-b border-slate-700/50 flex flex-col items-center text-center">
                    <div className="w-full h-44 rounded-lg bg-slate-950 flex items-center justify-center overflow-hidden mb-3">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-contain hover:scale-105 transition duration-300"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider mb-1">
                      {product.brand} • {product.category}
                    </span>
                    <h4 className="font-medium text-sm text-white line-clamp-2 leading-tight">
                      {product.name}
                    </h4>

                    {/* Pricing Block */}
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white">
                        ${product.demoPriceUsd}
                      </span>
                      {product.retailPriceRefUsd > product.demoPriceUsd && (
                        <span className="text-xs text-slate-500 line-through">
                          ${product.retailPriceRefUsd}
                        </span>
                      )}
                    </div>

                    {hasMultiOffers && (
                      <span className="mt-1 text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" />
                        From ${lowestOfferPrice} across {product.merchantOffers?.length} merchants
                      </span>
                    )}

                    {/* Actions */}
                    <div className="mt-4 w-full flex flex-col gap-2">
                      <button
                        onClick={() => onAddToCart(product)}
                        className="w-full py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/30 transition"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        Add to AURA Cart
                      </button>
                    </div>
                  </div>

                  {/* Merchant Offers Section */}
                  <div className="p-4 border-b border-slate-700/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-400" />
                        Merchant Offers
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {product.merchantOffers?.length || 1} available
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {(product.merchantOffers || []).map((offer, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                            offer.isLowestPrice
                              ? 'bg-emerald-950/30 border-emerald-700/40 text-emerald-200'
                              : 'bg-slate-900/40 border-slate-750 text-slate-300'
                          }`}
                        >
                          <div>
                            <div className="font-medium flex items-center gap-1.5">
                              {offer.retailerName}
                              {offer.isLowestPrice && (
                                <span className="px-1.5 py-0.2 text-[9px] bg-emerald-500/20 text-emerald-300 rounded font-bold">
                                  Lowest
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {offer.deliveryTimeframe || '2-4 days'} • {offer.inStock ? 'In Stock' : 'Pre-order'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">${offer.offerPriceUsd}</span>
                            <a
                              href={offer.affiliateAttributionUrl || offer.purchaseUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                              title="Visit retailer store"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Specs & Features */}
                  <div className="p-4 flex-1 space-y-3">
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                      Key Specifications
                    </span>

                    {product.specifications && Object.keys(product.specifications).length > 0 ? (
                      <dl className="space-y-1.5 text-xs">
                        {Object.entries(product.specifications).map(([key, val]) => (
                          <div key={key} className="flex justify-between py-1 border-b border-slate-750">
                            <dt className="text-slate-400">{key}:</dt>
                            <dd className="font-medium text-slate-200 text-right">{val}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-xs text-slate-400 line-clamp-4 leading-relaxed">
                        {product.description}
                      </p>
                    )}

                    {product.variants && product.variants.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[11px] text-slate-400 block mb-1">Available Sizes / Variants:</span>
                        <div className="flex flex-wrap gap-1">
                          {product.variants.slice(0, 5).map((v) => (
                            <span
                              key={v}
                              className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-700 text-slate-300"
                            >
                              {v}
                            </span>
                          ))}
                          {product.variants.length > 5 && (
                            <span className="px-1.5 py-0.5 text-[10px] text-slate-500">
                              +{product.variants.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Multi-Retailer Pricing Active</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
};
