import React from 'react';
import { ShoppingBag, ExternalLink, ShieldCheck, Tag, Zap } from 'lucide-react';
import { formatInr } from '../lib/api';

export interface ProductItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  priceInr: number;
  currency?: string;
  imageUrl?: string;
  variants?: string[];
  availability?: string;
  retailerName: string;
  purchaseUrl?: string;
  supportsPayPalSandboxCheckout?: boolean;
}

export interface ProductRecommendationCardProps {
  product: ProductItem;
  guidanceCategory?: string;
  affordabilityScore?: number;
  impactPercent?: number;
  explanation?: string;
  onSelectAction?: (product: ProductItem) => void;
}

export const ProductRecommendationCard: React.FC<ProductRecommendationCardProps> = ({
  product,
  guidanceCategory = 'Comfortable within the current plan',
  affordabilityScore = 85,
  impactPercent,
  explanation,
  onSelectAction,
}) => {
  const getBadgeStyle = (category: string) => {
    switch (category) {
      case 'Comfortable within the current plan':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      case 'Possible with budget adjustments':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'Better postponed':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-300 dark:border-orange-800';
      default:
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800';
    }
  };

  return (
    <div className="my-3 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col sm:flex-row text-left transition hover:shadow-md">
      {/* Product Image */}
      <div className="sm:w-48 h-44 sm:h-auto bg-slate-100 dark:bg-slate-800 shrink-0 relative overflow-hidden flex items-center justify-center p-3">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover rounded-2xl"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <ShoppingBag className="w-12 h-12 text-slate-400" />
        )}

        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-slate-900/80 text-white text-[10px] font-semibold backdrop-blur-xs">
          {product.brand}
        </div>
      </div>

      {/* Content Details */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getBadgeStyle(
                guidanceCategory
              )}`}
            >
              {guidanceCategory}
            </span>

            {typeof affordabilityScore === 'number' && (
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Score: <strong className="text-navy-900 dark:text-white">{affordabilityScore}</strong>/100
              </span>
            )}
          </div>

          <h3 className="font-bold text-base text-navy-900 dark:text-white leading-snug">
            {product.name}
          </h3>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Financial Price & Merchant Bar */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="text-slate-400 text-[10px] block">Price</span>
            <span className="text-base font-extrabold text-navy-900 dark:text-white">
              {formatInr(product.priceInr)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-slate-400 text-[10px] block">Merchant</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[140px] block">
              {product.retailerName}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto pt-1 sm:pt-0">
            {product.purchaseUrl && (
              <a
                href={product.purchaseUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
              >
                <span>Store</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {onSelectAction && (
              <button
                type="button"
                onClick={() => onSelectAction(product)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
              >
                <Zap className="w-3 h-3" />
                <span>Evaluate Plan</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
