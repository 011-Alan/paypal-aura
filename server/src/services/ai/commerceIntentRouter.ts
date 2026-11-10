import { ICommerceContext, CommerceContextProduct } from '../../models';
import { logger } from '../../config/logger';

export type CommerceIntentType =
  | 'COMMERCE_NAVIGATE_SEARCH'
  | 'CURRENCY_CONVERSION'
  | 'PRODUCT_RECOMMENDATION'
  | 'FINANCIAL_AFFORDABILITY'
  | 'PRODUCT_COMPARISON'
  | 'ALTERNATIVE_SEARCH'
  | 'PRODUCT_EVALUATION_FOLLOWUP'
  | 'PRODUCT_DISCOVERY'
  | 'GENERAL_NON_COMMERCE';

export interface ClassifiedCommerceIntent {
  intent: CommerceIntentType;
  confidence: number;
  targetProduct?: CommerceContextProduct;
  targetProductB?: CommerceContextProduct;
  searchQuery?: string;
  targetCurrency?: string;
  comparisonQuery?: string;
  featureRequested?: string;
  reason: string;
}

export class CommerceIntentRouter {
  /**
   * Analyzes the user's prompt in the context of recent turns and active commerceContext.
   */
  public classifyIntent(
    prompt: string,
    commerceContext?: ICommerceContext | null,
    conversationHistory?: { role: string; content: string }[]
  ): ClassifiedCommerceIntent {
    const raw = prompt.trim();
    const pLower = raw.toLowerCase();

    const hasContextProducts = Boolean(commerceContext?.products && commerceContext.products.length > 0);
    const products = commerceContext?.products || [];
    const recommendedProduct = products.find((p) => p.id === commerceContext?.recommendedProductId) || products[0];

    // 1. Explicit Navigate to Commerce and Search
    // e.g. "Search Vivobook 14 in AURA Commerce", "Open AURA Commerce and find laptops"
    if (
      (pLower.includes('in aura commerce') || pLower.includes('in commerce') || pLower.includes('to commerce') || pLower.includes('open commerce') || pLower.includes('open store')) &&
      (pLower.includes('search') || pLower.includes('find') || pLower.includes('look for') || pLower.includes('show'))
    ) {
      const cleanSearchQuery = raw
        .replace(/search/i, '')
        .replace(/in aura commerce/i, '')
        .replace(/in commerce/i, '')
        .replace(/on commerce/i, '')
        .replace(/open aura commerce and (search|find)/i, '')
        .replace(/go to commerce and (search|find)/i, '')
        .replace(/for/i, '')
        .trim();

      return {
        intent: 'COMMERCE_NAVIGATE_SEARCH',
        confidence: 0.95,
        searchQuery: cleanSearchQuery || commerceContext?.lastSearchQuery || 'laptops',
        reason: 'User explicitly requested navigation to AURA Commerce and search execution.',
      };
    }

    // 2. Currency Conversion Follow-Up
    // e.g. "Give me the price in USD", "What is that in dollars", "Convert to USD", "Price in USD"
    const isCurrencyQuery =
      /\b(usd|dollars?|euros?|eur|gbp|pounds?|inr|rupees?|currency|exchange\s*rate)\b/i.test(pLower) &&
      (/\b(price|cost|how\s*much|give\s*me|convert|show\s*me|tell\s*me|in\s*usd|in\s*dollars?)\b/i.test(pLower) || pLower.length < 25);

    if (isCurrencyQuery && hasContextProducts) {
      const targetCurrency = pLower.includes('eur') || pLower.includes('euro') ? 'EUR' : pLower.includes('gbp') || pLower.includes('pound') ? 'GBP' : 'USD';
      return {
        intent: 'CURRENCY_CONVERSION',
        confidence: 0.95,
        targetProduct: recommendedProduct,
        targetCurrency,
        reason: 'User asked for price conversion of previously retrieved product in context.',
      };
    }

    // 3. Product Comparison Follow-Up
    // e.g. "Compare it with the ASUS you recommended", "Compare the first two", "Compare these"
    const isComparison = /\b(compare|comparison|versus|vs\.?|difference\s*between)\b/i.test(pLower);
    if (isComparison && hasContextProducts) {
      // Check if comparing with previously recommended product
      let productA = recommendedProduct;
      let productB = products.length > 1 ? products[1] : undefined;

      // Check if alternative product was recently retrieved
      if (commerceContext?.alternativeProducts && commerceContext.alternativeProducts.length > 0) {
        productB = commerceContext.alternativeProducts[0];
      }

      return {
        intent: 'PRODUCT_COMPARISON',
        confidence: 0.92,
        targetProduct: productA,
        targetProductB: productB,
        reason: 'User requested a side-by-side comparison involving products in context.',
      };
    }

    // 4. Product Recommendation Follow-Up
    // e.g. "Which one would you recommend?", "Can you recommend one of these?", "Which laptop is best?"
    const isRecommendation =
      /\b(recommend|which\s*(?:one|is\s*better|is\s*best|should\s*i\s*buy|do\s*you\s*suggest)|pick\s*one|best\s*option)\b/i.test(pLower) &&
      !/\b(lenovo|dell|hp|acer|apple|alternative|cheaper)\b/i.test(pLower);

    if (isRecommendation && hasContextProducts) {
      return {
        intent: 'PRODUCT_RECOMMENDATION',
        confidence: 0.94,
        targetProduct: recommendedProduct,
        reason: 'User asked for a reasoned recommendation among previously retrieved products in context.',
      };
    }

    // 5. Financial Affordability Follow-Up
    // e.g. "Can I afford this?", "Can I afford it?", "Do you think I can buy it?", "Is it in my budget?"
    const isAffordability =
      /\b(can\s*i\s*afford\s*(?:it|this|that|one)|can\s*i\s*buy\s*(?:it|this|that)|affordability|is\s*(?:it|this)\s*(?:within|in)\s*my\s*budget|fit\s*my\s*budget)\b/i.test(pLower);

    if (isAffordability && hasContextProducts) {
      return {
        intent: 'FINANCIAL_AFFORDABILITY',
        confidence: 0.95,
        targetProduct: recommendedProduct,
        reason: 'User asked whether they can afford the active product in context.',
      };
    }

    // 6. Alternative / Cheaper Product Search
    // e.g. "Find me a cheaper Lenovo alternative", "Show me cheaper options", "Any Lenovo alternatives?"
    const isAlternative =
      /\b(cheaper|alternative|alternatives|other\s*brands?|budget\s*option|lower\s*price)\b/i.test(pLower) ||
      (/\b(lenovo|acer|dell|hp|asus|apple|samsung)\b/i.test(pLower) && /\b(alternative|cheaper|instead|other)\b/i.test(pLower));

    if (isAlternative) {
      // Extract brand or term
      let brand = '';
      if (pLower.includes('lenovo')) brand = 'Lenovo';
      else if (pLower.includes('acer')) brand = 'Acer';
      else if (pLower.includes('asus')) brand = 'ASUS';
      else if (pLower.includes('dell')) brand = 'Dell';
      else if (pLower.includes('hp')) brand = 'HP';

      const category = commerceContext?.products?.[0]?.category || 'Laptops & Computers';
      const cleanSearch = `${brand} ${category.includes('Laptop') ? 'laptop' : ''}`.trim() || 'cheaper alternative';

      return {
        intent: 'ALTERNATIVE_SEARCH',
        confidence: 0.92,
        searchQuery: cleanSearch,
        targetProduct: recommendedProduct,
        reason: 'User requested alternative or cheaper product search while preserving current product context.',
      };
    }

    // 7. Product-Specific Feature Inquiry
    // e.g. "What about its battery life?", "Does it have backlit keyboard?", "How much RAM does it have?"
    const isFeatureQuery =
      /\b(battery|backup|charge|ram|memory|storage|ssd|screen|display|resolution|weight|gpu|graphics|warranty|retailer)\b/i.test(pLower) &&
      (/\b(its|it|the\s*laptop|the\s*asus|the\s*product|this\s*one)\b/i.test(pLower) || pLower.length < 40);

    if (isFeatureQuery && hasContextProducts) {
      return {
        intent: 'PRODUCT_EVALUATION_FOLLOWUP',
        confidence: 0.9,
        targetProduct: recommendedProduct,
        featureRequested: pLower,
        reason: 'User asked a specific hardware/spec question regarding active product in context.',
      };
    }

    // 8. Explicit Product Discovery / New Search
    // e.g. "I want to buy an ASUS Vivobook 14", "Find me running shoes", "Search for laptops"
    const isNewSearch =
      /\b(i\s*want\s*to\s*buy|find\s*me|search\s*for|show\s*me|looking\s*for|need\s*a|buy\s*a)\b/i.test(pLower) ||
      /\b(vivobook|laptop|macbook|headphones|sneakers|shoes|keyboard|bottle)\b/i.test(pLower);

    if (isNewSearch) {
      return {
        intent: 'PRODUCT_DISCOVERY',
        confidence: 0.88,
        searchQuery: raw,
        reason: 'User initiated a product discovery query.',
      };
    }

    // 9. General non-commerce
    return {
      intent: 'GENERAL_NON_COMMERCE',
      confidence: 0.7,
      reason: 'Prompt does not match a commerce workflow.',
    };
  }
}

export const commerceIntentRouter = new CommerceIntentRouter();
