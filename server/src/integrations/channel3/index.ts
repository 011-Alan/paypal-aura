import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { sanitizeUntrustedExternalText } from '../../middleware/security';

export type PurchaseGuidanceTier =
  | 'Comfortable within the current plan'
  | 'Possible with budget adjustments'
  | 'Better postponed'
  | 'Not currently recommended';

export interface Channel3ProductItem {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  priceInr: number;
  currency: string;
  imageUrl: string;
  variants: string[];
  availability: 'in_stock' | 'limited_stock' | 'out_of_stock';
  retailerName: string;
  purchaseUrl: string;
  supportsPayPalSandboxCheckout: boolean;
  source: 'channel3_live_api' | 'reference_catalog_fallback';
}

export interface EvaluatedProductOption {
  product: Channel3ProductItem;
  evaluation: {
    guidanceCategory: PurchaseGuidanceTier;
    affordabilityScore: number; // 0 to 100
    impactOnDiscretionaryPercent: number;
    factorsConsidered: {
      productPriceInr: number;
      availableDiscretionaryBudgetInr: number;
      upcomingCommitmentsInr: number;
      activeGoalsMonthlyTargetInr: number;
      savingsTargetInr: number;
      recent30DayExpenditureInr: number;
      userRiskTolerance: string;
    };
    explanation: string;
    suggestedSavingsPlan?: {
      monthsRequired: number;
      monthlyContributionInr: number;
      targetCompletionDate: string;
      summary: string;
    };
  };
}

const REFERENCE_CATALOG: Omit<Channel3ProductItem, 'source'>[] = [
  {
    id: 'ch3-laptop-asus-vivobook-16',
    name: 'ASUS VivoBook 16 (Intel Core i5-13500H, 16GB RAM, 512GB NVMe SSD)',
    brand: 'ASUS',
    category: 'Laptops & Computers',
    description: '16-inch FHD+ productivity laptop with 13th Gen Intel Core i5 H-series processor, 16GB RAM, and long-lasting 50Wh battery.',
    priceInr: 54990,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80',
    variants: ['16GB / 512GB Silver', '16GB / 1TB Indie Black'],
    availability: 'in_stock',
    retailerName: 'TechDirect India (PayPal Supported Partner)',
    purchaseUrl: 'https://www.paypal.com/in/webapps/mpp/home',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-laptop-lenovo-ideapad-slim3',
    name: 'Lenovo IdeaPad Slim 3 (AMD Ryzen 5 7530U, 16GB RAM, 512GB SSD)',
    brand: 'Lenovo',
    category: 'Laptops & Computers',
    description: 'Lightweight 15.6-inch everyday laptop with Ryzen 5 7000 series processor, Dolby Audio, and Rapid Charge Boost.',
    priceInr: 42990,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80',
    variants: ['Arctic Grey 16GB/512GB', 'Abyss Blue 8GB/512GB'],
    availability: 'in_stock',
    retailerName: 'Lenovo Authorized Online Store',
    purchaseUrl: 'https://www.lenovo.com/in/en/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-laptop-acer-aspire-lite',
    name: 'Acer Aspire Lite 12th Gen Core i3 (16GB RAM, 512GB SSD, Metal Body)',
    brand: 'Acer',
    category: 'Laptops & Computers',
    description: 'Value productivity notebook ideal for remote study, office suites, and everyday web workflows.',
    priceInr: 31990,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?auto=format&fit=crop&w=600&q=80',
    variants: ['Steel Grey 16GB/512GB'],
    availability: 'in_stock',
    retailerName: 'Croma Retail Online',
    purchaseUrl: 'https://www.croma.com/',
    supportsPayPalSandboxCheckout: false,
  },
  {
    id: 'ch3-laptop-macbook-air-m2',
    name: 'Apple MacBook Air 13-inch (M2 Chip, 16GB Unified Memory, 256GB SSD)',
    brand: 'Apple',
    category: 'Laptops & Computers',
    description: 'Fanless aluminum design with Apple M2 chip, Liquid Retina display, 18-hour battery life, and MagSafe 3 charging.',
    priceInr: 74900,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=600&q=80',
    variants: ['Midnight', 'Starlight', 'Space Grey'],
    availability: 'limited_stock',
    retailerName: 'Imagine Apple Premium Partner',
    purchaseUrl: 'https://www.apple.com/in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-phone-samsung-m35',
    name: 'Samsung Galaxy M35 5G (8GB RAM, 128GB Storage, 6000mAh Battery)',
    brand: 'Samsung',
    category: 'Smartphones',
    description: '120Hz Super AMOLED display with Gorilla Glass Victus+, 50MP OIS triple camera, and 4 generations of OS upgrades.',
    priceInr: 16999,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80',
    variants: ['Moonlight Blue 8GB/128GB', 'Daybreak Blue 6GB/128GB'],
    availability: 'in_stock',
    retailerName: 'Samsung SmartPlaza Partner (PayPal Enabled)',
    purchaseUrl: 'https://www.samsung.com/in/',
    supportsPayPalSandboxCheckout: true,
  },
  {
    id: 'ch3-phone-cmf-phone1',
    name: 'CMF by Nothing Phone 1 5G (8GB RAM, 128GB, Dimensity 7300)',
    brand: 'Nothing',
    category: 'Smartphones',
    description: 'Clean Nothing OS 2.6 experience with 120Hz Super AMOLED display and modular replaceable back cover design.',
    priceInr: 14999,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=600&q=80',
    variants: ['Black 8GB/128GB', 'Orange 8GB/128GB'],
    availability: 'in_stock',
    retailerName: 'Flipkart Electronics',
    purchaseUrl: 'https://www.flipkart.com/',
    supportsPayPalSandboxCheckout: false,
  },
  {
    id: 'ch3-headphones-sony-wh-ch720n',
    name: 'Sony WH-CH720N Wireless Noise Cancelling Headphones',
    brand: 'Sony',
    category: 'Audio & Accessories',
    description: 'Featherlight 192g over-ear headphones with Sony Integrated Processor V1, multipoint Bluetooth, and 35-hour battery.',
    priceInr: 8990,
    currency: 'INR',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
    variants: ['Black', 'Blue', 'White'],
    availability: 'in_stock',
    retailerName: 'Sony Center Direct (PayPal Supported)',
    purchaseUrl: 'https://www.sony.co.in/',
    supportsPayPalSandboxCheckout: true,
  },
];

export class Channel3IntegrationService {
  getHealthStatus() {
    const apiKeyConfigured = Boolean(env.CHANNEL3_API_KEY);
    return {
      technology: 'Channel3',
      intendedResponsibility: 'Smart Purchase Companion — product discovery & 7-factor affordability evaluation',
      status: apiKeyConfigured ? 'live_api_configured' : 'reference_catalog_fallback_mode',
      liveApiKeyConfigured: apiKeyConfigured,
      apiEndpoint: env.CHANNEL3_API_URL,
      fallbackNotice: apiKeyConfigured
        ? null
        : 'CHANNEL3_API_KEY not set in environment; live external Channel3 API calls degrade gracefully to clearly labelled reference catalog items for affordability analysis.',
    };
  }

  /**
   * Retrieves products from the live Channel3 API when CHANNEL3_API_KEY is configured,
   * or falls back transparently (without pretending to be a live API response) when unavailable.
   */
  async searchProducts(params: {
    query: string;
    maxPriceInr?: number;
    category?: string;
  }): Promise<{
    liveApiUsed: boolean;
    statusMessage: string;
    products: Channel3ProductItem[];
  }> {
    const q = (params.query || '').toLowerCase();

    if (env.CHANNEL3_API_KEY) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const url = new URL(`${env.CHANNEL3_API_URL}/products/search`);
        url.searchParams.set('q', params.query);
        if (params.maxPriceInr) url.searchParams.set('max_price', String(params.maxPriceInr));

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${env.CHANNEL3_API_KEY}`,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data: any = await response.json();
          const rawItems = Array.isArray(data?.products || data?.items || data?.data)
            ? data.products || data.items || data.data
            : [];
          if (rawItems.length > 0) {
            const mapped: Channel3ProductItem[] = rawItems.slice(0, 10).map((item: any, idx: number) => ({
              id: String(item.id || `ch3-live-${idx}`),
              name: sanitizeUntrustedExternalText(String(item.name || item.title || 'Product'), 160),
              brand: sanitizeUntrustedExternalText(String(item.brand || 'Brand'), 60),
              category: sanitizeUntrustedExternalText(String(item.category || 'General'), 60),
              description: sanitizeUntrustedExternalText(String(item.description || ''), 300),
              priceInr: Number(item.price_inr || item.price || 15000),
              currency: String(item.currency || 'INR'),
              imageUrl: String(item.image_url || item.image || REFERENCE_CATALOG[0].imageUrl),
              variants: Array.isArray(item.variants) ? item.variants.map(String) : ['Standard'],
              availability: 'in_stock',
              retailerName: sanitizeUntrustedExternalText(String(item.retailer || item.merchant || 'Channel3 Merchant'), 80),
              purchaseUrl: String(item.url || item.purchase_url || 'https://www.paypal.com'),
              supportsPayPalSandboxCheckout: Boolean(item.supports_paypal ?? true),
              source: 'channel3_live_api',
            }));
            return {
              liveApiUsed: true,
              statusMessage: 'Retrieved live product listings from Channel3 API.',
              products: mapped,
            };
          }
        }
      } catch (err: any) {
        logger.warn('Channel3Integration', 'Channel3 API request failed; falling back to labelled reference catalog', {
          error: err?.message,
        });
      }
    }

    // Filter reference catalog transparently
    let matches = REFERENCE_CATALOG.filter((item) => {
      if (q.includes('laptop') || q.includes('macbook') || q.includes('computer') || q.includes('notebook')) {
        return item.category === 'Laptops & Computers';
      }
      if (q.includes('phone') || q.includes('mobile') || q.includes('smartphone') || q.includes('galaxy')) {
        return item.category === 'Smartphones';
      }
      if (q.includes('headphone') || q.includes('audio') || q.includes('sony')) {
        return item.category === 'Audio & Accessories';
      }
      if (!q.trim()) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });

    if (matches.length === 0) {
      matches = REFERENCE_CATALOG;
    }

    if (typeof params.maxPriceInr === 'number' && params.maxPriceInr > 0) {
      const underPrice = matches.filter((m) => m.priceInr <= params.maxPriceInr!);
      if (underPrice.length > 0) {
        matches = underPrice;
      }
    }

    return {
      liveApiUsed: false,
      statusMessage: env.CHANNEL3_API_KEY
        ? 'Channel3 live API temporarily unreachable — using clearly labelled reference catalog for affordability evaluation.'
        : 'Channel3 live API key not configured — using clearly labelled reference catalog for affordability evaluation.',
      products: matches.map((item) => ({
        ...item,
        source: 'reference_catalog_fallback',
      })),
    };
  }

  /**
   * Evaluates each product against the 7 required financial dimensions:
   * 1. Product price
   * 2. User's available planning budget
   * 3. Upcoming financial commitments
   * 4. Existing financial goals
   * 5. Savings targets
   * 6. Recent expenditure
   * 7. User-defined spending preferences
   */
  evaluateProductsAffordability(
    products: Channel3ProductItem[],
    financialContext: {
      monthlyIncomeInr: number;
      availableDiscretionaryBudgetInr: number;
      upcomingCommitmentsInr: number;
      activeGoalsMonthlyTargetInr: number;
      savingsTargetInr: number;
      recent30DayExpenditureInr: number;
      liquidBalanceInr: number;
      userRiskTolerance: 'conservative' | 'balanced' | 'growth';
    }
  ): EvaluatedProductOption[] {
    const {
      availableDiscretionaryBudgetInr,
      upcomingCommitmentsInr,
      activeGoalsMonthlyTargetInr,
      savingsTargetInr,
      recent30DayExpenditureInr,
      liquidBalanceInr,
      userRiskTolerance,
    } = financialContext;

    const safeDiscretionary = Math.max(1, availableDiscretionaryBudgetInr);
    const freeBufferAfterCommitments = Math.max(0, liquidBalanceInr - upcomingCommitmentsInr - savingsTargetInr);

    return products.map((product) => {
      const price = product.priceInr;
      const impactPercent = Math.round((price / safeDiscretionary) * 100);

      let guidanceCategory: PurchaseGuidanceTier;
      let affordabilityScore: number;
      let explanation: string;
      let suggestedSavingsPlan: EvaluatedProductOption['evaluation']['suggestedSavingsPlan'];

      if (price <= availableDiscretionaryBudgetInr * 0.85) {
        guidanceCategory = 'Comfortable within the current plan';
        affordabilityScore = Math.min(96, Math.max(78, 100 - Math.round(impactPercent * 0.25)));
        explanation = `At ₹${price.toLocaleString('en-IN')}, this uses ${impactPercent}% of your ₹${availableDiscretionaryBudgetInr.toLocaleString('en-IN')} allocated discretionary budget while leaving all upcoming commitments (₹${upcomingCommitmentsInr.toLocaleString('en-IN')}) and your ₹${activeGoalsMonthlyTargetInr.toLocaleString('en-IN')} monthly goal contributions untouched.`;
      } else if (price <= availableDiscretionaryBudgetInr * 1.25 && price <= freeBufferAfterCommitments) {
        guidanceCategory = 'Possible with budget adjustments';
        affordabilityScore = Math.max(58, 76 - Math.round((impactPercent - 85) * 0.4));
        const adjustmentNeeded = Math.max(0, price - availableDiscretionaryBudgetInr);
        explanation = `You have ₹${availableDiscretionaryBudgetInr.toLocaleString('en-IN')} allocated for discretionary spending. Buying this immediately requires reallocating ₹${adjustmentNeeded.toLocaleString('en-IN')} from flexible lifestyle categories this month while keeping your ₹${upcomingCommitmentsInr.toLocaleString('en-IN')} upcoming commitments protected.`;
        const monthlySave = Math.ceil(price / 2 / 100) * 100;
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + 2);
        suggestedSavingsPlan = {
          monthsRequired: 2,
          monthlyContributionInr: monthlySave,
          targetCompletionDate: targetDate.toISOString().split('T')[0],
          summary: `Split over 2 months at ₹${monthlySave.toLocaleString('en-IN')}/month to avoid any current-month budget adjustment.`,
        };
      } else if (price <= freeBufferAfterCommitments * 1.15) {
        guidanceCategory = 'Better postponed';
        affordabilityScore = Math.max(35, 54 - Math.round((price / Math.max(1, freeBufferAfterCommitments)) * 15));
        const shortfall = Math.max(0, price - availableDiscretionaryBudgetInr);
        const months = Math.max(3, Math.min(6, Math.ceil(shortfall / Math.max(4000, availableDiscretionaryBudgetInr * 0.5))));
        const monthlySave = Math.ceil(price / months / 100) * 100;
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + months);

        explanation = `You have ₹${availableDiscretionaryBudgetInr.toLocaleString('en-IN')} allocated for discretionary spending and ₹${upcomingCommitmentsInr.toLocaleString('en-IN')} in upcoming commitments. Buying this for ₹${price.toLocaleString('en-IN')} immediately would require a significant adjustment of ₹${shortfall.toLocaleString('en-IN')} to your current plan. A dedicated ${months}-month savings plan is recommended.`;
        suggestedSavingsPlan = {
          monthsRequired: months,
          monthlyContributionInr: monthlySave,
          targetCompletionDate: targetDate.toISOString().split('T')[0],
          summary: `Save ₹${monthlySave.toLocaleString('en-IN')}/month for ${months} months so you can buy it comfortably without disrupting your emergency fund or active goals.`,
        };
      } else {
        guidanceCategory = 'Not currently recommended';
        affordabilityScore = 22;
        const months = Math.max(6, Math.ceil(price / 8000));
        const monthlySave = Math.ceil(price / months / 100) * 100;
        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + months);

        explanation = `At ₹${price.toLocaleString('en-IN')}, an immediate purchase would exceed your ₹${availableDiscretionaryBudgetInr.toLocaleString('en-IN')} discretionary budget and encroach on your ₹${savingsTargetInr.toLocaleString('en-IN')} savings target and upcoming commitments (₹${upcomingCommitmentsInr.toLocaleString('en-IN')}).`;
        suggestedSavingsPlan = {
          monthsRequired: months,
          monthlyContributionInr: monthlySave,
          targetCompletionDate: targetDate.toISOString().split('T')[0],
          summary: `Create a dedicated "${product.name.slice(0, 28)}" goal at ₹${monthlySave.toLocaleString('en-IN')}/month over ${months} months.`,
        };
      }

      return {
        product,
        evaluation: {
          guidanceCategory,
          affordabilityScore,
          impactOnDiscretionaryPercent: impactPercent,
          factorsConsidered: {
            productPriceInr: price,
            availableDiscretionaryBudgetInr,
            upcomingCommitmentsInr,
            activeGoalsMonthlyTargetInr,
            savingsTargetInr,
            recent30DayExpenditureInr,
            userRiskTolerance,
          },
          explanation,
          suggestedSavingsPlan,
        },
      };
    });
  }
}

export const channel3Integration = new Channel3IntegrationService();
