import { ICommerceContext, CommerceContextProduct } from '../../models';
import { ApplicationRouteDefinition, applicationRouteRegistry } from '../navigation/applicationRouteRegistry';

export type ApplicationIntentDomain =
  | 'COMMERCE'
  | 'FINANCIAL_GOALS'
  | 'BUDGETS_AND_BILLS'
  | 'TRANSACTIONS_AND_SPENDING'
  | 'CALENDAR_AND_SCHEDULING'
  | 'APPLICATION_NAVIGATION'
  | 'APPLICATION_CONTROLS'
  | 'BUSINESS_OPERATIONS'
  | 'GENERAL_CONVERSATION_OR_CONCEPT';

export type ClassifiedIntentType =
  // Commerce
  | 'COMMERCE_PRODUCT_DISCOVERY'
  | 'COMMERCE_PRODUCT_FILTERING'
  | 'COMMERCE_PRODUCT_COMPARISON'
  | 'COMMERCE_PRODUCT_RECOMMENDATION'
  | 'COMMERCE_AFFORDABILITY_EVALUATION'
  | 'COMMERCE_PRODUCT_DETAILS'
  | 'COMMERCE_PRODUCT_SELECTION'
  | 'COMMERCE_CHECKOUT_PREPARATION'
  | 'COMMERCE_PAYMENT_APPROVAL'
  | 'COMMERCE_ORDER_TRACKING'
  // Financial Goals
  | 'GOAL_CREATION'
  | 'GOAL_MODIFICATION'
  | 'GOAL_DELETION'
  | 'GOAL_INQUIRY'
  // Budgets & Commitments
  | 'BUDGET_CREATION'
  | 'BUDGET_MODIFICATION'
  | 'BILL_INQUIRY'
  | 'BILL_CREATION'
  | 'SUBSCRIPTION_MANAGEMENT'
  // Spending & Transactions
  | 'TRANSACTION_ANALYSIS'
  | 'TRANSACTION_FILTERING'
  | 'TRANSACTION_SORTING'
  | 'LOAN_SAVINGS_CALCULATION'
  // Calendar & Scheduling
  | 'REMINDER_CREATION'
  | 'RECURRING_SCHEDULE'
  | 'CALENDAR_INQUIRY'
  // Application Controls
  | 'APP_NAVIGATION'
  | 'APP_THEME_CHANGE'
  | 'APP_SIDEBAR_TOGGLE'
  | 'APP_LOGOUT'
  // Business
  | 'BUSINESS_ANALYTICS'
  | 'BUSINESS_ORDERS'
  // General / Concept
  | 'CONCEPT_EXPLANATION'
  | 'GENERAL_CONVERSATION';

export interface ExtractedShoppingRequirements {
  productQuery?: string;
  category?: string;
  brand?: string[];
  maxPrice?: number;
  minPrice?: number;
  minRamGb?: number;
  useCase?: string;
  features?: string[];
}

export interface ExtractedGoalRequirements {
  title?: string;
  targetAmount?: number;
  durationMonths?: number;
  deadline?: Date;
  monthlyContribution?: number;
}

export interface ClassifiedApplicationIntent {
  domain: ApplicationIntentDomain;
  intent: ClassifiedIntentType;
  confidence: number;
  targetRoute?: ApplicationRouteDefinition | null;
  shouldNavigate: boolean;
  navTarget?: string;
  extractedRequirements?: ExtractedShoppingRequirements;
  goalRequirements?: ExtractedGoalRequirements;
  targetProduct?: CommerceContextProduct;
  comparisonProducts?: CommerceContextProduct[];
  selectedProductIndex?: number;
  actionDetails?: Record<string, any>;
  reason: string;
}

export class ApplicationIntentClassifier {
  public classify(
    prompt: string,
    context?: {
      commerceContext?: ICommerceContext | null;
      conversationHistory?: { role: string; content: string }[];
      isMerchantAuthorized?: boolean;
    }
  ): ClassifiedApplicationIntent {
    const raw = prompt.trim();
    const pLower = raw.toLowerCase();
    const commCtx = context?.commerceContext;
    const hasContextProducts = Boolean(commCtx?.products && commCtx.products.length > 0);
    const products = commCtx?.products || [];

    // =========================================================================
    // 1. CONCEPT EXPLANATION & EDUCATIONAL QUESTIONS (DO NOT NAVIGATE!)
    // e.g. "What is a financial goal?", "What does APR mean?", "Explain how recurring subscriptions affect my finances"
    // =========================================================================
    const isEducationalQuestion =
      /^(what is|what are|explain|how does|how do|define|tell me about the concept of|what does .+ mean)/i.test(raw) &&
      !/\b(my balance|my accounts?|my transactions?|my bills?|my goals?|my expenses?)\b/i.test(pLower);

    if (isEducationalQuestion) {
      return {
        domain: 'GENERAL_CONVERSATION_OR_CONCEPT',
        intent: 'CONCEPT_EXPLANATION',
        confidence: 0.96,
        shouldNavigate: false,
        reason: 'User is asking a conceptual or informational question that requires a direct explanation without navigation.',
      };
    }

    // =========================================================================
    // 2. APPLICATION CONTROLS & SECURITY
    // =========================================================================
    if (/\b(log\s*me\s*out|logout|sign\s*out|end\s*session)\b/i.test(pLower)) {
      return {
        domain: 'APPLICATION_CONTROLS',
        intent: 'APP_LOGOUT',
        confidence: 0.99,
        shouldNavigate: false,
        reason: 'User requested explicit account logout.',
      };
    }

    if (/\b(dark\s*mode|night\s*mode|switch\s*to\s*dark)\b/i.test(pLower)) {
      return {
        domain: 'APPLICATION_CONTROLS',
        intent: 'APP_THEME_CHANGE',
        confidence: 0.98,
        shouldNavigate: false,
        actionDetails: { theme: 'dark' },
        reason: 'User requested dark theme.',
      };
    }

    if (/\b(light\s*mode|day\s*mode|switch\s*to\s*light)\b/i.test(pLower)) {
      return {
        domain: 'APPLICATION_CONTROLS',
        intent: 'APP_THEME_CHANGE',
        confidence: 0.98,
        shouldNavigate: false,
        actionDetails: { theme: 'light' },
        reason: 'User requested light theme.',
      };
    }

    if (/\b(collapse\s*(?:the\s*)?sidebar|hide\s*(?:the\s*)?sidebar|expand\s*(?:the\s*)?sidebar|toggle\s*(?:the\s*)?sidebar)\b/i.test(pLower)) {
      const isCollapse = pLower.includes('collapse') || pLower.includes('hide');
      return {
        domain: 'APPLICATION_CONTROLS',
        intent: 'APP_SIDEBAR_TOGGLE',
        confidence: 0.95,
        shouldNavigate: false,
        actionDetails: { collapsed: isCollapse },
        reason: 'User requested sidebar state modification.',
      };
    }

    // =========================================================================
    // 2b. COMPOUND NAVIGATION + OPERATION COMMANDS (EXECUTION, NOT NAVIGATION LINKS!)
    // e.g. "Take me to Commerce and search for ASUS Vivobook 14."
    // e.g. "Open Transactions and show purchases above ₹5,000."
    // e.g. "Open Calendar and schedule a monthly savings review."
    // e.g. "Open Financial Goals and create a goal to save ₹50,000 in six months."
    // =========================================================================
    const compoundNavMatch = raw.match(
      /^(?:take\s*me\s*to|go\s*to|open|navigate\s*to)\s+(?:the\s*)?(?:aura\s*)?(commerce|store|shop|smart\s*purchases?|transactions?|spending|goals?|financial\s*goals?|commitments?|bills?|calendar|scheduler|settings|overview)\s+(?:and\s+|,?\s*then\s+)(.+)$/i
    );

    if (compoundNavMatch) {
      const pageKey = compoundNavMatch[1].toLowerCase();
      const actionPart = compoundNavMatch[2].trim();

      // Commerce Search
      if (
        (pageKey.includes('commerce') || pageKey.includes('store') || pageKey.includes('shop') || pageKey.includes('purchase')) &&
        /\b(search|find|buy|look\s*for|vivobook|laptop|headphone|shoes?|sneakers?)\b/i.test(actionPart)
      ) {
        let cleanQuery = actionPart
          .replace(/^(?:search\s*(?:for\s*)?|find\s*(?:me\s*)?(?:a\s*)?|look\s*for\s*(?:a\s*)?|buy\s*(?:a\s*)?)\s*/i, '')
          .replace(/\s*(?:in\s*aura\s*commerce|in\s*commerce|online|store)\s*$/i, '')
          .replace(/[.!?,;]+$/, '')
          .trim();
        if (!cleanQuery) cleanQuery = 'laptop';

        return {
          domain: 'COMMERCE',
          intent: 'COMMERCE_PRODUCT_DISCOVERY',
          confidence: 0.98,
          targetRoute: applicationRouteRegistry.getRouteById('commerce'),
          shouldNavigate: true,
          navTarget: 'smart-purchases',
          extractedRequirements: { productQuery: cleanQuery },
          reason: `User requested navigation to Commerce with immediate search for "${cleanQuery}".`,
        };
      }

      // Transactions: Filtering / Purchases above
      if (
        (pageKey.includes('transaction') || pageKey.includes('spending')) &&
        /\b(show|filter|find|purchases?|expenses?|above|over|greater)\b/i.test(actionPart)
      ) {
        const amountMatch = actionPart.match(/(?:above|over|greater\s*than|>)\s*(?:₹|\$|rs\.?|inr)?\s*([\d,]+)/i);
        const minAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : 5000;

        return {
          domain: 'TRANSACTIONS_AND_SPENDING',
          intent: 'TRANSACTION_FILTERING',
          confidence: 0.98,
          targetRoute: applicationRouteRegistry.getRouteById('transactions'),
          shouldNavigate: true,
          navTarget: 'transactions',
          actionDetails: {
            minAmount,
            filterModel: {
              amount: {
                filterType: 'number',
                type: 'greaterThan',
                filter: minAmount,
              },
            },
          },
          reason: `User requested navigation to Transactions and filtering purchases above ₹${minAmount.toLocaleString('en-IN')}.`,
        };
      }

      // Calendar: Recurring Schedule or Reminder
      if (
        (pageKey.includes('calendar') || pageKey.includes('scheduler')) &&
        /\b(schedule|remind|review|savings\s*review|reminder)\b/i.test(actionPart)
      ) {
        const isSavingsReview = /savings\s*review/i.test(actionPart);
        return {
          domain: 'CALENDAR_AND_SCHEDULING',
          intent: 'RECURRING_SCHEDULE',
          confidence: 0.98,
          targetRoute: applicationRouteRegistry.getRouteById('calendar'),
          shouldNavigate: true,
          navTarget: 'calendar',
          actionDetails: {
            title: isSavingsReview ? 'Monthly Savings Review' : 'Scheduled Review',
            recurrence: 'monthly',
          },
          reason: `User requested navigation to Calendar and scheduling a recurring review.`,
        };
      }

      // Goals: Create Goal
      if (
        pageKey.includes('goal') &&
        /\b(create|set|make|save)\b/i.test(actionPart)
      ) {
        const amountMatch = actionPart.match(/(?:save|goal\s*(?:for|of)?)\s*(?:₹|\$|rs\.?|inr)?\s*([\d,]+)/i);
        const monthsMatch = actionPart.match(/(?:in|over|within)\s*(\d{1,2}|six|twelve|three)\s*months?/i);
        const targetAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : 50000;
        let durationMonths = 12;
        if (monthsMatch) {
          const mStr = monthsMatch[1].toLowerCase();
          durationMonths = mStr === 'six' ? 6 : mStr === 'three' ? 3 : mStr === 'twelve' ? 12 : parseInt(mStr, 10);
        }

        return {
          domain: 'FINANCIAL_GOALS',
          intent: 'GOAL_CREATION',
          confidence: 0.98,
          targetRoute: applicationRouteRegistry.getRouteById('goals'),
          shouldNavigate: true,
          navTarget: 'goals',
          goalRequirements: {
            title: 'Savings Goal',
            targetAmount,
            durationMonths,
            monthlyContribution: Math.round(targetAmount / durationMonths),
          },
          reason: `User requested navigation to Financial Goals and creation of a ₹${targetAmount.toLocaleString('en-IN')} goal.`,
        };
      }
    }

    // =========================================================================
    // 3. COMMERCE WORKFLOW: PAYMENT APPROVAL ("Proceed", "Approve purchase")
    // =========================================================================
    if (
      /^(proceed|confirm payment|approve purchase|pay now|continue to pay|complete payment)$/i.test(pLower) ||
      (/\bproceed\b/i.test(pLower) && pLower.length < 20)
    ) {
      return {
        domain: 'COMMERCE',
        intent: 'COMMERCE_PAYMENT_APPROVAL',
        confidence: 0.95,
        targetRoute: applicationRouteRegistry.getRouteById('commerce'),
        shouldNavigate: true,
        navTarget: 'smart-purchases',
        targetProduct: commCtx?.products?.find((p) => p.id === commCtx.selectedProductId) || products[0],
        reason: 'User explicitly confirmed purchase authorization to initiate PayPal approval flow.',
      };
    }

    // =========================================================================
    // 4. COMMERCE WORKFLOW: PRODUCT SELECTION & CHECKOUT PREPARATION
    // e.g. "I'll buy this one", "I'll buy the second one", "Buy the ASUS", "Prepare checkout"
    // =========================================================================
    const isSelectionOrCheckout =
      /\b(i'll\s*buy|i\s*will\s*buy|buy\s*(?:this|the|it)|checkout|prepare\s*checkout|purchase\s*(?:this|the|it)|take\s*the\s*(?:first|second|third|one))\b/i.test(pLower);

    if (isSelectionOrCheckout && hasContextProducts) {
      let selectedIdx = 0;
      if (/\b(second|2nd|#2|2)\b/i.test(pLower)) selectedIdx = 1;
      else if (/\b(third|3rd|#3|3)\b/i.test(pLower)) selectedIdx = 2;
      else if (/\b(fourth|4th|#4|4)\b/i.test(pLower)) selectedIdx = 3;

      const chosenProduct = products[selectedIdx] || products[0];

      return {
        domain: 'COMMERCE',
        intent: 'COMMERCE_CHECKOUT_PREPARATION',
        confidence: 0.95,
        targetRoute: applicationRouteRegistry.getRouteById('commerce'),
        shouldNavigate: true,
        navTarget: 'smart-purchases',
        targetProduct: chosenProduct,
        selectedProductIndex: selectedIdx,
        reason: `User selected product #${selectedIdx + 1} (${chosenProduct.name}) for checkout preparation.`,
      };
    }

    // =========================================================================
    // 5. COMMERCE WORKFLOW: FINANCIAL AFFORDABILITY
    // e.g. "Can I afford the second one?", "Can I afford this laptop?", "Can I afford it?"
    // =========================================================================
    const isAffordability =
      /\b(can\s*i\s*afford|affordability|is\s*(?:this|it)\s*(?:within|in)\s*my\s*budget|fit\s*my\s*budget)\b/i.test(pLower);

    if (isAffordability) {
      let targetProd = products[0];
      let selectedIdx = 0;
      if (hasContextProducts) {
        if (/\b(second|2nd|#2|2)\b/i.test(pLower)) {
          targetProd = products[1] || products[0];
          selectedIdx = 1;
        } else if (/\b(third|3rd|#3|3)\b/i.test(pLower)) {
          targetProd = products[2] || products[0];
          selectedIdx = 2;
        } else if (commCtx?.selectedProductId) {
          targetProd = products.find((p) => p.id === commCtx.selectedProductId) || products[0];
        }
      }

      return {
        domain: 'COMMERCE',
        intent: 'COMMERCE_AFFORDABILITY_EVALUATION',
        confidence: 0.95,
        targetRoute: applicationRouteRegistry.getRouteById('commerce'),
        shouldNavigate: false, // Affordability answered within the chat panel without disrupting user view
        targetProduct: targetProd,
        selectedProductIndex: selectedIdx,
        reason: 'User asked for financial affordability analysis based on active account context.',
      };
    }

    // =========================================================================
    // 6. COMMERCE WORKFLOW: MULTI-PRODUCT COMPARISON
    // e.g. "Compare the first three", "Compare the first two", "Compare these", "Compare with Lenovo"
    // =========================================================================
    const isComparison = /\b(compare|comparison|versus|vs\.?|difference\s*between)\b/i.test(pLower);

    if (isComparison && hasContextProducts) {
      let count = 2;
      if (/\b(three|3|first\s*three|top\s*3)\b/i.test(pLower)) count = 3;
      else if (/\b(four|4|first\s*four)\b/i.test(pLower)) count = 4;

      const compareList = products.slice(0, Math.min(count, products.length));

      return {
        domain: 'COMMERCE',
        intent: 'COMMERCE_PRODUCT_COMPARISON',
        confidence: 0.95,
        targetRoute: applicationRouteRegistry.getRouteById('commerce'),
        shouldNavigate: false,
        comparisonProducts: compareList,
        reason: `User requested structured comparison between ${compareList.length} products.`,
      };
    }

    // =========================================================================
    // 7. COMMERCE WORKFLOW: RECOMMENDATION
    // e.g. "Which would you recommend for programming?", "Which one is best?", "Recommend a laptop"
    // =========================================================================
    const isRecommendation =
      /\b(which\s*(?:one\s*)?(?:would\s*you\s*)?recommend|which\s*(?:one\s*)?is\s*best|what\s*should\s*i\s*buy|do\s*you\s*suggest)\b/i.test(pLower);

    if (isRecommendation && hasContextProducts) {
      let useCase = 'daily productivity and programming';
      if (pLower.includes('programming') || pLower.includes('coding') || pLower.includes('developer')) {
        useCase = 'programming';
      } else if (pLower.includes('gaming')) {
        useCase = 'gaming';
      } else if (pLower.includes('student') || pLower.includes('college')) {
        useCase = 'student';
      }

      return {
        domain: 'COMMERCE',
        intent: 'COMMERCE_PRODUCT_RECOMMENDATION',
        confidence: 0.94,
        targetRoute: applicationRouteRegistry.getRouteById('commerce'),
        shouldNavigate: false,
        extractedRequirements: { useCase },
        reason: `User requested product recommendation with focus on ${useCase}.`,
      };
    }

    // =========================================================================
    // 8. COMMERCE WORKFLOW: PRODUCT FILTERING
    // e.g. "Show me laptops under ₹70,000 with at least 16GB RAM", "Now show only Lenovo and ASUS"
    // =========================================================================
    const isFilterQuery =
      (/\b(under|below|less\s*than|maximum|budget|ram|gb|brand|only\s*(?:show|lenovo|asus|dell|hp|acer))\b/i.test(pLower) &&
        /\b(₹|\$|inr|rs|laptop|products?|options?|lenovo|asus|dell|hp|acer)\b/i.test(pLower)) ||
      (/\bshow\s*(?:me\s*)?(?:laptops?|products?)\s*(?:under|below|with)\b/i.test(pLower));

    if (isFilterQuery && (hasContextProducts || pLower.includes('laptop') || pLower.includes('headphone'))) {
      const priceMatch = pLower.match(/(?:under|below|less\s*than|max(?:imum)?)\s*(?:₹|\$|rs\.?|inr)?\s*([\d,]+)/i);
      const ramMatch = pLower.match(/(\d{1,2})\s*gb(?:\s*ram)?/i);

      const brands: string[] = [];
      if (pLower.includes('lenovo')) brands.push('Lenovo');
      if (pLower.includes('asus')) brands.push('ASUS');
      if (pLower.includes('dell')) brands.push('Dell');
      if (pLower.includes('hp')) brands.push('HP');
      if (pLower.includes('acer')) brands.push('Acer');
      if (pLower.includes('apple') || pLower.includes('macbook')) brands.push('Apple');

      const maxPrice = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ''), 10) : undefined;
      const minRamGb = ramMatch ? parseInt(ramMatch[1], 10) : undefined;

      return {
        domain: 'COMMERCE',
        intent: 'COMMERCE_PRODUCT_FILTERING',
        confidence: 0.93,
        targetRoute: applicationRouteRegistry.getRouteById('commerce'),
        shouldNavigate: true,
        navTarget: 'smart-purchases',
        extractedRequirements: {
          maxPrice,
          minRamGb,
          brand: brands.length > 0 ? brands : undefined,
        },
        reason: 'User requested filtering of products by price, RAM, or brand criteria.',
      };
    }

    // =========================================================================
    // 9. COMMERCE WORKFLOW: PRODUCT DISCOVERY (NEW SEARCH)
    // e.g. "I want to buy an ASUS Vivobook 14", "Find a good wireless keyboard", "Looking for running shoes"
    // =========================================================================
    const isCommerceDiscovery =
      /\b(i\s*want\s*to\s*buy|find\s*(?:me\s*)?(?:a\s*)?(?:good\s*)?|looking\s*for\s*(?:a\s*)?|search\s*(?:for\s*)?|need\s*(?:a\s*)?)\b/i.test(pLower) &&
      /\b(laptop|vivobook|macbook|keyboard|mouse|headphones?|shoes?|sneakers?|tablet|monitor|bottle|chair|desk|watch|phone|smartphone|bible)\b/i.test(pLower);

    if (isCommerceDiscovery) {
      let cleanQuery = raw;
      const verbMatch = raw.match(/(?:search\s*(?:for\s*)?|find\s*(?:me\s*)?(?:a\s*)?|look\s*for\s*(?:a\s*)?|want\s*to\s*buy\s*(?:a\s*)?|need\s*(?:a\s*)?)\s+(.+)$/i);
      if (verbMatch) {
        cleanQuery = verbMatch[1];
      } else {
        cleanQuery = raw.replace(/^(?:i\s*want\s*to\s*buy|find\s*(?:me\s*)?(?:a\s*)?|looking\s*for\s*(?:a\s*)?|search\s*(?:for\s*)?|need\s*(?:a\s*)?)\s*/i, '');
      }
      cleanQuery = cleanQuery
        .replace(/\s*(?:in\s*aura\s*commerce|in\s*commerce|online|store)\s*$/i, '')
        .replace(/[.!?,;]+$/, '')
        .trim();

      if (!cleanQuery) cleanQuery = 'laptop';

      return {
        domain: 'COMMERCE',
        intent: 'COMMERCE_PRODUCT_DISCOVERY',
        confidence: 0.95,
        targetRoute: applicationRouteRegistry.getRouteById('commerce'),
        shouldNavigate: true,
        navTarget: 'smart-purchases',
        extractedRequirements: { productQuery: cleanQuery },
        reason: `User initiated product discovery for "${cleanQuery}".`,
      };
    }

    // =========================================================================
    // 10. FINANCIAL GOALS: CREATION, MODIFICATION, DELETION
    // e.g. "I want to save ₹50,000 in six months", "Change the target to ₹60,000", "Delete goal"
    // =========================================================================
    if (/\b(change\s*(?:the\s*)?target|increase\s*(?:the\s*)?goal|update\s*(?:the\s*)?goal|modify\s*goal)\b/i.test(pLower)) {
      const amountMatch = pLower.match(/(?:to|by)\s*(?:₹|\$|rs\.?|inr)?\s*([\d,]+)/i);
      const newAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : undefined;

      return {
        domain: 'FINANCIAL_GOALS',
        intent: 'GOAL_MODIFICATION',
        confidence: 0.95,
        targetRoute: applicationRouteRegistry.getRouteById('goals'),
        shouldNavigate: true,
        navTarget: 'goals',
        goalRequirements: { targetAmount: newAmount },
        reason: `User requested goal target modification to ₹${newAmount || 'new amount'}.`,
      };
    }

    if (
      /\b(i\s*want\s*to\s*save|set\s*a\s*goal|create\s*(?:a\s*)?goal|help\s*me\s*save|need\s*to\s*save)\b/i.test(pLower) &&
      /\b([\d,]+|six\s*months?|year|emergency\s*fund)\b/i.test(pLower)
    ) {
      const amountMatch = pLower.match(/(?:save|goal\s*(?:for|of))\s*(?:₹|\$|rs\.?|inr)?\s*([\d,]+)/i);
      const monthsMatch = pLower.match(/(?:in|over|within)\s*(\d{1,2}|six|twelve|three)\s*months?/i);

      const targetAmount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : 50000;
      let durationMonths = 12;
      if (monthsMatch) {
        const mStr = monthsMatch[1].toLowerCase();
        durationMonths = mStr === 'six' ? 6 : mStr === 'three' ? 3 : mStr === 'twelve' ? 12 : parseInt(mStr, 10);
      }

      return {
        domain: 'FINANCIAL_GOALS',
        intent: 'GOAL_CREATION',
        confidence: 0.96,
        targetRoute: applicationRouteRegistry.getRouteById('goals'),
        shouldNavigate: true,
        navTarget: 'goals',
        goalRequirements: {
          title: 'Savings Goal',
          targetAmount,
          durationMonths,
          monthlyContribution: Math.round(targetAmount / durationMonths),
        },
        reason: `User requested savings goal creation for ₹${targetAmount} across ${durationMonths} months.`,
      };
    }

    if (/\b(delete\s*goal|remove\s*goal|cancel\s*goal)\b/i.test(pLower)) {
      return {
        domain: 'FINANCIAL_GOALS',
        intent: 'GOAL_DELETION',
        confidence: 0.93,
        targetRoute: applicationRouteRegistry.getRouteById('goals'),
        shouldNavigate: true,
        navTarget: 'goals',
        reason: 'User requested deletion of a financial goal.',
      };
    }

    // =========================================================================
    // 11. CALENDAR & SCHEDULING
    // e.g. "Remind me to review my savings every month", "Schedule a monthly savings review"
    // =========================================================================
    if (
      /\b(schedule|set|remind\s*me\s*(?:to\s*)?review)\s*(?:a\s*)?(?:monthly\s*savings\s*review|savings\s*review)\b/i.test(pLower) ||
      /\b(remind\s*me\s*(?:to\s*)?review\s*(?:my\s*)?savings\s*(?:every|each)\s*month)\b/i.test(pLower)
    ) {
      return {
        domain: 'CALENDAR_AND_SCHEDULING',
        intent: 'RECURRING_SCHEDULE',
        confidence: 0.97,
        targetRoute: applicationRouteRegistry.getRouteById('calendar'),
        shouldNavigate: true,
        navTarget: 'calendar',
        actionDetails: {
          title: 'Monthly Savings Review',
          recurrence: 'monthly',
        },
        reason: 'User requested recurring monthly savings review schedule.',
      };
    }

    if (/\b(remind\s*me|schedule\s*(?:a\s*)?reminder|set\s*(?:a\s*)?reminder)\b/i.test(pLower)) {
      return {
        domain: 'CALENDAR_AND_SCHEDULING',
        intent: 'REMINDER_CREATION',
        confidence: 0.95,
        targetRoute: applicationRouteRegistry.getRouteById('calendar'),
        shouldNavigate: true,
        navTarget: 'calendar',
        reason: 'User requested creation of a durable reminder.',
      };
    }

    // =========================================================================
    // 12. BILLS & COMMITMENTS
    // e.g. "Show my upcoming bills", "Show my bills", "Cancel my Netflix subscription"
    // =========================================================================
    if (/\b(show\s*(?:my\s*)?(?:upcoming\s*)?bills|my\s*commitments|what\s*bills\s*are\s*due)\b/i.test(pLower)) {
      return {
        domain: 'BUDGETS_AND_BILLS',
        intent: 'BILL_INQUIRY',
        confidence: 0.96,
        targetRoute: applicationRouteRegistry.getRouteById('commitments'),
        shouldNavigate: true,
        navTarget: 'commitments',
        reason: 'User requested view of upcoming bills and financial commitments.',
      };
    }

    // =========================================================================
    // 13. TRANSACTIONS & SPENDING ANALYSIS / FILTERING
    // e.g. "Show my largest expenses this month", "Show purchases above ₹5,000"
    // =========================================================================
    if (
      /\b(?:show|filter|find)\s*(?:purchases|transactions|expenses)\s*(?:above|over|greater\s*than|>)\s*(?:₹|\$|rs\.?|inr)?\s*([\d,]+)/i.test(pLower) ||
      /\btransactions?\s*(?:above|over|greater\s*than|>)\s*(?:₹|\$|rs\.?|inr)?\s*([\d,]+)/i.test(pLower)
    ) {
      const match = pLower.match(/(?:above|over|greater\s*than|>)\s*(?:₹|\$|rs\.?|inr)?\s*([\d,]+)/i);
      const minAmount = match ? parseInt(match[1].replace(/,/g, ''), 10) : 5000;
      return {
        domain: 'TRANSACTIONS_AND_SPENDING',
        intent: 'TRANSACTION_FILTERING',
        confidence: 0.98,
        targetRoute: applicationRouteRegistry.getRouteById('transactions'),
        shouldNavigate: true,
        navTarget: 'transactions',
        actionDetails: {
          minAmount,
          filterModel: {
            amount: {
              filterType: 'number',
              type: 'greaterThan',
              filter: minAmount,
            },
          },
        },
        reason: `User requested filtering transactions for purchases above ₹${minAmount.toLocaleString('en-IN')}.`,
      };
    }

    if (
      /\b(largest\s*expenses?|biggest\s*expenses?|top\s*expenses?|highest\s*spending)\b/i.test(pLower)
    ) {
      return {
        domain: 'TRANSACTIONS_AND_SPENDING',
        intent: 'TRANSACTION_ANALYSIS',
        confidence: 0.95,
        targetRoute: applicationRouteRegistry.getRouteById('transactions'),
        shouldNavigate: true,
        navTarget: 'transactions',
        reason: 'User requested analysis of largest transactions.',
      };
    }

    // =========================================================================
    // 14. EXPLICIT APPLICATION NAVIGATION
    // e.g. "Take me to Transactions", "Open Financial Planning", "Go to Settings"
    // =========================================================================
    const isNavigationCommand =
      /^(take\s*me\s*to|go\s*to|open|navigate\s*to|show\s*(?:me\s*)?(?:my\s*)?)\s+/i.test(raw);

    if (isNavigationCommand) {
      const route = applicationRouteRegistry.resolveRouteForIntent(raw);
      if (route) {
        return {
          domain: 'APPLICATION_NAVIGATION',
          intent: 'APP_NAVIGATION',
          confidence: 0.96,
          targetRoute: route,
          shouldNavigate: true,
          navTarget: route.navTabId,
          reason: `User explicitly requested navigation to ${route.title}.`,
        };
      }
    }

    // =========================================================================
    // 15. DEFAULT: GENERAL CONVERSATION
    // =========================================================================
    return {
      domain: 'GENERAL_CONVERSATION_OR_CONCEPT',
      intent: 'GENERAL_CONVERSATION',
      confidence: 0.7,
      shouldNavigate: false,
      reason: 'Standard conversational query.',
    };
  }
}

export const applicationIntentClassifier = new ApplicationIntentClassifier();
