import React, { useEffect, useState } from 'react';
import {
  ShoppingBag,
  Sparkles,
  Globe,
  ShieldCheck,
  Target,
  CreditCard,
  ExternalLink,
  Info,
} from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';
import { NavTabId } from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';

const PRESET_SHOPPING_PROMPTS = [
  { label: 'Can I afford a laptop for $750?', query: 'laptop', maxPrice: 800 },
  { label: 'Find a phone under $300', query: 'phone', maxPrice: 300 },
  { label: 'Compare noise-cancelling headphones', query: 'headphones', maxPrice: 150 },
];

export const SmartPurchasePage: React.FC<{ onNavigate: (tab: NavTabId) => void }> = ({ onNavigate }) => {
  const { balancesVisible } = useAuth();
  const [query, setQuery] = useState('laptop');
  const [maxPrice, setMaxPrice] = useState('800');
  const [includeKernel, setIncludeKernel] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');

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

  useEffect(() => {
    runEvaluation('laptop', '800', true);
  }, []);

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

  const handlePreparePayPalPayment = async (product: any) => {
    await apiRequest('/payments/prepare', {
      method: 'POST',
      body: JSON.stringify({
        recipientName: product.retailerName,
        merchantCategory: 'Electronics',
        description: `Smart Purchase: ${product.name}`,
        amountInr: product.priceInr,
      }),
    });
    onNavigate('payments');
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
      {/* Search & Evaluation Header */}
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
          <h3 className="text-base font-bold text-navy-900 dark:text-white">No products found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
            Try adjusting your search query or price ceiling above to evaluate other purchases.
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

              {/* Action Footer: Never auto-purchases! Requires user review & approval */}
              <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  No automatic purchase — explicit PIN approval required
                </span>
                <div className="flex items-center gap-2">
                  {product.supportsPayPalSandboxCheckout ? (
                    <button
                      onClick={() => handlePreparePayPalPayment(product)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-semibold transition shadow-xs"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Prepare PayPal Checkout
                    </button>
                  ) : (
                    <a
                      href={product.purchaseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold transition shadow-xs"
                    >
                      View Merchant Site <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
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
  );
};
