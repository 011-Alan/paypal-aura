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
  { label: 'Can I afford a laptop for ₹55,000?', query: 'laptop', maxPrice: 60000 },
  { label: 'Find a phone under ₹20,000', query: 'phone', maxPrice: 20000 },
  { label: 'Compare noise-cancelling headphones', query: 'headphones', maxPrice: 15000 },
];

export const SmartPurchasePage: React.FC<{ onNavigate: (tab: NavTabId) => void }> = ({ onNavigate }) => {
  const { balancesVisible } = useAuth();
  const [query, setQuery] = useState('laptop');
  const [maxPrice, setMaxPrice] = useState('60000');
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
    runEvaluation('laptop', '60000', true);
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
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (tier === 'Possible with budget adjustments') {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (tier === 'Better postponed') {
      return 'bg-amber-50 text-amber-800 border-amber-200';
    }
    return 'bg-rose-50 text-rose-700 border-rose-200';
  };

  return (
    <div className="space-y-6">
      {/* Search & Evaluation Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
              <ShoppingBag className="w-3.5 h-3.5" />
              Channel3 Smart Purchase Companion + KERNEL Assisted Research
            </span>
            <h2 className="text-xl font-bold text-navy-900 mt-2">
              Intelligent Shopping &amp; 7-Factor Affordability Evaluation
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
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
            className="sm:col-span-2 px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
          />
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Target Budget Ceiling (₹)"
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
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
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-xs text-slate-700 font-medium"
              >
                “{p.label}”
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={includeKernel}
              onChange={(e) => setIncludeKernel(e.target.checked)}
              className="rounded border-slate-300"
            />
            <Globe className="w-3.5 h-3.5 text-blue-600" />
            Include KERNEL Assisted Research
          </label>
        </div>
      </div>

      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-semibold">
          {actionMessage}
        </div>
      )}

      {/* Financial Context Strip */}
      {result?.financialContextSummary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              Available Discretionary Budget
              <Tooltip content="Current month discretionary allowance available after all essential commitments are ringfenced." />
            </div>
            <div className="text-xl font-bold text-blue-600 mt-2">
              {formatInr(result.financialContextSummary.availableDiscretionaryBudgetInr, !balancesVisible)}
            </div>
          </div>
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              Upcoming Commitments
              <Tooltip content="Confirmed bills and subscriptions that must be preserved." />
            </div>
            <div className="text-xl font-bold text-navy-900 mt-2">
              {formatInr(result.financialContextSummary.upcomingCommitmentsInr, !balancesVisible)}
            </div>
          </div>
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              Monthly Goal Targets
              <Tooltip content="Active monthly contributions toward your defined savings goals." />
            </div>
            <div className="text-xl font-bold text-emerald-600 mt-2">
              {formatInr(result.financialContextSummary.activeGoalsMonthlyTargetInr, !balancesVisible)}
            </div>
          </div>
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              Channel3 Discovery Mode
              <Tooltip content="Real-time product discovery catalog powered by Channel3." />
            </div>
            <div className="text-xs font-semibold text-navy-900 mt-2 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              {result.liveChannel3ApiUsed ? 'Channel3 Live API' : 'Verified Reference Catalog'}
            </div>
          </div>
        </div>
      )}

      {/* Product Cards with 7-Factor Affordability Evaluation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(result?.evaluatedProducts || []).map(({ product, evaluation }: any) => (
          <div
            key={product.id}
            className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="p-5 flex flex-col sm:flex-row gap-4 border-b border-slate-100">
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full sm:w-32 h-28 object-cover rounded-xl bg-slate-100 shrink-0"
                />
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
                  <h3 className="text-base font-bold text-navy-900">{product.name}</h3>
                  <p className="text-xs text-slate-600 line-clamp-2">{product.description}</p>
                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-xl font-bold text-navy-900">{formatInr(product.priceInr, !balancesVisible)}</span>
                    <span className="text-xs text-slate-500">Retailer: {product.retailerName}</span>
                  </div>
                </div>
              </div>

              {/* AURA Evaluation Box */}
              <div className="p-5 bg-slate-50/60 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-navy-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    AURA Affordability Assessment (Score: {evaluation.affordabilityScore}/100)
                  </span>
                  <span className="text-slate-500">
                    Uses {evaluation.impactOnDiscretionaryPercent}% of monthly discretionary cap
                  </span>
                </div>
                <p className="text-slate-700 leading-relaxed">{evaluation.explanation}</p>

                {evaluation.suggestedSavingsPlan && (
                  <div className="p-3 rounded-xl bg-blue-50/80 border border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="font-bold text-blue-800">Recommended Savings Plan</div>
                      <div className="text-slate-700">{evaluation.suggestedSavingsPlan.summary}</div>
                    </div>
                    <button
                      onClick={() => handleCreateSavingsGoal(product, evaluation.suggestedSavingsPlan)}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    >
                      <Target className="w-3.5 h-3.5" /> Start Savings Plan
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Action Footer: Never auto-purchases! Requires user review & approval */}
            <div className="p-4 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-500 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                No automatic purchase — explicit PIN approval required
              </span>
              <div className="flex items-center gap-2">
                {product.supportsPayPalSandboxCheckout ? (
                  <button
                    onClick={() => handlePreparePayPalPayment(product)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white font-semibold"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Prepare PayPal Checkout
                  </button>
                ) : (
                  <a
                    href={product.purchaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
                  >
                    View Merchant Site <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* KERNEL Assisted Research Results */}
      {result?.kernelResearch && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-600" />
                AURA Assisted Research (KERNEL Controlled Browser Module)
              </h3>
              <p className="text-xs text-slate-500">{result.kernelResearch.statusNotice}</p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
              {result.kernelResearch.executionMode}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(result.kernelResearch.structuredFindings || []).map((finding: any, idx: number) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="font-bold text-navy-900">{finding.title}</div>
                <p className="text-slate-600 leading-relaxed">{finding.sanitizedSummary}</p>
                <ul className="space-y-1 text-slate-700 list-disc list-inside">
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
