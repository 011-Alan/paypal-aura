import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  ShoppingBag,
  Sparkles,
  SlidersHorizontal,
  ExternalLink,
  Check,
  Star,
  ShieldCheck,
  Tag,
  ArrowRight,
  Layers,
  TrendingDown,
  Building2,
  X,
  RotateCw,
  ArrowUpDown,
} from 'lucide-react';
import { EcommerceProduct } from './EcommerceTypes';
import { apiRequest } from '../../lib/api';
import { Channel3ProductComparisonModal } from './Channel3ProductComparisonModal';

const SUGGESTED_SEARCHES = [
  'Wireless headphones',
  'Gaming laptops',
  'Smartphones under $500',
  'Mechanical keyboards',
  'Running shoes',
  'Office chairs',
];

interface EcommerceStorefrontProps {
  onSelectProduct: (product: EcommerceProduct) => void;
  onAddToCart: (product: EcommerceProduct, variant?: string) => Promise<void>;
  onBuyNow: (product: EcommerceProduct, variant?: string) => void;
}

export const EcommerceStorefront: React.FC<EcommerceStorefrontProps> = ({
  onSelectProduct,
  onAddToCart,
  onBuyNow,
}) => {
  const [products, setProducts] = useState<EcommerceProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc' | 'rating'>('featured');
  const searchSeqRef = useRef(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedBrand, setSelectedBrand] = useState('All');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  // Channel3 Multi-Product Comparison
  const [selectedForCompare, setSelectedForCompare] = useState<EcommerceProduct[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  const toggleCompare = (e: React.MouseEvent, product: EcommerceProduct) => {
    e.stopPropagation();
    setSelectedForCompare((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        return prev.filter((p) => p.id !== product.id);
      }
      if (prev.length >= 4) {
        alert('You can compare up to 4 products simultaneously.');
        return prev;
      }
      return [...prev, product];
    });
  };

  const fetchProducts = async (q = searchQuery, cat = selectedCategory, br = selectedBrand, price = maxPrice) => {
    const seq = ++searchSeqRef.current;
    setLoading(true);
    setError('');
    setActiveQuery(q.trim());
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (cat && cat !== 'All') params.set('category', cat);
      if (br && br !== 'All') params.set('brand', br);
      if (price && !isNaN(Number(price))) params.set('maxPrice', price);

      const res = await apiRequest<{
        success: boolean;
        products: EcommerceProduct[];
        categories: string[];
        brands: string[];
      }>(`/ecommerce/products?${params.toString()}`);

      if (seq !== searchSeqRef.current) return; // Stale response guard

      setProducts(res.products || []);
      if (res.categories?.length) {
        setCategories(['All', ...res.categories]);
      }
      if (res.brands?.length) {
        setBrands(['All', ...res.brands]);
      }
    } catch (err: any) {
      if (seq !== searchSeqRef.current) return;
      setError(err?.message || 'Failed to search products from catalog.');
    } finally {
      if (seq === searchSeqRef.current) {
        setLoading(false);
      }
    }
  };

  const sortedProducts = useMemo(() => {
    const list = [...products];
    if (sortBy === 'price_asc') {
      return list.sort((a, b) => (a.demoPriceUsd || 0) - (b.demoPriceUsd || 0));
    }
    if (sortBy === 'price_desc') {
      return list.sort((a, b) => (b.demoPriceUsd || 0) - (a.demoPriceUsd || 0));
    }
    if (sortBy === 'rating') {
      return list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
    return list;
  }, [products, sortBy]);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, selectedBrand]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts(searchQuery, selectedCategory, selectedBrand, maxPrice);
  };

  const handleQuickAdd = async (e: React.MouseEvent, product: EcommerceProduct) => {
    e.stopPropagation();
    setAddingId(product.id);
    try {
      await onAddToCart(product);
      setAddedId(product.id);
      setTimeout(() => setAddedId(null), 2000);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy-800 to-blue-950 p-6 sm:p-10 text-white shadow-xl border border-navy-700/50">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-xs font-semibold text-blue-300">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            Curated Storefront
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Curated Products &amp; Multi-Retailer Deals
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Compare real-time offers across top merchants and checkout with secure buyer protection.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-300">
            <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              PayPal Orders v2 Protected
            </span>
            <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-xs">
              <Tag className="w-4 h-4 text-blue-400" />
              Special AURA Demo Store Pricing
            </span>
          </div>
        </div>

        {/* Clear Storefront Notice */}
        <div className="relative z-10 mt-6 p-3 rounded-2xl bg-amber-500/10 border border-amber-400/20 text-xs text-amber-200 flex items-start gap-2">
          <span className="font-bold shrink-0 text-amber-300">Notice:</span>
          <span>
            Demonstration Store: Orders run securely in sandbox mode with live multi-merchant price comparison.
          </span>
        </div>
      </div>

      {/* Search & Filtering Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products (e.g. Wireless headphones, Gaming laptops, Mechanical keyboards)..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
            />
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  fetchProducts('', selectedCategory, selectedBrand, maxPrice);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                aria-label="Clear search query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="sm:col-span-3">
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max Price (USD)"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
            />
          </div>

          <div className="sm:col-span-3 flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs font-semibold transition shadow-xs flex items-center justify-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              {loading ? 'Searching...' : 'Search'}
            </button>
            {(searchQuery || maxPrice || selectedCategory !== 'All' || selectedBrand !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setMaxPrice('');
                  setSelectedCategory('All');
                  setSelectedBrand('All');
                  fetchProducts('', 'All', 'All', '');
                }}
                className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                title="Reset filters"
              >
                Reset
              </button>
            )}
          </div>
        </form>

        {/* Quick Discovery Suggestion Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px]">Popular Searches:</span>
          {SUGGESTED_SEARCHES.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setSearchQuery(chip);
                fetchProducts(chip, selectedCategory, selectedBrand, maxPrice);
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition border ${
                searchQuery.toLowerCase() === chip.toLowerCase()
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700/80 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-300'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Category Pills & Sorting Bar */}
        <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-navy-900 dark:bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Results Summary and Sort Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 text-xs">
            <div className="text-slate-500 dark:text-slate-400">
              Showing <strong className="text-navy-900 dark:text-white">{sortedProducts.length}</strong> products
              {activeQuery && (
                <span> for &ldquo;<strong className="text-blue-600 dark:text-blue-400">{activeQuery}</strong>&rdquo;</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" /> Sort by:
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold focus:outline-none"
              >
                <option value="featured">Featured Relevance</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>
          </div>

          {/* Brand Filter */}
          {brands.length > 2 && (
            <div className="flex items-center gap-2 overflow-x-auto pt-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300 shrink-0">Brand:</span>
              {brands.slice(0, 8).map((br) => (
                <button
                  key={br}
                  type="button"
                  onClick={() => setSelectedBrand(br)}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    selectedBrand === br
                      ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold'
                      : 'hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  {br}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Products Grid */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-300 font-medium">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchProducts(searchQuery, selectedCategory, selectedBrand, maxPrice)}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold transition shrink-0 flex items-center gap-1"
          >
            <RotateCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 animate-pulse"
            >
              <div className="w-full h-48 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4" />
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-md w-1/2" />
              <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-md w-1/3" />
            </div>
          ))}
        </div>
      ) : sortedProducts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-navy-900 dark:text-white">No matching products found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              We couldn&apos;t find any items matching &ldquo;{activeQuery || searchQuery}&rdquo;. Try another search term or explore one of these popular categories:
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto pt-2">
            {SUGGESTED_SEARCHES.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setSearchQuery(chip);
                  setSelectedCategory('All');
                  setSelectedBrand('All');
                  setMaxPrice('');
                  fetchProducts(chip, 'All', 'All', '');
                }}
                className="px-3 py-1.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-700 dark:text-slate-300 font-medium transition border border-slate-200 dark:border-slate-700"
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setSelectedBrand('All');
                setMaxPrice('');
                fetchProducts('', 'All', 'All', '');
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
            >
              Show All Products
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedProducts.map((product) => (
            <div
              key={product.id}
              onClick={() => onSelectProduct(product)}
              className="group bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between cursor-pointer"
            >
              <div>
                {/* Image Container with Badges */}
                <div className="relative aspect-4/3 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase bg-navy-900/80 backdrop-blur-xs text-white">
                      {product.brand}
                    </span>
                    {product.availability === 'in_stock' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/90 backdrop-blur-xs text-white">
                        In Stock
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/90 backdrop-blur-xs text-white">
                        Limited
                      </span>
                    )}
                  </div>

                  {/* Compare Toggle Button */}
                  <button
                    type="button"
                    onClick={(e) => toggleCompare(e, product)}
                    className={`absolute top-3 right-3 px-2 py-1 rounded-lg text-[10px] font-bold backdrop-blur-xs transition flex items-center gap-1 ${
                      selectedForCompare.some((p) => p.id === product.id)
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-black/60 hover:bg-black/80 text-white/90'
                    }`}
                  >
                    <Layers className="w-3 h-3" />
                    {selectedForCompare.some((p) => p.id === product.id) ? 'Selected' : 'Compare'}
                  </button>

                  {product.rating && (
                    <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <span>{product.rating}</span>
                      {product.reviewCount && <span className="text-slate-300 font-normal">({product.reviewCount})</span>}
                    </div>
                  )}
                </div>

                {/* Details Area */}
                <div className="p-5 space-y-2">
                  <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                    {product.category}
                  </div>
                  <h3 className="text-sm font-bold text-navy-900 dark:text-white line-clamp-2 leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {product.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {product.description}
                  </p>

                  {/* Pricing Comparison */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-extrabold text-navy-900 dark:text-white">
                        ${product.demoPriceUsd.toFixed(2)}
                      </span>
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                        AURA Demo Price
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 dark:text-slate-500 line-through">
                      Retail Ref: ${product.retailPriceRefUsd.toFixed(2)} ({product.retailerName})
                    </div>

                    {/* Multi-Merchant Offers Pill */}
                    {product.merchantOffers && product.merchantOffers.length > 1 && (
                      <div className="pt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <TrendingDown className="w-3 h-3" />
                        <span>
                          Available at {product.merchantOffers.length} retailers (from ${product.lowestPriceUsd || product.demoPriceUsd})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleQuickAdd(e, product)}
                  disabled={addingId === product.id}
                  className="flex-1 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs font-semibold transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  {addedId === product.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Added
                    </>
                  ) : addingId === product.id ? (
                    'Adding...'
                  ) : (
                    <>
                      <ShoppingBag className="w-3.5 h-3.5" /> Add to Cart
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectProduct(product);
                  }}
                  className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition"
                >
                  Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Channel3 Product Comparison Bar */}
      {selectedForCompare.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md border border-purple-500/40 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-bounce-subtle">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                {selectedForCompare.length} product{selectedForCompare.length > 1 ? 's' : ''} selected
              </div>
              <div className="text-[10px] text-slate-400">
                Compare multi-merchant offers & AI financial impact
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCompareModalOpen(true)}
              disabled={selectedForCompare.length < 2}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                selectedForCompare.length >= 2
                  ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-900/50'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {selectedForCompare.length < 2 ? 'Select 1 more to compare' : 'Compare Now'}
            </button>

            <button
              onClick={() => setSelectedForCompare([])}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs transition"
              title="Clear selection"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Channel3 Product Comparison Modal */}
      <Channel3ProductComparisonModal
        products={selectedForCompare}
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        onAddToCart={(product, variant) => onAddToCart(product, variant)}
      />
    </div>
  );
};
