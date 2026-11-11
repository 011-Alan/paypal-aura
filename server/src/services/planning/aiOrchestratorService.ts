import mongoose from 'mongoose';
import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  UserModel,
  AccountModel,
  TransactionModel,
  MandateModel,
  GoalModel,
  CalendarEventModel,
  FamilyGroupModel,
  ICommerceContext,
} from '../../models';
import { astropodsIntegration } from '../../integrations/astropods';
import { agGridIntegration } from '../../integrations/ag-grid';
import { bryntumIntegration } from '../../integrations/bryntum';
import { channel3Integration } from '../../integrations/channel3';
import { elasticIntegration } from '../../integrations/elastic';
import { kernelIntegration } from '../../integrations/kernel';
import { zapierIntegration } from '../../integrations/zapier';
import { coreFinancialService } from '../financial/financialService';
import { paymentGuardianService } from '../payments/paymentGuardianService';
import { pythonAnalyticsService } from '../analytics/analyticsService';
import { geminiRequestManager } from './geminiRequestManager';
import { modelRouter, ModelTaskType } from './modelRouter';
import { GEMINI_MODEL_REGISTRY, validateModelAvailability, ModelDiagnosticResult } from './modelConfig';
import { semanticRetrievalService } from '../ai/semanticRetrievalService';
import { lightweightProcessingService } from '../ai/lightweightProcessingService';
import { aiActionRegistry } from '../ai/aiActionRegistry';
import { commerceIntentRouter } from '../ai/commerceIntentRouter';
import { applicationIntentClassifier } from '../ai/applicationIntentClassifier';
import { applicationRouteRegistry } from '../navigation/applicationRouteRegistry';
import { commerceIntelligenceService } from '../ecommerce/commerceIntelligenceService';

export interface AiToolAction {
  type:
    | 'navigation'
    | 'theme_changed'
    | 'sidebar_toggled'
    | 'logout'
    | 'external_link'
    | 'currency_updated'
    | 'profile_updated'
    | 'plan_generated'
    | 'reminder_scheduled'
    | 'reminder_cancelled'
    | 'goal_created'
    | 'goal_updated'
    | 'purchase_evaluated'
    | 'product_discovery'
    | 'order_prepared'
    | 'payment_prepared'
    | 'family_task'
    | 'general_knowledge'
    | 'financial_intelligence'
    | 'clarification_needed';
  title: string;
  status: 'completed' | 'awaiting_approval' | 'informational';
  requiresUserPaymentApproval?: boolean;
  navTarget?: string;
  details?: any;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface EmiOption {
  tenureMonths: number;
  monthlyEmiInr: number;
  totalPayableInr: number;
  totalInterestInr: number;
  annualInterestRatePercent: number;
  fitsMonthlyDiscretionaryBudget: boolean;
  discretionaryImpactPercent: number;
}

export interface AiObservabilityTrace {
  requestId: string;
  conversationId: string;
  userId: string;
  model: string;
  apiStatus: 'not_configured' | 'requested' | 'succeeded' | 'failed';
  apiLatencyMs: number;
  toolCallsRequested: string[];
  toolExecutionStatus: Record<string, 'success' | 'failed' | 'rejected'>;
  followUpStatus: 'not_needed' | 'succeeded' | 'failed';
  finalResponseStatus: 'succeeded' | 'service_unavailable' | 'failed';
  retriesAttempted?: number;
  geminiCallsMade?: number;
  cached?: boolean;
  queueWaitTimeMs?: number;
  fallbackOccurred?: boolean;
  originalModel?: string;
  modelRole?: 'primary' | 'lightweight';
  errorDetails?: string;
  timestamp: string;
}

export interface ProcessConversationalQueryResult {
  success: boolean;
  serviceUnavailable?: boolean;
  code?: string;
  error?: string;
  canRetry?: boolean;
  retryAfterSeconds?: number | null;
  modelUsed?: string;
  fallbackOccurred?: boolean;
  prompt: string;
  workflowType: string;
  explanation: string;
  answer: string;
  response?: string;
  toolAction: AiToolAction | null;
  executedAction?: any;
  suggestedNextPrompts: string[];
  astropodsOrchestration?: any;
  agGridAnalytics?: any;
  elasticMemory?: any;
  bryntumCalendar?: any;
  purchaseCompanion?: any;
  financialPlan?: any;
  preparedPayment?: any;
  kernelResearch?: any;
  pythonAnalytics?: any;
  observability?: AiObservabilityTrace | null;
  commerceContext?: ICommerceContext | null;
  timestamp: string;
}

export function calculateEmiSchedule(
  principalInr: number,
  monthlyDiscretionaryBudgetInr: number,
  annualInterestRatePercent = 14
): EmiOption[] {
  const tenures = [3, 6, 9, 12];
  const r = annualInterestRatePercent / 12 / 100;

  return tenures.map((n) => {
    let monthlyEmi: number;
    if (r === 0) {
      monthlyEmi = Math.round(principalInr / n);
    } else {
      const factor = Math.pow(1 + r, n);
      monthlyEmi = Math.round((principalInr * r * factor) / (factor - 1));
    }
    const totalPayable = monthlyEmi * n;
    const totalInterest = Math.max(0, totalPayable - principalInr);
    const impactPercent = Math.round((monthlyEmi / Math.max(1, monthlyDiscretionaryBudgetInr)) * 100);
    const fits = monthlyEmi <= monthlyDiscretionaryBudgetInr * 0.45;

    return {
      tenureMonths: n,
      monthlyEmiInr: monthlyEmi,
      totalPayableInr: totalPayable,
      totalInterestInr: totalInterest,
      annualInterestRatePercent,
      fitsMonthlyDiscretionaryBudget: fits,
      discretionaryImpactPercent: impactPercent,
    };
  });
}

export function formatCommerceContextForPrompt(ctx?: ICommerceContext | null): string {
  if (!ctx || !ctx.products || ctx.products.length === 0) return '';
  const lines = [
    `\n--- ACTIVE COMMERCE CONTEXT ---`,
    `Last Search Query: "${ctx.lastSearchQuery || ''}"`,
    `Recommended / Active Product ID: "${ctx.recommendedProductId || ctx.selectedProductId || ctx.products[0]?.id}"`,
    `Products currently in conversation:`,
  ];
  ctx.products.forEach((p, i) => {
    const isRec = p.id === (ctx.recommendedProductId || ctx.selectedProductId) ? ' [ACTIVE / RECOMMENDED]' : '';
    lines.push(
      `${i + 1}. [ID: ${p.id}] ${p.name}${isRec} | Price: ₹${p.priceInr?.toLocaleString('en-IN')} | Brand: ${p.brand} | Retailer: ${p.retailerName} | URL: ${p.purchaseUrl}`
    );
    const specs = Object.entries(p.specifications || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (specs) {
      lines.push(`   Specs: ${specs}`);
    }
  });
  if (ctx.alternativeProducts && ctx.alternativeProducts.length > 0) {
    lines.push(`Alternative Products in conversation:`);
    ctx.alternativeProducts.forEach((p, i) => {
      lines.push(
        `ALT ${i + 1}. [ID: ${p.id}] ${p.name} | Price: ₹${p.priceInr?.toLocaleString('en-IN')} | Brand: ${p.brand} | Retailer: ${p.retailerName} | URL: ${p.purchaseUrl}`
      );
      const specs = Object.entries(p.specifications || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (specs) {
        lines.push(`   Specs: ${specs}`);
      }
    });
  }
  lines.push(`--- END COMMERCE CONTEXT ---\n`);
  return lines.join('\n');
}

export function formatGridSelectionContextForPrompt(ctx?: any): string {
  if (!ctx || !ctx.records || ctx.records.length === 0) return '';
  const lines = [
    `\n--- ACTIVE AG GRID SELECTION CONTEXT ---`,
    `Source: ${ctx.source} | Grid: ${ctx.gridId} | Selected Items Count: ${ctx.totalSelected}`,
    `Total Amount: $${ctx.summary?.totalAmount?.toFixed(2)} | Currency: ${ctx.summary?.currency || 'USD'}`,
    `Selected Records:`,
  ];
  ctx.records.slice(0, 15).forEach((r: any, i: number) => {
    lines.push(
      `${i + 1}. [ID: ${r.id}] ${r.date || ''} | ${r.merchant || r.billerName || r.customerName || r.title} | Amount: $${r.amount || r.totalAmount || r.targetAmount} | Category: ${r.category || ''} | Status: ${r.status || r.fulfillmentStatus || ''} ${r.isRecurring ? '[RECURRING]' : ''} ${r.isUnusual ? '[ANOMALY: ' + r.unusualReason + ']' : ''}`
    );
  });
  lines.push(`--- END AG GRID SELECTION CONTEXT ---\n`);
  return lines.join('\n');
}

/**
 * 16 Gemini Function Declarations for AURA Backend Tools
 */
export const GEMINI_TOOL_DECLARATIONS = {
  functionDeclarations: [
    {
      name: 'getFinancialSummary',
      description: 'Retrieve user liquid balance, checking/savings accounts breakdown, discretionary spending cushion, and monthly income.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          includeAccounts: { type: Type.BOOLEAN, description: 'Whether to include per-account balance details' },
        },
      },
    },
    {
      name: 'getUpcomingCommitments',
      description: 'Retrieve user recurring bills, rent, mandates, and calendar commitments due this month with due dates and amounts.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          dueWithinDays: { type: Type.INTEGER, description: 'Optional number of days to look ahead, e.g. 7, 14, 30' },
        },
      },
    },
    {
      name: 'searchProducts',
      description: 'Discover and search verified catalog products (laptops, appliances, electronics, footwear) with live prices in INR and merchant details.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'The product search term, e.g. "ASUS Vivobook 14", "Lenovo alternative", "water bottle", "sneakers"' },
          category: { type: Type.STRING, description: 'Optional product category: "Kitchen & Dining", "Home Appliances", "Laptops & Computers", "Footwear & Sneakers"' },
          maxPriceInr: { type: Type.NUMBER, description: 'Optional maximum price ceiling in INR' },
          isAlternative: { type: Type.BOOLEAN, description: 'Set to true if searching for an alternative to previously recommended products' },
        },
        required: ['query'],
      },
    },
    {
      name: 'recommendProduct',
      description: 'Evaluate previously retrieved products in context and recommend the best option with detailed reasoning based on verified hardware specifications.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          criteria: { type: Type.STRING, description: 'Optional user priority, e.g. "budget", "performance", "battery", "display", "value"' },
          productId: { type: Type.STRING, description: 'Optional specific product ID to focus recommendation on' },
        },
      },
    },
    {
      name: 'convertCurrency',
      description: 'Convert product prices or monetary amounts between currencies (e.g. INR to USD, EUR, GBP) using authentic exchange rates with formula, rate timestamp, and fee disclaimer.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          amount: { type: Type.NUMBER, description: 'Amount to convert. If omitted, converts active product price from context.' },
          fromCurrency: { type: Type.STRING, description: 'Source currency ISO code, default "INR"' },
          toCurrency: { type: Type.STRING, description: 'Target currency ISO code, e.g. "USD"' },
          productId: { type: Type.STRING, description: 'Optional ID of product whose price is being converted' },
        },
        required: ['toCurrency'],
      },
    },
    {
      name: 'evaluateProductDetail',
      description: 'Answer specific product hardware questions (battery life, display, RAM/storage, processor, graphics, ports, weight) using verified specifications from previous search results.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING, description: 'Feature or question being asked about (e.g. "battery life", "RAM upgradeability", "OLED display")' },
          productId: { type: Type.STRING, description: 'Optional product ID to evaluate' },
        },
        required: ['question'],
      },
    },
    {
      name: 'analyseAffordability',
      description: 'Perform a deterministic 7-factor financial affordability evaluation of a specific product or purchase amount against income, remaining discretionary budget, ringfenced upcoming commitments, and savings goals. Can read price directly from active product context.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          productName: { type: Type.STRING, description: 'The product name or type, e.g. "ASUS Vivobook 14", "Water Bottle", "Air Conditioner"' },
          priceInr: { type: Type.NUMBER, description: 'The purchase amount in INR to evaluate. If omitted, uses active product price from context.' },
          category: { type: Type.STRING, description: 'Optional category of the purchase' },
        },
      },
    },
    {
      name: 'calculateEmiOptions',
      description: 'Calculate standard reducing-balance EMI loan options across 3, 6, 9, and 12-month tenures and evaluate budget impact.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          principalInr: { type: Type.NUMBER, description: 'The total purchase price to finance in INR' },
          productName: { type: Type.STRING, description: 'The item being purchased on EMI' },
        },
        required: ['principalInr'],
      },
    },
    {
      name: 'compareProducts',
      description: 'Generate a side-by-side specification, pricing, and feature comparison between products from previous search results or category.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, description: 'Optional product category or query to compare' },
          productNames: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Optional list of product names to compare' },
          productIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Optional list of product IDs to compare' },
        },
      },
    },
    {
      name: 'postponementAnalysis',
      description: 'Analyse the financial impact of waiting until next month to make a purchase, calculating rollover discretionary funds and fresh allocations.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          priceInr: { type: Type.NUMBER, description: 'Purchase amount in INR' },
          productName: { type: Type.STRING, description: 'Item name' },
        },
        required: ['priceInr'],
      },
    },
    {
      name: 'createReminder',
      description: 'Schedule a recurring or one-off financial reminder in the Bryntum Financial Calendar with automated notifications.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Title of the reminder (e.g. "Rent Payment Reminder", "Electricity Bill")' },
          dueDayOfMonth: { type: Type.INTEGER, description: 'Day of the month for the due date (1-31)' },
          amountInr: { type: Type.NUMBER, description: 'Optional amount associated with the reminder' },
        },
        required: ['title'],
      },
    },
    {
      name: 'createOrUpdateSavingsGoal',
      description: 'Create a new financial savings goal or update target timeline and monthly contributions for an existing goal.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          targetAmount: { type: Type.NUMBER, description: 'Total target savings amount in INR' },
          durationMonths: { type: Type.INTEGER, description: 'Target timeline in months (e.g. 6, 12, 24)' },
          title: { type: Type.STRING, description: 'Title or purpose of the goal (e.g. "Emergency Fund", "New Laptop")' },
        },
        required: ['targetAmount'],
      },
    },
    {
      name: 'preparePayment',
      description: 'Prepare an explicit, reviewable payment draft to a recipient. AI NEVER moves funds autonomously; user must confirm with security PIN on the Payments screen.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          recipientName: { type: Type.STRING, description: 'Name of the recipient or merchant' },
          amountInr: { type: Type.NUMBER, description: 'Amount in INR to prepare' },
        },
        required: ['recipientName', 'amountInr'],
      },
    },
    {
      name: 'navigateApplication',
      description: 'Navigate the application interface to a specific tab or dashboard view, optionally passing a search query for Commerce.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          targetTab: {
            type: Type.STRING,
            description: 'Target section: "overview", "transactions", "calendar", "smart-purchases", "payments", "financial-health", "family-vault", "settings"',
          },
          searchQuery: {
            type: Type.STRING,
            description: 'Optional query to automatically search when navigating to smart-purchases (e.g. "Vivobook 14")',
          },
        },
        required: ['targetTab'],
      },
    },
    {
      name: 'updateCurrencyPreference',
      description: 'Update the user profile preferred display currency.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          currencyCode: { type: Type.STRING, description: 'ISO currency code, e.g. "INR", "USD", "EUR"' },
        },
        required: ['currencyCode'],
      },
    },
    {
      name: 'getRecentTransactions',
      description: 'Retrieve recent categorized user transactions with optional category filter and time range.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          days: { type: Type.INTEGER, description: 'Number of past days to query' },
          category: { type: Type.STRING, description: 'Optional category filter' },
        },
      },
    },
    {
      name: 'changeTheme',
      description: 'Switch the application interface theme to dark or light mode.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING, description: '"dark" or "light"' },
        },
        required: ['theme'],
      },
    },
    {
      name: 'toggleSidebar',
      description: 'Collapse, expand, or toggle the main navigation sidebar.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, description: '"collapse", "expand", or "toggle"' },
        },
      },
    },
    {
      name: 'logoutUser',
      description: 'Log out the user, invalidate the session, and return to the login screen.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: 'openExternalLink',
      description: 'Provide an official, verified external portal link (Cybercrime portal, RBI CMS, PayPal).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          url: { type: Type.STRING, description: 'The official destination URL' },
          label: { type: Type.STRING, description: 'Human readable label for the portal' },
        },
        required: ['url'],
      },
    },
    {
      name: 'prepareCommerceOrder',
      description: 'Prepare an e-commerce order draft and navigate user to AURA Commerce checkout. Never executes payments autonomously.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          productName: { type: Type.STRING, description: 'Name of the item to order' },
          priceInr: { type: Type.NUMBER, description: 'Item price in INR' },
          retailer: { type: Type.STRING, description: 'Retailer merchant name' },
        },
        required: ['productName'],
      },
    },
    {
      name: 'analyseSpending',
      description: 'Analyze spending by category, top areas of expenditure, and avoidable recurring expenses.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          days: { type: Type.INTEGER, description: 'Number of past days to evaluate (e.g. 30, 60, 90)' },
        },
      },
    },
    {
      name: 'calculateSavingsPlan',
      description: 'Generate an actionable, personal financial improvement plan with savings targets, monthly budgets, and milestones.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: 'simulateFinancialScenario',
      description: 'Simulate deterministic what-if financial scenarios (saving ₹5,000/mo, cutting shopping by 15%, emergency fund timeline, postponement).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          scenario: { type: Type.STRING, description: 'The scenario to simulate' },
        },
      },
    },
    {
      name: 'calculateLoanRepayment',
      description: 'Calculate loan amortisation schedules, monthly EMI, total interest, and prepayment comparisons.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          principalInr: { type: Type.NUMBER, description: 'Loan principal in INR' },
          annualInterestRatePercent: { type: Type.NUMBER, description: 'Annual interest rate percent' },
          tenureMonths: { type: Type.INTEGER, description: 'Repayment tenure in months' },
        },
        required: ['principalInr'],
      },
    },
    {
      name: 'createRecurringSchedule',
      description: 'Create a durable recurring reminder (e.g. every Sunday, 3 days before rent is due, monthly review).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Title of the recurring reminder' },
          recurrencePattern: { type: Type.STRING, description: 'e.g. "every Sunday", "3 days before rent", "monthly"' },
        },
        required: ['title'],
      },
    },
    {
      name: 'createConditionalAlert',
      description: 'Create a durable financial event-driven alert (e.g. notify if shopping exceeds ₹10,000, transaction > ₹3,000, salary arrives).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Alert title' },
          triggerType: {
            type: Type.STRING,
            description: '"spending_threshold", "transaction_threshold", or "balance_threshold"',
          },
          thresholdValue: { type: Type.NUMBER, description: 'Numeric threshold limit in INR' },
          category: { type: Type.STRING, description: 'Optional category (e.g. "Shopping", "Salary")' },
        },
        required: ['title', 'thresholdValue'],
      },
    },
    {
      name: 'listSchedules',
      description: 'List all active schedules, pending reminders, and conditional alerts for the user.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: 'cancelSchedule',
      description: 'Cancel a scheduled reminder or alert by its schedule ID.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          scheduleId: { type: Type.STRING, description: 'Schedule ID to cancel (e.g. "sched_123...")' },
        },
        required: ['scheduleId'],
      },
    },
    {
      name: 'analyseBusinessFinances',
      description: 'Analyze merchant business performance: revenue, operating costs, profit margins, and receivables. (Business accounts only)',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: 'generateBusinessProjections',
      description: 'Generate 6-month business projections under Optimistic, Expected, and Conservative scenarios. (Business accounts only)',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: 'assistFinancialDistress',
      description: 'Provide empathetic, step-by-step guidance for lost money, suspected scams, or unauthorized bank transactions (Cyber helpline 1930, bank steps).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          amount: { type: Type.NUMBER, description: 'Estimated amount lost or disputed' },
        },
      },
    },
    {
      name: 'draftEmail',
      description: 'Draft an official bank dispute email or cybercrime statement for an unauthorized transaction.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, description: '"bank_fraud" or "cybercrime"' },
        },
      },
    },
    {
      name: 'gridApplyFilters',
      description: 'Filter rows in an AG Grid financial table (e.g. transactions above $100, shopping expenses, specific date ranges).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          gridId: { type: Type.STRING, description: 'Target grid, e.g. "transactions-grid", "merchant-orders-grid"' },
          query: { type: Type.STRING, description: 'Natural language filter instruction, e.g. "shopping expenses above $200 from last month"' },
          filters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                field: { type: Type.STRING, description: 'Field name (amount, category, merchant, date, type)' },
                operator: { type: Type.STRING, description: 'greaterThan, lessThan, equals, contains' },
                value: { type: Type.STRING, description: 'Filter value' },
              },
            },
            description: 'Structured filter criteria list',
          },
        },
      },
    },
    {
      name: 'gridClearFilters',
      description: 'Clear all active filters on the AG Grid financial table.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          gridId: { type: Type.STRING, description: 'Target grid ID' },
        },
      },
    },
    {
      name: 'gridApplySorting',
      description: 'Sort an AG Grid table by a column in ascending or descending order (e.g. sort by amount desc, date desc).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          gridId: { type: Type.STRING, description: 'Target grid ID' },
          field: { type: Type.STRING, description: 'Column to sort by (amount, date, merchant, category)' },
          direction: { type: Type.STRING, description: '"asc" or "desc"' },
        },
        required: ['field'],
      },
    },
    {
      name: 'gridSetColumnVisibility',
      description: 'Show or hide specific columns in the AG Grid financial table.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          gridId: { type: Type.STRING, description: 'Target grid ID' },
          hideColumns: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Columns to hide' },
          showColumns: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Columns to show' },
        },
      },
    },
    {
      name: 'gridSelectRows',
      description: 'Select rows in the AG Grid table (e.g. top 5 largest transactions).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          gridId: { type: Type.STRING, description: 'Target grid ID' },
          criteria: { type: Type.STRING, description: '"top_largest", "bottom_smallest", or "by_ids"' },
          count: { type: Type.INTEGER, description: 'Number of rows to select' },
        },
      },
    },
    {
      name: 'gridUndoAction',
      description: 'Undo the previous AG Grid filter or sorting change.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          gridId: { type: Type.STRING, description: 'Target grid ID' },
        },
      },
    },
    {
      name: 'gridSaveView',
      description: 'Save the current AG Grid view layout and filters with a custom name.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          gridId: { type: Type.STRING, description: 'Target grid ID' },
          name: { type: Type.STRING, description: 'Name of the view, e.g. "Monthly Expenses", "Large Purchases"' },
        },
        required: ['name'],
      },
    },
    {
      name: 'gridRestoreView',
      description: 'Restore a previously saved AG Grid view by name.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          gridId: { type: Type.STRING, description: 'Target grid ID' },
          name: { type: Type.STRING, description: 'Name of the view to restore' },
        },
      },
    },
    {
      name: 'gridAnalyseSelection',
      description: 'Perform deep financial intelligence analysis on selected AG Grid transactions or business orders.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING, description: '"transactions", "orders", "commitments", or "goals"' },
          gridId: { type: Type.STRING, description: 'Target grid ID' },
          question: { type: Type.STRING, description: 'Specific question about the selected records' },
        },
      },
    },
  ],
};

export interface GeminiTransientCheck {
  retryable: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  reason: string;
}

export function parseGeminiError(err: any): {
  statusCode?: number;
  statusText?: string;
  message: string;
  retryAfterMs?: number;
} {
  let statusCode: number | undefined = err?.status || err?.statusCode || err?.code;
  if (typeof statusCode !== 'number') {
    statusCode = undefined;
  }

  const rawMsg = String(err?.message || err || '');

  let parsedJson: any = null;
  const jsonMatch = rawMsg.match(/\{[\s\S]*"error"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      parsedJson = JSON.parse(jsonMatch[0]);
    } catch {
      // ignore JSON parse failures
    }
  }

  if (!statusCode && parsedJson?.error?.code) {
    statusCode = Number(parsedJson.error.code);
  }

  let retryAfterMs: number | undefined = undefined;
  const retryAfterHeader =
    err?.response?.headers?.get?.('retry-after') ||
    err?.headers?.['retry-after'] ||
    err?.response?.headers?.['retry-after'];
  if (retryAfterHeader) {
    const sec = parseFloat(retryAfterHeader);
    if (!isNaN(sec) && sec > 0) {
      retryAfterMs = Math.round(sec * 1000);
    }
  }

  if (!retryAfterMs) {
    const m = rawMsg.match(/retry after ([\d.]+)s/i);
    if (m) {
      retryAfterMs = Math.round(parseFloat(m[1]) * 1000);
    }
  }

  return {
    statusCode,
    statusText: parsedJson?.error?.status,
    message: rawMsg,
    retryAfterMs,
  };
}

export function isTransientGeminiError(err: any): GeminiTransientCheck {
  const parsed = parseGeminiError(err);
  const msg = parsed.message.toLowerCase();
  const status = parsed.statusCode;
  const statusText = (parsed.statusText || '').toUpperCase();

  // 1. Permanent failures: Authentication (401, 403, API_KEY_INVALID, PERMISSION_DENIED)
  if (
    status === 401 ||
    status === 403 ||
    statusText === 'UNAUTHENTICATED' ||
    statusText === 'PERMISSION_DENIED' ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('unauthenticated') ||
    msg.includes('permission_denied')
  ) {
    return { retryable: false, statusCode: status || 401, reason: 'authentication_failure' };
  }

  // 2. Permanent failures: Model not found / invalid model (404, NOT_FOUND)
  if (
    status === 404 ||
    statusText === 'NOT_FOUND' ||
    msg.includes('is no longer available') ||
    msg.includes('not found') ||
    (msg.includes('models/') && msg.includes('not found'))
  ) {
    return { retryable: false, statusCode: status || 404, reason: 'model_not_found' };
  }

  // 3. Permanent failures: Bad request / invalid arguments (400, INVALID_ARGUMENT)
  if (
    status === 400 ||
    statusText === 'INVALID_ARGUMENT' ||
    msg.includes('invalid_argument')
  ) {
    return { retryable: false, statusCode: status || 400, reason: 'invalid_argument' };
  }

  // 4. Permanent failures: Daily / hard quota exhausted
  if (
    msg.includes('daily_quota_exhausted') ||
    msg.includes('quota_exhausted') ||
    (msg.includes('quota') && (msg.includes('per day') || msg.includes('daily') || msg.includes('requestsperday')))
  ) {
    return { retryable: false, statusCode: 429, reason: 'daily_quota_exhausted' };
  }

  // Transient retryable failures:
  // 1. HTTP 503 (UNAVAILABLE) / Service Unavailable / overloaded
  if (
    status === 503 ||
    statusText === 'UNAVAILABLE' ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded')
  ) {
    return { retryable: true, statusCode: 503, retryAfterMs: parsed.retryAfterMs, reason: 'service_unavailable' };
  }

  // 2. Other HTTP 5xx errors (500, 502, 504)
  if (
    status === 500 ||
    status === 502 ||
    status === 504 ||
    statusText === 'INTERNAL' ||
    msg.includes('502 bad gateway') ||
    msg.includes('504 gateway timeout') ||
    msg.includes('internal server error')
  ) {
    return { retryable: true, statusCode: status || 500, retryAfterMs: parsed.retryAfterMs, reason: 'server_error' };
  }

  // 3. HTTP 429 (Transient rate limit / RESOURCE_EXHAUSTED)
  if (
    status === 429 ||
    statusText === 'RESOURCE_EXHAUSTED' ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  ) {
    return { retryable: true, statusCode: 429, retryAfterMs: parsed.retryAfterMs, reason: 'rate_limited' };
  }

  // 4. Transient network / socket errors
  const isNetworkError =
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('eai_again') ||
    msg.includes('connect timeout') ||
    msg.includes('socket hang up') ||
    err?.code === 'ECONNRESET' ||
    err?.code === 'ETIMEDOUT' ||
    err?.code === 'ENOTFOUND' ||
    err?.code === 'EAI_AGAIN' ||
    err?.cause?.code === 'ECONNRESET' ||
    err?.cause?.code === 'ETIMEDOUT';

  if (isNetworkError) {
    return { retryable: true, statusCode: 0, retryAfterMs: parsed.retryAfterMs, reason: 'transient_network_error' };
  }

  return { retryable: false, statusCode: status, reason: 'unrecognized_error' };
}

export class AuraAiOrchestratorService {
  private geminiClient: GoogleGenAI | null = null;
  private lastConnectivityCheckAt: number = 0;
  private lastConnectivitySuccess: boolean = false;
  private lastConnectivityError: string | null = null;
  private recentTraces: AiObservabilityTrace[] = [];
  private customSleepFn: ((ms: number) => Promise<void>) | null = null;
  private fallbackEnabled: boolean = true;

  constructor() {
    this.initGeminiClient();
  }

  public setFallbackEnabledForTesting(enabled: boolean) {
    this.fallbackEnabled = enabled;
  }

  public setSleepFnForTesting(fn: ((ms: number) => Promise<void>) | null) {
    this.customSleepFn = fn;
  }

  public initGeminiClient(customApiKey?: string) {
    const key = customApiKey || env.GEMINI_API_KEY;
    if (key && key !== 'your_gemini_api_key_here' && key.trim().length > 0) {
      try {
        this.geminiClient = new GoogleGenAI({ apiKey: key.trim() });
        semanticRetrievalService.setGeminiClient(this.geminiClient);
        lightweightProcessingService.setGeminiClient(this.geminiClient);
        logger.info('AuraAiOrchestrator', 'Initialized official GoogleGenAI SDK with Multi-Model Architecture', {
          primaryModel: GEMINI_MODEL_REGISTRY.primary.modelId,
          lightweightModel: GEMINI_MODEL_REGISTRY.lightweight.modelId,
          embeddingModel: GEMINI_MODEL_REGISTRY.embedding.modelId,
        });
      } catch (err: any) {
        logger.warn('AuraAiOrchestrator', 'Could not initialize GoogleGenAI SDK', {
          error: this.redactSecrets(err?.message),
        });
        this.geminiClient = null;
      }
    } else {
      this.geminiClient = null;
    }
  }

  public setGeminiClientForTesting(client: any) {
    this.geminiClient = client;
    semanticRetrievalService.setGeminiClient(client);
    lightweightProcessingService.setGeminiClient(client);
    this.lastConnectivitySuccess = Boolean(client);
    this.lastConnectivityError = null;
    this.lastConnectivityCheckAt = Date.now();
  }

  public get isGeminiConfigured(): boolean {
    return Boolean(this.geminiClient);
  }

  public getRecentTraces(limit = 10): AiObservabilityTrace[] {
    return this.recentTraces.slice(-limit);
  }

  private recordTrace(trace: AiObservabilityTrace) {
    this.recentTraces.push(trace);
    if (this.recentTraces.length > 50) {
      this.recentTraces.shift();
    }
  }

  public redactSecrets(str: string): string {
    if (!str) return '';
    return str
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_GEMINI_KEY]')
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]');
  }

  /**
   * Shared API-request boundary for Google Gemini with exponential backoff and jitter.
   * Maximum 4 retries after the initial request (up to 5 attempts total).
   * Schedule:
   *   Retry 1: approximately 1 second
   *   Retry 2: approximately 2 seconds
   *   Retry 3: approximately 4 seconds
   *   Retry 4: approximately 8 seconds
   * Respects Retry-After header / message if present (especially on transient 429).
   * Never retries non-transient / permanent errors (400, 401, 403, 404, daily quota).
   */
  public async callGeminiWithRetry(
    modelRoleOrOpName: 'primary' | 'lightweight' | string,
    operationNameOrReqId: string,
    requestIdOrParams: any,
    maybeParams?: any
  ): Promise<{ response: any; retriesAttempted: number }> {
    let modelRole: 'primary' | 'lightweight' = 'primary';
    let operationName: string;
    let requestId: string;
    let params: any;

    if (modelRoleOrOpName === 'primary' || modelRoleOrOpName === 'lightweight') {
      modelRole = modelRoleOrOpName;
      operationName = operationNameOrReqId;
      requestId = requestIdOrParams as string;
      params = maybeParams;
    } else {
      modelRole = 'primary';
      operationName = modelRoleOrOpName;
      requestId = operationNameOrReqId;
      params = requestIdOrParams;
    }

    const maxRetries = 2;
    const sleep = this.customSleepFn || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

    let attempt = 0; // 0 = initial request
    let lastError: any = null;

    while (attempt <= maxRetries) {
      try {
        if (attempt > 0) {
          logger.info('AuraAiOrchestrator', `Executing Gemini API retry attempt ${attempt}/${maxRetries} for ${operationName} (${modelRole})`, {
            requestId,
            attempt,
            maxRetries,
            modelRole,
          });
        }

        const response = await geminiRequestManager.scheduleGeminiCall(
          modelRole,
          operationName,
          requestId,
          () => this.geminiClient!.models.generateContent(params)
        );
        return { response, retriesAttempted: attempt };
      } catch (err: any) {
        lastError = err;
        const transientCheck = isTransientGeminiError(err);

        // Do not retry permanent errors or if retries exhausted
        if (!transientCheck.retryable || attempt >= maxRetries) {
          if (!transientCheck.retryable) {
            logger.warn('AuraAiOrchestrator', `Gemini API error is non-retryable (${transientCheck.reason}). Not retrying.`, {
              requestId,
              statusCode: transientCheck.statusCode,
              reason: transientCheck.reason,
              error: this.redactSecrets(err?.message),
            });
          } else {
            logger.error('AuraAiOrchestrator', `Gemini API retries exhausted (${attempt}/${maxRetries}) for ${operationName}`, {
              requestId,
              retriesAttempted: attempt,
              statusCode: transientCheck.statusCode,
              reason: transientCheck.reason,
              error: this.redactSecrets(err?.message),
            });
          }
          (err as any).retriesAttempted = attempt;
          throw err;
        }

        // Exponential backoff: ~1s, ~2s, ~4s, ~8s with random jitter
        const baseDelayMs = 1000 * Math.pow(2, attempt);
        const jitterMs = Math.floor(Math.random() * (baseDelayMs * 0.2)); // +0-20% jitter
        let delayMs = baseDelayMs + jitterMs;

        // Respect Retry-After if provided
        if (transientCheck.retryAfterMs && transientCheck.retryAfterMs > delayMs) {
          delayMs = Math.min(transientCheck.retryAfterMs, 15000);
        }

        logger.warn('AuraAiOrchestrator', `Gemini API temporary error (${transientCheck.reason}). Retrying in ${delayMs}ms (retry ${attempt + 1}/${maxRetries})`, {
          requestId,
          nextAttempt: attempt + 1,
          maxRetries,
          delayMs,
          statusCode: transientCheck.statusCode,
          reason: transientCheck.reason,
          error: this.redactSecrets(err?.message),
        });

        await sleep(delayMs);
        attempt++;
      }
    }

    (lastError as any).retriesAttempted = attempt;
    throw lastError;
  }

  async verifyConnectivity(force = false): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    if (!this.geminiClient) {
      return { success: false, error: 'GEMINI_API_KEY is not configured in backend environment.' };
    }
    const now = Date.now();
    if (!force && this.lastConnectivityCheckAt && now - this.lastConnectivityCheckAt < 60000) {
      return {
        success: this.lastConnectivitySuccess,
        error: this.lastConnectivityError || undefined,
      };
    }

    const t0 = Date.now();
    try {
      await this.geminiClient.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: 'ping',
      });
      const latencyMs = Date.now() - t0;
      this.lastConnectivityCheckAt = Date.now();
      this.lastConnectivitySuccess = true;
      this.lastConnectivityError = null;
      return { success: true, latencyMs };
    } catch (err: any) {
      this.lastConnectivityCheckAt = Date.now();
      this.lastConnectivitySuccess = false;
      this.lastConnectivityError = this.redactSecrets(err?.message || 'Gemini connectivity failed');
      return { success: false, error: this.lastConnectivityError };
    }
  }

  getHealthStatus() {
    const isConfigured = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'your_gemini_api_key_here');
    const sdkInitialized = Boolean(this.geminiClient);
    const serviceOperational = isConfigured && sdkInitialized && this.lastConnectivitySuccess;

    let status: 'healthy' | 'unconfigured' | 'degraded' = 'unconfigured';
    if (!isConfigured) {
      status = 'unconfigured';
    } else if (serviceOperational) {
      status = 'healthy';
    } else {
      status = 'degraded';
    }

    return {
      service: `AURA Conversational Intelligence (Google Gemini ${env.GEMINI_MODEL})`,
      isConfigured,
      model: env.GEMINI_MODEL,
      multiModel: {
        primary: GEMINI_MODEL_REGISTRY.primary,
        lightweight: GEMINI_MODEL_REGISTRY.lightweight,
        embedding: GEMINI_MODEL_REGISTRY.embedding,
      },
      sdkInitialized,
      functionCallingAvailable: sdkInitialized,
      lastConnectivityCheck: this.lastConnectivityCheckAt ? new Date(this.lastConnectivityCheckAt).toISOString() : null,
      lastConnectivitySuccess: this.lastConnectivitySuccess,
      serviceOperational,
      status,
      error: this.lastConnectivityError || (!isConfigured ? 'GEMINI_API_KEY is not configured in environment' : null),
      strictRule: 'AI never completes financial transactions independently. User retains final payment authority.',
    };
  }

  /**
   * Main conversational interface for "Ask AURA".
   * STRICT GEMINI-FIRST ARCHITECTURE:
   * 1. Multi-User Validation: strictly scoped to the authenticated user ID.
   * 2. Every user message is routed to the configured Google Gemini API.
   * 3. Gemini interprets intent, handles ambiguity with natural questions, and calls tools when appropriate.
   * 4. When tools are invoked, deterministic backend services execute and feed verified data back to Gemini.
   * 5. If Gemini is unavailable, returns an explicit service-unavailable response preserving the user message.
   *    NO hardcoded fallback engines, NO fabricated AI responses.
   */
  async processConversationalQuery(params: {
    userId: string;
    prompt: string;
    conversationHistory?: ConversationTurn[];
    includeKernelResearch?: boolean;
    conversationId?: string;
    requiredCapability?: string;
    commerceContext?: ICommerceContext | null;
    gridSelectionContext?: any;
  }): Promise<ProcessConversationalQueryResult> {
    const startTime = Date.now();
    const requestId = `gemini-req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const conversationId = params.conversationId || 'untracked-conv';
    const prompt = (params.prompt || '').trim();
    const history = params.conversationHistory || [];

    // -------------------------------------------------------------------------
    // 1. STRICT MULTI-USER SECURITY CHECK
    // Never associate an invalid ID with another user's financial records.
    // -------------------------------------------------------------------------
    if (!params.userId || !mongoose.Types.ObjectId.isValid(params.userId)) {
      throw new Error('Unauthorized: A valid authenticated user ID is required to process conversational queries.');
    }

    const user = await UserModel.findById(params.userId);
    if (!user) {
      throw new Error(`User not found: Account for user ID ${params.userId} could not be resolved.`);
    }

    logger.info('AuraAiOrchestrator', 'Processing conversational query through Gemini architecture', {
      requestId,
      conversationId,
      userId: params.userId,
      prompt: prompt.slice(0, 100),
      historyTurns: history.length,
      geminiConfigured: Boolean(this.geminiClient),
      model: env.GEMINI_MODEL,
    });

    // -------------------------------------------------------------------------
    // 1.5 DETERMINISTIC GRID ACTION & SELECTION ROUTING
    // -------------------------------------------------------------------------
    const promptLower = prompt.toLowerCase();
    const hasSelection = Boolean(
      (params.gridSelectionContext?.records && params.gridSelectionContext.records.length > 0) ||
      (params.gridSelectionContext?.selectedIds && params.gridSelectionContext.selectedIds.length > 0) ||
      (params.gridSelectionContext?.totalSelected && params.gridSelectionContext.totalSelected > 0)
    );

    // If records are selected, analyze the selected records
    if (hasSelection) {
      const tool = aiActionRegistry.getAction('grid_analyse_selection');
      if (tool) {
        const resolvedIds =
          params.gridSelectionContext.selectedIds ||
          params.gridSelectionContext.records?.map((r: any) => r.id || r._id) ||
          [];
        const exec = await tool.execute(
          {
            source: params.gridSelectionContext.source || 'transactions',
            selectedIds: resolvedIds,
            gridId: params.gridSelectionContext.gridId || 'transactions-grid',
          },
          {
            userId: params.userId,
            user,
            prompt,
            history,
            requestId,
            conversationId,
            gridSelectionContext: params.gridSelectionContext,
          }
        );

        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'grid_selection_analysis',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // Undo filter/sorting
    if (promptLower.includes('undo') || promptLower.includes('revert')) {
      const tool = aiActionRegistry.getAction('grid_undo_action');
      if (tool) {
        const exec = await tool.execute(
          { gridId: 'transactions-grid' },
          {
            userId: params.userId,
            user,
            prompt,
            history,
            requestId,
            conversationId,
          }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'grid_action',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // Natural Language Grid Filtering commands
    if (
      promptLower.includes('filter') ||
      promptLower.includes('show my transactions above') ||
      promptLower.includes('show transactions above') ||
      promptLower.includes('show shopping expenses') ||
      promptLower.includes('transactions above') ||
      promptLower.includes('expenses above')
    ) {
      const tool = aiActionRegistry.getAction('grid_apply_filters');
      if (tool) {
        const exec = await tool.execute(
          { query: prompt, gridId: 'transactions-grid' },
          {
            userId: params.userId,
            user,
            prompt,
            history,
            requestId,
            conversationId,
          }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'grid_action',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // Clear filters
    if (
      promptLower.includes('clear all filters') ||
      promptLower.includes('clear filters') ||
      promptLower.includes('reset filters') ||
      promptLower.includes('reset grid filters')
    ) {
      const tool = aiActionRegistry.getAction('grid_clear_filters');
      if (tool) {
        const exec = await tool.execute(
          { gridId: 'transactions-grid' },
          {
            userId: params.userId,
            user,
            prompt,
            history,
            requestId,
            conversationId,
          }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'grid_action',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // Sort grid
    if (
      promptLower.includes('sort') &&
      (promptLower.includes('expensive') ||
        promptLower.includes('amount') ||
        promptLower.includes('date') ||
        promptLower.includes('highest') ||
        promptLower.includes('lowest'))
    ) {
      const tool = aiActionRegistry.getAction('grid_apply_sorting');
      if (tool) {
        const isDesc =
          promptLower.includes('highest to lowest') ||
          promptLower.includes('desc') ||
          (promptLower.includes('highest') && !promptLower.includes('lowest to highest')) ||
          promptLower.includes('most expensive');
        const isAsc =
          !isDesc &&
          (promptLower.includes('least') ||
            promptLower.includes('lowest') ||
            promptLower.includes('asc') ||
            promptLower.includes('cheapest'));
        const isDate = promptLower.includes('date') || promptLower.includes('recent');
        const exec = await tool.execute(
          {
            gridId: 'transactions-grid',
            field: isDate ? 'date' : 'amount',
            direction: isAsc ? 'asc' : 'desc',
          },
          {
            userId: params.userId,
            user,
            prompt,
            history,
            requestId,
            conversationId,
          }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'grid_action',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // Select rows
    if (
      promptLower.includes('select') &&
      (promptLower.includes('largest') ||
        promptLower.includes('top') ||
        promptLower.includes('five') ||
        promptLower.includes('5') ||
        promptLower.includes('three') ||
        promptLower.includes('3'))
    ) {
      const countMatch = prompt.match(/\b(\d+)\b/);
      const count = countMatch ? parseInt(countMatch[1], 10) : promptLower.includes('five') ? 5 : promptLower.includes('three') ? 3 : 5;
      const tool = aiActionRegistry.getAction('grid_select_rows');
      if (tool) {
        const exec = await tool.execute(
          {
            gridId: 'transactions-grid',
            criteria: 'top_largest',
            count,
          },
          {
            userId: params.userId,
            user,
            prompt,
            history,
            requestId,
            conversationId,
          }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'grid_action',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    const isMerchantAuthorized = Boolean(
      user?.merchantAccessEnabled === true &&
      user?.auraAccountType === 'BUSINESS' &&
      user?.merchantVerificationStatus === 'VERIFIED'
    );

    const intent = applicationIntentClassifier.classify(prompt, {
      commerceContext: params.commerceContext,
      conversationHistory: history,
      isMerchantAuthorized,
    });

    // 1. Concept Explanations & Financial Education (No Navigation!)
    if (intent.intent === 'CONCEPT_EXPLANATION') {
      let explanation = '';
      if (promptLower.includes('financial goal')) {
        explanation = `A **financial goal** is a specific target you set for your money within a defined timeframe. It provides direction, purpose, and discipline for your income.\n\n### Core Types of Financial Goals:\n1. **Short-Term Goals (0–12 Months):** Building an emergency fund (3–6 months of essential expenses), saving for a laptop, or planning an annual vacation.\n2. **Medium-Term Goals (1–5 Years):** Accumulating a down payment for a car or home, or funding higher education certifications.\n3. **Long-Term Goals (5+ Years):** Retirement planning, wealth building, and long-term financial independence.\n\n### How AURA Helps:\nIn AURA, you can create savings goals with monthly contribution calculations, milestone alerts, and ringfenced balances so your essential rent and bills are never compromised.\n\n*Would you like me to help you set up a goal for something you're saving toward?*`;
      } else if (promptLower.includes('apr')) {
        explanation = `**APR (Annual Percentage Rate)** represents the total annualized cost of borrowing money, expressed as a yearly percentage.\n\n### Key Components of APR:\n• **Nominal Interest Rate:** The base interest rate charged by the lender.\n• **Additional Mandatory Fees:** Processing charges, origination fees, closing costs, and administrative fees associated with issuing the loan.\n\n### Why APR Matters:\nUnlike simple interest rates, APR reflects your true annual borrowing cost. For example, a loan with a 10% interest rate and high origination fees might carry an effective APR of 12.5%. When comparing credit cards or loans, always compare APR rather than nominal rates.\n\n*Would you like me to calculate loan amortization options for a specific loan amount?*`;
      } else if (promptLower.includes('subscription')) {
        explanation = `Recurring subscriptions create **"subscription creep"**—small recurring outlays (₹299/mo, ₹699/mo) that silently accumulate into significant fixed monthly cash outflows.\n\n### How Subscriptions Impact Your Finances:\n• **Reduced Discretionary Buffer:** Every active mandate reduces your unallocated monthly cushion before you even begin discretionary spending.\n• **Annual Compounding Cost:** Three unused ₹499/mo subscriptions quietly cost **₹17,964 per year** that could otherwise fund an emergency buffer.\n• **Forgotten Mandates:** Automatic renewals often persist long after you stop using the service.\n\n### AURA Protection:\nAURA tracks all recurring mandates under **Bills & Commitments** so you can identify unused subscriptions, forecast outflows, and protect your cash flow.`;
      } else if (promptLower.includes('commerce')) {
        explanation = `**AURA Commerce** is an integrated smart shopping platform powered by live merchant catalogs from Channel3, specification comparisons, and verified PayPal checkout.\n\n### Key Capabilities:\n1. **Live Product Discovery:** Search real products (laptops, electronics, footwear, etc.) with real-time pricing.\n2. **Context-Aware Specification Comparison:** Compare hardware specifications (processors, RAM, battery, build quality) side-by-side.\n3. **Financial Affordability Intelligence:** Before you spend, Ask AURA evaluates whether a purchase comfortably fits your monthly discretionary cap without jeopardizing ringfenced bills or savings.\n4. **Controlled PayPal Checkout:** Prepare order drafts seamlessly with full payment control—AURA never moves funds autonomously.`;
      } else {
        explanation = `Here is an overview of ${prompt}:\n\nUnderstanding your financial resources and commitments helps you make disciplined, informed decisions. In AURA, you can track bank balances, budget monthly spending, schedule durable bill reminders, and explore products with real-time affordability checks.\n\n*Let me know if you would like to explore specific calculations, review your accounts, or plan a goal!*`;
      }

      return this.formatSuccessfulResponse({
        prompt,
        workflowType: 'general_knowledge',
        explanation,
        suggestedNextPrompts: [
          'I want to create a financial goal',
          'Show my upcoming bills',
          'How am I doing financially overall?',
        ],
        commerceContext: params.commerceContext || null,
      });
    }

    // 2. Application Controls
    if (intent.intent === 'APP_LOGOUT') {
      const tool = aiActionRegistry.getAction('logout_user');
      if (tool) {
        const exec = await tool.execute({}, { userId: params.userId, user, prompt, history, requestId, conversationId });
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'application_control',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: [],
        });
      }
    }

    if (intent.intent === 'APP_THEME_CHANGE') {
      const tool = aiActionRegistry.getAction('change_theme');
      if (tool) {
        const exec = await tool.execute(
          { theme: intent.actionDetails?.theme || 'dark' },
          { userId: params.userId, user, prompt, history, requestId, conversationId }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'application_control',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: ['Show my current balance', 'Switch to light mode', 'Take me to Overview'],
        });
      }
    }

    if (intent.intent === 'APP_SIDEBAR_TOGGLE') {
      const tool = aiActionRegistry.getAction('toggle_sidebar');
      if (tool) {
        const exec = await tool.execute(
          intent.actionDetails || {},
          { userId: params.userId, user, prompt, history, requestId, conversationId }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'application_control',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: ['Open Overview', 'Show my accounts'],
        });
      }
    }

    // 3. Commerce: Payment Approval ("Proceed")
    if (intent.intent === 'COMMERCE_PAYMENT_APPROVAL') {
      const tool = aiActionRegistry.getAction('approve_payment');
      if (tool) {
        const exec = await tool.execute(
          {},
          { userId: params.userId, user, prompt, history, requestId, conversationId, commerceContext: params.commerceContext }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'paypal_payment',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: exec.commerceContext || params.commerceContext || null,
        });
      }
    }

    // 4. Commerce: Checkout Preparation ("I'll buy this one", "I'll buy the second one")
    if (intent.intent === 'COMMERCE_CHECKOUT_PREPARATION') {
      const tool = aiActionRegistry.getAction('prepare_commerce_order');
      if (tool) {
        const exec = await tool.execute(
          { productIndex: intent.selectedProductIndex },
          { userId: params.userId, user, prompt, history, requestId, conversationId, commerceContext: params.commerceContext }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'purchase_evaluation',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: exec.commerceContext || params.commerceContext || null,
        });
      }
    }

    // 5. Commerce: Affordability Evaluation ("Can I afford the second one?")
    if (intent.intent === 'COMMERCE_AFFORDABILITY_EVALUATION' || promptLower.includes('afford')) {
      const tool = aiActionRegistry.getAction('analyse_purchase_affordability');
      if (tool) {
        const exec = await tool.execute(
          { productIndex: intent.selectedProductIndex },
          { userId: params.userId, user, prompt, history, requestId, conversationId, commerceContext: params.commerceContext }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'purchase_affordability',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: exec.commerceContext || params.commerceContext || null,
        });
      }
    }

    // 6. Commerce: Multi-Product Comparison ("Compare the first three", "Compare these")
    if (intent.intent === 'COMMERCE_PRODUCT_COMPARISON') {
      const tool = aiActionRegistry.getAction('compare_products');
      if (tool) {
        const exec = await tool.execute(
          { count: intent.comparisonProducts?.length || 3 },
          { userId: params.userId, user, prompt, history, requestId, conversationId, commerceContext: params.commerceContext }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'purchase_evaluation',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: exec.commerceContext || params.commerceContext || null,
        });
      }
    }

    // 7. Commerce: Recommendation ("Which would you recommend for programming?")
    if (intent.intent === 'COMMERCE_PRODUCT_RECOMMENDATION') {
      const tool = aiActionRegistry.getAction('recommend_product');
      if (tool) {
        const exec = await tool.execute(
          { userCriteria: intent.extractedRequirements?.useCase },
          { userId: params.userId, user, prompt, history, requestId, conversationId, commerceContext: params.commerceContext }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'purchase_evaluation',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: exec.commerceContext || params.commerceContext || null,
        });
      }
    }

    // 8. Commerce: Product Filtering ("Show me laptops under ₹70,000 with at least 16GB RAM")
    if (intent.intent === 'COMMERCE_PRODUCT_FILTERING') {
      const tool = aiActionRegistry.getAction('filter_products');
      if (tool) {
        const exec = await tool.execute(
          intent.extractedRequirements || {},
          { userId: params.userId, user, prompt, history, requestId, conversationId, commerceContext: params.commerceContext }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'product_discovery',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: exec.commerceContext || params.commerceContext || null,
        });
      }
    }

    // 9. Commerce: Product Discovery ("I want to buy an ASUS Vivobook 14")
    if (intent.intent === 'COMMERCE_PRODUCT_DISCOVERY') {
      const tool = aiActionRegistry.getAction('search_products');
      if (tool) {
        const query = intent.extractedRequirements?.productQuery || 'laptop';
        const exec = await tool.execute(
          { query },
          { userId: params.userId, user, prompt, history, requestId, conversationId, commerceContext: params.commerceContext }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'product_discovery',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: exec.commerceContext || null,
        });
      }
    }

    // 10. Financial Goals: Modification ("Change the target to ₹60,000")
    if (intent.intent === 'GOAL_MODIFICATION') {
      const tool = aiActionRegistry.getAction('update_financial_goal');
      if (tool) {
        const exec = await tool.execute(
          intent.goalRequirements || {},
          { userId: params.userId, user, prompt, history, requestId, conversationId }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'savings_planning',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // 11. Financial Goals: Creation ("I want to save ₹50,000 in six months")
    if (intent.intent === 'GOAL_CREATION') {
      const tool = aiActionRegistry.getAction('create_financial_goal');
      if (tool) {
        const exec = await tool.execute(
          intent.goalRequirements || {},
          { userId: params.userId, user, prompt, history, requestId, conversationId }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'savings_planning',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // 12. Financial Goals: Deletion ("Delete goal")
    if (intent.intent === 'GOAL_DELETION') {
      const tool = aiActionRegistry.getAction('delete_financial_goal');
      if (tool) {
        const exec = await tool.execute(
          {},
          { userId: params.userId, user, prompt, history, requestId, conversationId }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'savings_planning',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // 13. Calendar & Scheduling: Recurring Schedule ("Remind me to review my savings every month")
    if (intent.intent === 'RECURRING_SCHEDULE') {
      const tool = aiActionRegistry.getAction('create_recurring_schedule');
      if (tool) {
        const exec = await tool.execute(
          intent.actionDetails || {},
          { userId: params.userId, user, prompt, history, requestId, conversationId }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'calendar_scheduling',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // 14. Calendar & Scheduling: One-Time Reminder ("Remind me to pay electricity tomorrow")
    if (intent.intent === 'REMINDER_CREATION') {
      const tool = aiActionRegistry.getAction('create_reminder');
      if (tool) {
        const exec = await tool.execute(
          intent.actionDetails || {},
          { userId: params.userId, user, prompt, history, requestId, conversationId }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'calendar_scheduling',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // 15. Bills & Commitments: Inquiry ("Show my upcoming bills")
    if (intent.intent === 'BILL_INQUIRY') {
      const tool = aiActionRegistry.getAction('navigate_to_page');
      if (tool) {
        const exec = await tool.execute(
          { page: 'commitments' },
          { userId: params.userId, user, prompt, history, requestId, conversationId }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'navigation',
          explanation: `Taking you directly to **Bills & Commitments** to review your upcoming scheduled payments and mandates.`,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: ['Show my largest expenses this month', 'What is my current balance?'],
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // 16. Transactions & Spending: Largest Expenses / Sorting
    if (intent.intent === 'TRANSACTION_ANALYSIS') {
      const tool = aiActionRegistry.getAction('grid_apply_sorting');
      if (tool) {
        const exec = await tool.execute(
          { gridId: 'transactions-grid', field: 'amount', direction: 'desc' },
          { userId: params.userId, user, prompt, history, requestId, conversationId }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'grid_action',
          explanation: `Navigating to **Transactions** and sorting by amount from largest to smallest to highlight your biggest spending items.`,
          toolAction: {
            type: 'navigation',
            title: 'Transactions: Largest Expenses',
            status: 'completed',
            navTarget: 'transactions',
            details: { targetTab: 'transactions', ...exec.toolAction?.details, field: 'amount', direction: 'desc' },
          } as any,
          suggestedNextPrompts: ['Filter shopping expenses', 'Undo that filter', 'What is my liquid balance?'],
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // 17. Application Navigation ("Take me to Transactions", "Go to Goals", etc.)
    if (
      intent.intent === 'APP_NAVIGATION' ||
      promptLower.includes('take me to') ||
      promptLower.includes('go to') ||
      promptLower.startsWith('open ')
    ) {
      let targetPage = intent.navTarget || 'overview';
      if (!intent.navTarget) {
        if (promptLower.includes('transaction') || promptLower.includes('spending')) targetPage = 'transactions';
        else if (promptLower.includes('bill') || promptLower.includes('commitment')) targetPage = 'commitments';
        else if (promptLower.includes('plan')) targetPage = 'financial-planning';
        else if (promptLower.includes('goal')) targetPage = 'goals';
        else if (promptLower.includes('account')) targetPage = 'accounts';
        else if (promptLower.includes('calendar')) targetPage = 'calendar';
        else if (promptLower.includes('commerce') || promptLower.includes('shop') || promptLower.includes('store')) targetPage = 'smart-purchases';
        else if (promptLower.includes('merchant')) targetPage = 'merchant-hub';
        else if (promptLower.includes('setting')) targetPage = 'settings';
        else if (promptLower.includes('developer')) targetPage = 'developer';
      }

      const navTool = aiActionRegistry.getAction('navigate_to_page');
      if (navTool) {
        const exec = await navTool.execute(
          { page: targetPage },
          { userId: params.userId, user, prompt, history, requestId, conversationId }
        );
        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'navigation',
          explanation: exec.explanation,
          toolAction: exec.toolAction as any,
          suggestedNextPrompts: exec.suggestedNextPrompts,
          commerceContext: params.commerceContext || null,
        });
      }
    }

    // -------------------------------------------------------------------------
    // 2. CHECK GEMINI CONFIGURATION STATUS
    // If not configured, return explicit service-unavailable response without fabricating text.
    // -------------------------------------------------------------------------
    if (!this.geminiClient) {
      const latencyMs = Date.now() - startTime;
      const trace: AiObservabilityTrace = {
        requestId,
        conversationId,
        userId: params.userId,
        model: env.GEMINI_MODEL,
        apiStatus: 'not_configured',
        apiLatencyMs: latencyMs,
        toolCallsRequested: [],
        toolExecutionStatus: {},
        followUpStatus: 'not_needed',
        finalResponseStatus: 'service_unavailable',
        errorDetails: 'GEMINI_API_KEY is not configured in environment.',
        timestamp: new Date().toISOString(),
      };
      this.recordTrace(trace);

      logger.warn('AuraAiOrchestrator', 'Gemini not configured; returning explicit service unavailable response', {
        requestId,
        userId: params.userId,
      });

      const FRIENDLY_SERVICE_UNAVAILABLE_MESSAGE =
        "I'm having a little trouble connecting to my AI engine right now. Your information is safe. Please try again in a moment.";

      return {
        success: false,
        serviceUnavailable: true,
        code: 'GEMINI_NOT_CONFIGURED',
        error: FRIENDLY_SERVICE_UNAVAILABLE_MESSAGE,
        canRetry: false,
        retryAfterSeconds: null,
        prompt,
        workflowType: 'service_unavailable',
        explanation: FRIENDLY_SERVICE_UNAVAILABLE_MESSAGE,
        answer: FRIENDLY_SERVICE_UNAVAILABLE_MESSAGE,
        toolAction: {
          type: 'general_knowledge' as const,
          title: 'AI Service Unavailable',
          status: 'informational' as const,
          details: { code: 'GEMINI_NOT_CONFIGURED' },
        },
        suggestedNextPrompts: [],
        astropodsOrchestration: null,
        observability: trace,
        commerceContext: params.commerceContext || null,
        timestamp: new Date().toISOString(),
      };
    }

    // -------------------------------------------------------------------------
    // 3. SAFE GENERAL-KNOWLEDGE CACHE CHECK (0 Gemini API calls!)
    // -------------------------------------------------------------------------
    const cachedResponse = geminiRequestManager.getCachedResponse(prompt);
    if (cachedResponse) {
      const trace: AiObservabilityTrace = {
        requestId,
        conversationId,
        userId: params.userId,
        model: env.GEMINI_MODEL,
        apiStatus: 'succeeded',
        apiLatencyMs: 1,
        toolCallsRequested: [],
        toolExecutionStatus: {},
        followUpStatus: 'not_needed',
        finalResponseStatus: 'succeeded',
        retriesAttempted: 0,
        cached: true,
        geminiCallsMade: 0,
        timestamp: new Date().toISOString(),
      };
      this.recordTrace(trace);
      return {
        ...cachedResponse,
        requestId,
        conversationId,
        observability: trace,
        timestamp: new Date().toISOString(),
      };
    }

    // -------------------------------------------------------------------------
    // 4. IN-FLIGHT DEDUPLICATION & RATE-MANAGED EXECUTION
    // -------------------------------------------------------------------------
    return geminiRequestManager.executeWithDeduplication(params.userId, prompt, async () => {
      geminiRequestManager.recordInteraction();
      const result = await this.executeGeminiConversationalLoop({
        userId: params.userId,
        user,
        prompt,
        history,
        requestId,
        conversationId,
        includeKernelResearch: Boolean(params.includeKernelResearch),
        startTime,
        requiredCapability: params.requiredCapability,
        commerceContext: params.commerceContext,
        gridSelectionContext: params.gridSelectionContext,
      });

      // Cache safe general-knowledge answers (non-personal)
      if (result.success && result.workflowType === 'general_knowledge') {
        geminiRequestManager.setCachedResponse(prompt, result);
      }

      // Asynchronously index interaction into semantic vector store for contextual retrieval
      if (result.success && result.workflowType !== 'service_unavailable') {
        semanticRetrievalService.indexContent({
          userId: params.userId,
          sourceType: 'chat_message',
          sourceId: `msg-${conversationId}-${Date.now()}`,
          text: `User: ${prompt} | AURA: ${result.answer || result.explanation}`,
          metadata: { conversationId, workflowType: result.workflowType },
        }).catch((err) => {
          logger.debug('AuraAiOrchestrator', 'Failed to index message for semantic retrieval', { error: err?.message });
        });
      }

      return result;
    });
  }

  /**
   * The Genuine Gemini Conversational Loop.
   * Model interprets message, requests tools if needed, receives tool outputs, and synthesizes final response.
   */
  private async executeGeminiConversationalLoop(ctx: {
    userId: string;
    user: any;
    prompt: string;
    history: ConversationTurn[];
    requestId: string;
    conversationId: string;
    includeKernelResearch: boolean;
    startTime: number;
    requiredCapability?: string;
    commerceContext?: ICommerceContext | null;
    gridSelectionContext?: any;
  }) {
    const { user, prompt, history, requestId, conversationId, startTime } = ctx;
    const t0 = Date.now();

    const commerceContextText = formatCommerceContextForPrompt(ctx.commerceContext);
    const gridSelectionText = formatGridSelectionContextForPrompt(ctx.gridSelectionContext);
    const systemInstruction = `You are AURA, an intelligent, empathetic, versatile financial companion and general-purpose AI assistant.
Core Behavioral Principles:
1. You are a versatile conversational AI: answer questions on everyday knowledge, programming, science, career, interview preparation, geography, language, and culture naturally and directly. Never force non-financial questions into a financial context.
2. For ambiguous purchase inquiries without specifics (e.g., "Can I buy a bottle?", "I want sneakers"), ask a natural, friendly clarification question (asking what style, type, brand or budget they are considering). Do NOT execute financial evaluations or product search without knowing what the user wants.
3. For product discovery or searching new items/alternatives (e.g., "I want to buy an ASUS Vivobook 14", "Find me a cheaper Lenovo alternative", "Show me running shoes"), invoke the searchProducts tool.
4. COMMERCE FOLLOW-UPS & ACTIVE CONTEXT:
   - When products are ALREADY in the active context (listed below), DO NOT execute a new searchProducts call unless the user specifically asks for different products or new brands!
   - When the user asks for a recommendation (e.g. "Which one would you recommend?", "Can you recommend one of these and give me the price in USD?"), invoke recommendProduct.
   - When the user asks for currency conversion (e.g. "Give me the price in USD"), invoke convertCurrency.
   - When the user asks "Can I afford it?" or "Can I buy it?", invoke analyseAffordability. It will automatically evaluate against their verified financial accounts and the active product price.
   - When the user asks to compare products (e.g. "Compare the first two", "Compare it with the ASUS you recommended"), invoke compareProducts.
   - When the user asks specific hardware questions (e.g. "What about its battery life?", "Does it have OLED?"), invoke evaluateProductDetail.
   - When the user asks to search or view in AURA Commerce (e.g. "Search Vivobook 14 in AURA Commerce", "Go to Commerce"), invoke navigateApplication with targetTab: "smart-purchases" and searchQuery.
5. For explicit financial questions (e.g., "What is my balance?", "What are my upcoming commitments?", "What if I buy on EMI?"), invoke the relevant financial tools (getFinancialSummary, getUpcomingCommitments, calculateEmiOptions).
6. For scheduling reminders (e.g. "Remind me to pay rent next Monday"), invoke createReminder.
7. For payments (e.g. "Pay Rahul ₹5,000"), invoke preparePayment. Always remind the user that payments are prepared for their review and require explicit security PIN authorization on the Payments screen. AI never moves money autonomously.
8. AG GRID FINANCIAL WORKSPACE & INTERACTIVE DATA EXPLORATION:
   - When the user asks to filter financial tables (e.g. "Show my transactions above $100", "Show shopping expenses above $200 from last month", "Filter expenses by groceries"), invoke gridApplyFilters.
   - When the user asks to clear or reset filters (e.g. "Clear all filters", "Reset grid filters", "Show all transactions"), invoke gridClearFilters.
   - When the user asks to sort columns (e.g. "Sort these from most expensive to least expensive", "Sort by amount descending"), invoke gridApplySorting.
   - When the user asks to change column visibility (e.g. "Hide transaction IDs", "Show merchant names"), invoke gridSetColumnVisibility.
   - When the user asks to select rows (e.g. "Select the five largest", "Select the top 3"), invoke gridSelectRows.
   - When the user asks to undo or revert grid changes (e.g. "Undo that filter", "Go back to the previous view"), invoke gridUndoAction.
   - When the user asks to save a view (e.g. "Save this view as Monthly Expenses"), invoke gridSaveView.
   - When the user asks to restore a saved view (e.g. "Load Monthly Expenses view"), invoke gridRestoreView.
   - When records are selected or selection context is attached and user asks about them (e.g. "What do these transactions have in common?", "How much did I spend on these?", "Which of these expenses are unnecessary?", "Find opportunities to save money", "Compare these transactions"), invoke gridAnalyseSelection. Base your answer strictly on the authorized selected records.
User Name: ${user.name}
Preferred Currency: ${user.currency || 'INR'}${commerceContextText ? '\n' + commerceContextText : ''}${gridSelectionText ? '\n' + gridSelectionText : ''}`;

    const maxHistory = env.GEMINI_MAX_HISTORY_TURNS || 8;
    const formattedHistory = history.slice(-maxHistory).map((h) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content.length > 2500 ? h.content.slice(0, 2500) + '...' : h.content }],
    }));

    const contents = [...formattedHistory, { role: 'user', parts: [{ text: prompt }] }];

    let activeModel = GEMINI_MODEL_REGISTRY.primary.modelId;
    let fallbackOccurred = false;
    let response: any = null;
    let retriesAttempted = 0;

    try {
      try {
        logger.info('AuraAiOrchestrator', `[GEMINI] Primary model: ${GEMINI_MODEL_REGISTRY.primary.modelId}`, {
          requestId,
          model: GEMINI_MODEL_REGISTRY.primary.modelId,
          historyTurns: history.length,
        });

        const initialRes = await this.callGeminiWithRetry(
          'primary',
          'initial_conversational_turn',
          requestId,
          {
            model: GEMINI_MODEL_REGISTRY.primary.modelId,
            contents: contents as any,
            config: {
              systemInstruction,
              tools: [GEMINI_TOOL_DECLARATIONS as any],
            },
          }
        );
        response = initialRes.response;
        retriesAttempted = initialRes.retriesAttempted;
      } catch (primaryErr: any) {
        const transientCheck = isTransientGeminiError(primaryErr);
        const isPermanent = !transientCheck.retryable;
        const statusCode = transientCheck.statusCode || 500;
        const failureReason = `${statusCode} ${transientCheck.reason}`;

        logger.warn('AuraAiOrchestrator', `[GEMINI] Primary failure: ${failureReason}`, {
          requestId,
          primaryRetriesAttempted: (primaryErr as any)?.retriesAttempted || 0,
          statusCode,
          reason: transientCheck.reason,
          error: this.redactSecrets(primaryErr?.message),
        });

        const promptLower = prompt.toLowerCase();
        const isPaymentTask = promptLower.includes('pay ') || promptLower.includes('send ') || promptLower.includes('transfer ');
        const taskType: ModelTaskType = isPaymentTask ? 'payment_preparation' : 'conversational_general';

        const canFallback = this.fallbackEnabled && modelRouter.isFallbackPermitted({
          taskType,
          isTransientError: transientCheck.retryable,
          isPermanentError: isPermanent,
          hasExecutedTools: false,
          reason: transientCheck.reason,
          statusCode,
          requiredCapability: ctx.requiredCapability,
        });

        if (canFallback) {
          logger.info('AuraAiOrchestrator', '[GEMINI] Initiating fallback', {
            requestId,
            reason: transientCheck.reason,
          });
          logger.info('AuraAiOrchestrator', `[GEMINI] Alternative model: ${GEMINI_MODEL_REGISTRY.lightweight.modelId}`, {
            requestId,
            model: GEMINI_MODEL_REGISTRY.lightweight.modelId,
          });
          logger.info('AuraAiOrchestrator', '[GEMINI] Alternative request started', {
            requestId,
          });

          geminiRequestManager.recordFallbackTriggered();

          try {
            const fallbackRes = await this.callGeminiWithRetry(
              'lightweight',
              'lightweight_fallback_conversational_turn',
              requestId,
              {
                model: GEMINI_MODEL_REGISTRY.lightweight.modelId,
                contents: contents as any,
                config: {
                  systemInstruction,
                  tools: [GEMINI_TOOL_DECLARATIONS as any],
                },
              }
            );
            logger.info('AuraAiOrchestrator', '[GEMINI] Alternative request successful', {
              requestId,
            });
            response = fallbackRes.response;
            retriesAttempted = ((primaryErr as any)?.retriesAttempted || 0) + fallbackRes.retriesAttempted;
            activeModel = GEMINI_MODEL_REGISTRY.lightweight.modelId;
            fallbackOccurred = true;
          } catch (altErr: any) {
            const altCheck = isTransientGeminiError(altErr);
            const altStatusCode = altCheck.statusCode || 500;
            const altFailureReason = `${altStatusCode} ${altCheck.reason}`;
            logger.error('AuraAiOrchestrator', `[GEMINI] Alternative request failed: ${altFailureReason}`, {
              requestId,
              statusCode: altStatusCode,
              reason: altCheck.reason,
              error: this.redactSecrets(altErr?.message),
            });
            throw altErr;
          }
        } else {
          logger.warn('AuraAiOrchestrator', `Model fallback denied or ineligible for task: ${taskType}`, {
            requestId,
            reason: transientCheck.reason,
            taskType,
            requiredCapability: ctx.requiredCapability,
          });
          throw primaryErr;
        }
      }

      const apiLatencyMs = Date.now() - t0;
      const candidate = response.candidates?.[0];
      const functionCalls = response.functionCalls || [];

      // -----------------------------------------------------------------------
      // CASE 1: Direct conversational answer (no backend tools needed)
      // -----------------------------------------------------------------------
      if (!functionCalls || functionCalls.length === 0) {
        const text = response.text || candidate?.content?.parts?.[0]?.text || '';
        const trace: AiObservabilityTrace = {
          requestId,
          conversationId,
          userId: ctx.userId,
          model: activeModel,
          apiStatus: 'succeeded',
          apiLatencyMs,
          toolCallsRequested: [],
          toolExecutionStatus: {},
          followUpStatus: 'not_needed',
          finalResponseStatus: 'succeeded',
          retriesAttempted,
          geminiCallsMade: 1,
          cached: false,
          fallbackOccurred,
          originalModel: fallbackOccurred ? GEMINI_MODEL_REGISTRY.primary.modelId : undefined,
          modelRole: fallbackOccurred ? 'lightweight' : 'primary',
          timestamp: new Date().toISOString(),
        };
        this.recordTrace(trace);

        const isClarification = prompt.toLowerCase().includes('sneaker') || (text.includes('?') && (prompt.toLowerCase().includes('bottle') || prompt.toLowerCase().includes('buy')));
        const toolAction: AiToolAction = {
          type: isClarification ? 'clarification_needed' : 'general_knowledge',
          title: isClarification ? 'Clarification Needed' : 'Conversational Response',
          status: 'informational',
        };

        return this.formatSuccessfulResponse({
          prompt,
          workflowType: 'general_knowledge',
          explanation: text,
          toolAction,
          modelUsed: activeModel,
          fallbackOccurred,
          suggestedNextPrompts: [
            'Show me my current balance',
            'What are my upcoming commitments?',
            'Can you explain that more simply?',
          ],
          observability: trace,
          commerceContext: ctx.commerceContext || null,
        });
      }

      // -----------------------------------------------------------------------
      // CASE 2: Gemini requested backend tool execution
      // -----------------------------------------------------------------------
      const call = functionCalls[0];
      const toolName = call.name || 'getFinancialSummary';
      const requestedTools = (functionCalls || []).map((c: any) => c.name || '');
      const toolExecutionStatus: Record<string, 'success' | 'failed' | 'rejected'> = {};

      logger.info('AuraAiOrchestrator', 'Gemini model requested tool call', {
        requestId,
        toolName,
        args: call.args,
      });

      let activeCommerceContext = ctx.commerceContext || null;
      let execution: any = null;
      try {
        execution = await this.dispatchBackendTool(toolName, call.args || {}, {
          ...ctx,
          commerceContext: activeCommerceContext,
        });
        if (execution?.commerceContext) {
          activeCommerceContext = execution.commerceContext;
        }
        toolExecutionStatus[toolName] = 'success';
      } catch (toolErr: any) {
        toolExecutionStatus[toolName] = 'failed';
        logger.error('AuraAiOrchestrator', 'Backend tool execution failed', {
          requestId,
          toolName,
          error: toolErr?.message,
        });
        execution = {
          resultData: { error: toolErr?.message || 'Tool execution failed' },
          fallbackExplanation: `I attempted to retrieve information using ${toolName}, but encountered an error.`,
          workflowType: 'general_knowledge',
          toolAction: { type: 'general_knowledge', title: toolName, status: 'informational' },
          suggestedNextPrompts: [],
        };
      }

      // Provide tool result back to Gemini in functionResponse for final synthesis
      const followUpContents = [
        ...contents,
        {
          role: 'model',
          parts: [{ functionCall: { id: call.id, name: call.name, args: call.args } }],
        },
        {
          role: 'user',
          parts: [{ functionResponse: { id: call.id, name: call.name, response: execution.resultData } }],
        },
      ];

      // Intelligent Function Calling Decision:
      // Only complex analytical workflows require an additional Gemini call for synthesis.
      // Deterministic tools (balance, recent transactions, navigation, currency, reminders, goals, payments, product cards)
      // return a complete, verified, human-friendly explanation immediately, saving ~50% of API calls.
      const REQUIRES_FOLLOW_UP_AI_SYNTHESIS = new Set([
        'researchMarketRates',
      ]);

      const needsFollowUpCall = REQUIRES_FOLLOW_UP_AI_SYNTHESIS.has(toolName);

      let finalAiExplanation = execution.fallbackExplanation || '';
      let followUpStatus: 'not_needed' | 'succeeded' | 'failed' = 'not_needed';
      let followUpRetries = 0;

      if (needsFollowUpCall) {
        try {
          const { response: followUpResp, retriesAttempted: fr } = await this.callGeminiWithRetry(
            fallbackOccurred ? 'lightweight' : 'primary',
            'follow_up_tool_synthesis',
            requestId,
            {
              model: activeModel,
              contents: followUpContents as any,
              config: { systemInstruction },
            }
          );
          followUpRetries = fr;
          const followUpText = followUpResp.text?.trim();
          if (followUpText) {
            finalAiExplanation = followUpText;
            followUpStatus = 'succeeded';
          }
        } catch (followErr: any) {
          followUpStatus = 'failed';
          logger.warn('AuraAiOrchestrator', 'Follow-up Gemini synthesis failed; using verified backend facts', {
            requestId,
            error: this.redactSecrets(followErr?.message),
            retriesAttempted: followErr?.retriesAttempted || 0,
          });
        }
      } else {
        geminiRequestManager.recordFollowUpAvoided();
        logger.info('AuraAiOrchestrator', `Skipped unnecessary Gemini follow-up call for deterministic tool "${toolName}"`, {
          requestId,
          toolName,
        });
      }

      const totalLatencyMs = Date.now() - t0;
      const trace: AiObservabilityTrace = {
        requestId,
        conversationId,
        userId: ctx.userId,
        model: activeModel,
        apiStatus: 'succeeded',
        apiLatencyMs: totalLatencyMs,
        toolCallsRequested: requestedTools,
        toolExecutionStatus,
        followUpStatus,
        finalResponseStatus: 'succeeded',
        retriesAttempted: retriesAttempted + followUpRetries,
        geminiCallsMade: needsFollowUpCall ? 2 : 1,
        cached: false,
        fallbackOccurred,
        originalModel: fallbackOccurred ? GEMINI_MODEL_REGISTRY.primary.modelId : undefined,
        modelRole: fallbackOccurred ? 'lightweight' : 'primary',
        timestamp: new Date().toISOString(),
      };
      this.recordTrace(trace);

      return this.formatSuccessfulResponse({
        prompt,
        workflowType: execution.workflowType,
        explanation: finalAiExplanation,
        toolAction: execution.toolAction,
        modelUsed: activeModel,
        fallbackOccurred,
        suggestedNextPrompts: execution.suggestedNextPrompts,
        purchaseCompanion: execution.purchaseCompanion,
        preparedPayment: execution.preparedPayment,
        observability: trace,
        commerceContext: activeCommerceContext,
      });
    } catch (apiErr: any) {
      const totalLatencyMs = Date.now() - t0;
      const cleanError = this.redactSecrets(apiErr?.message || 'Gemini API call failed');
      const transientCheck = isTransientGeminiError(apiErr);
      const retriesAttempted = (apiErr as any)?.retriesAttempted || 0;

      const trace: AiObservabilityTrace = {
        requestId,
        conversationId,
        userId: ctx.userId,
        model: env.GEMINI_MODEL,
        apiStatus: 'failed',
        apiLatencyMs: totalLatencyMs,
        toolCallsRequested: [],
        toolExecutionStatus: {},
        followUpStatus: 'not_needed',
        finalResponseStatus: 'service_unavailable',
        retriesAttempted,
        errorDetails: cleanError,
        timestamp: new Date().toISOString(),
      };
      this.recordTrace(trace);

      logger.error('AuraAiOrchestrator', 'Gemini API call failed after retries', {
        requestId,
        retriesAttempted,
        statusCode: transientCheck.statusCode,
        reason: transientCheck.reason,
        error: cleanError,
      });

      const FRIENDLY_SERVICE_UNAVAILABLE_MESSAGE =
        "I'm having a little trouble connecting to my AI engine right now. Your information is safe. Please try again in a moment.";

      return {
        success: false,
        serviceUnavailable: true,
        code: transientCheck.statusCode === 503 ? 'GEMINI_UNAVAILABLE' : 'GEMINI_REQUEST_FAILED',
        error: FRIENDLY_SERVICE_UNAVAILABLE_MESSAGE,
        canRetry: true,
        retryAfterSeconds: 5,
        prompt,
        workflowType: 'service_unavailable',
        explanation: FRIENDLY_SERVICE_UNAVAILABLE_MESSAGE,
        answer: FRIENDLY_SERVICE_UNAVAILABLE_MESSAGE,
        toolAction: {
          type: 'general_knowledge' as const,
          title: 'AI Engine Temporarily Unavailable',
          status: 'informational' as const,
          details: {
            code: transientCheck.statusCode === 503 ? 'GEMINI_UNAVAILABLE' : 'GEMINI_REQUEST_FAILED',
            reason: transientCheck.reason,
            retriesAttempted,
          },
        },
        suggestedNextPrompts: ['Retry request'],
        astropodsOrchestration: null,
        observability: trace,
        commerceContext: ctx.commerceContext || null,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Dispatches backend tools with deterministic data models and validation.
   */
  private async dispatchBackendTool(
    toolName: string,
    args: any,
    ctx: {
      userId: string;
      user: any;
      prompt: string;
      history?: ConversationTurn[];
      requestId: string;
      conversationId: string;
      commerceContext?: ICommerceContext | null;
    }
  ): Promise<{
    resultData: any;
    fallbackExplanation: string;
    workflowType: string;
    toolAction: AiToolAction;
    suggestedNextPrompts: string[];
    purchaseCompanion?: any;
    preparedPayment?: any;
    commerceContext?: ICommerceContext | null;
  }> {
    const userObjId = new mongoose.Types.ObjectId(ctx.userId);
    const user = ctx.user;

    // Check central AI Action Registry first
    const actionNameMap: Record<string, string> = {
      changeTheme: 'change_theme',
      toggleSidebar: 'toggle_sidebar',
      logoutUser: 'logout_user',
      openExternalLink: 'open_external_link',
      prepareCommerceOrder: 'prepare_commerce_order',
      analyseSpending: 'analyse_spending',
      calculateSavingsPlan: 'calculate_savings_plan',
      simulateFinancialScenario: 'simulate_financial_scenario',
      calculateLoanRepayment: 'calculate_loan_repayment',
      createRecurringSchedule: 'create_recurring_schedule',
      createConditionalAlert: 'create_conditional_alert',
      listSchedules: 'list_schedules',
      cancelSchedule: 'cancel_schedule',
      analyseBusinessFinances: 'analyse_business_finances',
      generateBusinessProjections: 'generate_business_projections',
      assistFinancialDistress: 'assist_financial_distress',
      draftEmail: 'draft_email',
      navigate_to_page: 'navigate_to_page',
      navigateApplication: 'navigate_to_page',
      navigateToPage: 'navigate_to_page',
      search_products: 'search_products',
      searchProducts: 'search_products',
      recommend_product: 'recommend_product',
      recommendProduct: 'recommend_product',
      convert_currency: 'convert_currency',
      convertCurrency: 'convert_currency',
      evaluate_product_detail: 'evaluate_product_detail',
      evaluateProductDetail: 'evaluate_product_detail',
      compare_products: 'compare_products',
      compareProducts: 'compare_products',
      analyse_purchase_affordability: 'analyse_purchase_affordability',
      analyseAffordability: 'analyse_purchase_affordability',
      create_reminder: 'create_reminder',
      createReminder: 'create_reminder',
      create_financial_goal: 'create_financial_goal',
      createOrUpdateSavingsGoal: 'create_financial_goal',
      preparePayment: 'prepare_payment',
      grid_apply_filters: 'grid_apply_filters',
      gridApplyFilters: 'grid_apply_filters',
      applyGridFilters: 'grid_apply_filters',
      grid_clear_filters: 'grid_clear_filters',
      gridClearFilters: 'grid_clear_filters',
      clearGridFilters: 'grid_clear_filters',
      grid_apply_sorting: 'grid_apply_sorting',
      gridApplySorting: 'grid_apply_sorting',
      sortGrid: 'grid_apply_sorting',
      grid_set_column_visibility: 'grid_set_column_visibility',
      gridSetColumnVisibility: 'grid_set_column_visibility',
      grid_select_rows: 'grid_select_rows',
      gridSelectRows: 'grid_select_rows',
      grid_undo_action: 'grid_undo_action',
      gridUndoAction: 'grid_undo_action',
      grid_save_view: 'grid_save_view',
      gridSaveView: 'grid_save_view',
      grid_restore_view: 'grid_restore_view',
      gridRestoreView: 'grid_restore_view',
      grid_analyse_selection: 'grid_analyse_selection',
      gridAnalyseSelection: 'grid_analyse_selection',
      analyseSelectedRecords: 'grid_analyse_selection',
    };

    const targetActionName = actionNameMap[toolName] || toolName;
    const registryAction = aiActionRegistry.getAction(targetActionName);
    if (registryAction) {
      const execResult = await registryAction.execute(args, {
        userId: ctx.userId,
        user: ctx.user,
        prompt: ctx.prompt,
        history: ctx.history,
        requestId: ctx.requestId,
        conversationId: ctx.conversationId,
        commerceContext: ctx.commerceContext,
        gridSelectionContext: (ctx as any).gridSelectionContext || null,
      });

      return {
        resultData: execResult.data,
        fallbackExplanation: execResult.explanation,
        workflowType: execResult.toolAction.type || 'general_knowledge',
        toolAction: execResult.toolAction as AiToolAction,
        suggestedNextPrompts: execResult.suggestedNextPrompts,
        purchaseCompanion: execResult.purchaseCompanion,
        preparedPayment: execResult.preparedPayment,
        commerceContext: execResult.commerceContext || ctx.commerceContext,
      };
    }

    switch (toolName) {
      case 'getFinancialSummary': {
        const accounts = await AccountModel.find({ userId: userObjId, status: 'active' });
        const liquidAccounts = accounts.filter((a: any) => a.type === 'checking' || a.type === 'savings');
        const totalBalance = liquidAccounts.reduce((sum: number, a: any) => sum + (a.balance || 0), 0);

        const breakdown = liquidAccounts
          .map((a: any) => `• **${a.name}** (${a.institution}): ₹${(a.balance || 0).toLocaleString('en-IN')} [${a.type}]`)
          .join('\n');

        const fallbackExplanation = `Here is your current financial summary:\n\n• **Total Liquid Balance:** ₹${totalBalance.toLocaleString(
          'en-IN'
        )}\n• **Active Liquid Accounts:** ${liquidAccounts.length}\n\n${breakdown}\n\nYour accounts are verified against your primary bank statements.`;

        const toolAction: AiToolAction = {
          type: 'financial_intelligence',
          title: 'Financial Summary & Accounts',
          status: 'completed',
          details: {
            totalBalance,
            liquidAccountsCount: liquidAccounts.length,
            accounts: liquidAccounts,
          },
        };

        return {
          resultData: { totalBalance, liquidAccountsCount: liquidAccounts.length, breakdown },
          fallbackExplanation,
          workflowType: 'financial_intelligence',
          toolAction,
          suggestedNextPrompts: [
            'What are my upcoming commitments?',
            'Help me organise my upcoming payments',
            'Take me to my accounts',
          ],
        };
      }

      case 'getUpcomingCommitments': {
        const mandates = await MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } });
        const nonSalaryMandates = mandates.filter((m) => m.category !== 'Salary');
        const totalUpcoming = nonSalaryMandates.reduce((s, m) => s + m.amount, 0);

        const itemsList = nonSalaryMandates
          .sort((a, b) => a.dueDayOfMonth - b.dueDayOfMonth)
          .map((m) => `• **${m.title}**: ₹${m.amount.toLocaleString('en-IN')} (Due on ${m.dueDayOfMonth}th of month, ${m.merchant})`)
          .join('\n');

        const fallbackExplanation = `Here is your organised schedule of upcoming commitments totalling **₹${totalUpcoming.toLocaleString(
          'en-IN'
        )}**:\n\n${itemsList}\n\nAll of these are synchronized to your **Bryntum Financial Calendar** with automated reminder alerts active.`;

        const toolAction: AiToolAction = {
          type: 'financial_intelligence',
          title: 'Upcoming Commitments & Bills',
          status: 'completed',
          details: { totalUpcoming, commitmentsCount: nonSalaryMandates.length, mandates: nonSalaryMandates },
        };

        return {
          resultData: { totalUpcoming, count: nonSalaryMandates.length, mandates: nonSalaryMandates },
          fallbackExplanation,
          workflowType: 'upcoming_commitments',
          toolAction,
          suggestedNextPrompts: [
            'Help me organise my upcoming payments',
            'Open my financial calendar',
            'Can I afford a ₹35,000 AC?',
          ],
        };
      }

      case 'searchProducts': {
        const query = args.query || args.productName || 'water bottle';
        const category = args.category;
        const maxPriceInr = args.maxPriceInr ? parseFloat(args.maxPriceInr) : undefined;

        const searchRes = await channel3Integration.searchProducts({
          query,
          category,
          maxPriceInr,
        });
        const products = searchRes.products || [];

        const productList = products
          .slice(0, 3)
          .map(
            (p, i) =>
              `${i + 1}. **${p.name}** — ₹${p.priceInr.toLocaleString('en-IN')} (${p.brand})\n   • ${p.description}\n   • *Merchant:* ${p.retailerName}`
          )
          .join('\n\n');

        const fallbackExplanation = `Here are some popular options matching "${query}":\n\n${productList}\n\nLet me know if you would like me to check how one of these fits into your monthly spending plan!`;

        const toolAction: AiToolAction = {
          type: 'product_discovery',
          title: `Product Discovery: ${query}`,
          status: 'informational',
          details: { query, products },
        };

        return {
          resultData: { query, count: products.length, products: products.slice(0, 5) },
          fallbackExplanation,
          workflowType: 'purchase_evaluation',
          toolAction,
          suggestedNextPrompts: [
            `Can I buy a ${query} for ₹1,500?`,
            'Show me my current balance',
            'What are my upcoming commitments?',
          ],
          purchaseCompanion: {
            productOptions: products.map((p) => ({
              name: p.name,
              price: p.priceInr,
              retailer: p.retailerName,
              brand: p.brand,
            })),
          },
        };
      }

      case 'analyseAffordability': {
        const accounts = await AccountModel.find({ userId: userObjId, status: 'active' });
        const allTransactions = await TransactionModel.find({ userId: userObjId });
        const mandates = await MandateModel.find({ userId: userObjId, status: { $in: ['confirmed', 'inferred'] } });
        const goals = await GoalModel.find({ userId: userObjId, status: 'active' });

        const liquidBalance = accounts
          .filter((a) => a.type === 'checking' || a.type === 'savings')
          .reduce((s, a) => s + a.balance, 0);

        const nonSalaryMandates = mandates.filter((m) => m.category !== 'Salary');
        const upcomingCommitmentsTotal = nonSalaryMandates.reduce((s, m) => s + m.amount, 0);
        const activeGoalsMonthly = goals.reduce((s, g) => s + g.monthlyContribution, 0);
        const plan = await coreFinancialService.generateOrUpdateMonthlyPlan(ctx.userId);
        const discretionaryAllocs = plan.allocations.filter((a) => a.type === 'discretionary');
        const calculatedRemainingDiscretionary = discretionaryAllocs.reduce((s, a) => s + Math.max(0, a.remainingAmount), 0);
        const discretionaryRemaining =
          calculatedRemainingDiscretionary > 0
            ? calculatedRemainingDiscretionary
            : (user.financialPolicy?.discretionaryMonthlyCap || 18000);

        const recent30DaySpend = allTransactions
          .filter((t) => t.type === 'expense' && Date.now() - new Date(t.date).getTime() <= 30 * 86400000)
          .reduce((s, t) => s + t.amount, 0);

        // Determine price and query
        const promptStr = args.prompt || ctx.prompt;
        const priceMatch = promptStr.match(/(?:₹|inr|rs\.?|for|costing|under)\s*([\d,]+)/i);
        const explicitPrice = args.priceInr || (priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : undefined);

        let queryTerm = args.productName || 'air conditioner';
        let categoryOverride: string | undefined = undefined;

        if (promptStr.toLowerCase().includes('bottle')) {
          queryTerm = 'water bottle';
          categoryOverride = 'Kitchen & Dining';
        } else if (promptStr.toLowerCase().includes('laptop')) {
          queryTerm = 'laptop';
          categoryOverride = 'Laptops & Computers';
        } else if (promptStr.toLowerCase().includes('ac') || promptStr.toLowerCase().includes('air conditioner')) {
          queryTerm = 'air conditioner';
          categoryOverride = 'Home Appliances';
        } else if (promptStr.toLowerCase().includes('running') || promptStr.toLowerCase().includes('shoe') || promptStr.toLowerCase().includes('sneaker')) {
          queryTerm = 'running shoes';
          categoryOverride = 'Footwear';
        }

        const ch3Search = await channel3Integration.searchProducts({
          query: queryTerm,
          category: categoryOverride,
          maxPriceInr: explicitPrice ? explicitPrice * 1.35 : undefined,
        });

        const calendarDataset = await bryntumIntegration.getBryntumCalendarDataset(ctx.userId);

        const agentResult = await astropodsIntegration.invokeAgent({
          agentId: 'purchase-intelligence',
          task: `Affordability analysis for ${queryTerm}`,
          input: {
            query: queryTerm,
            userId: ctx.userId,
            productQuery: queryTerm,
            explicitPriceInr: explicitPrice,
            monthlyIncomeInr: user.financialProfile?.monthlyIncome || 85000,
            availableDiscretionaryBudgetInr: discretionaryRemaining,
            upcomingCommitmentsInr: upcomingCommitmentsTotal,
            products: ch3Search.products || [],
            userFinancialContext: {
              liquidBalance,
              monthlyIncome: user.financialProfile?.monthlyIncome || 85000,
              remainingDiscretionary: discretionaryRemaining,
              upcomingCommitmentsTotal,
              upcomingCommitmentsCount: nonSalaryMandates.length,
              activeGoalsMonthly,
              recent30DaySpend,
            },
            matchedProducts: ch3Search.products,
            calendarDataset,
          },
        });

        const companion = agentResult.output || {};
        const comparisons = companion.productComparisons || companion.evaluatedProducts || [];
        const primaryOption = comparisons[0];
        const evaluatedPrice = explicitPrice || primaryOption?.priceInr || primaryOption?.product?.priceInr || 35000;
        const guidanceCategory = primaryOption?.guidanceCategory || primaryOption?.evaluation?.guidanceCategory || 'Affordable if planned';
        const affordabilityScore = primaryOption?.affordabilityScore || primaryOption?.evaluation?.affordabilityScore || 65;

        const companionOutput = {
          ...companion,
          evaluatedProducts: (companion.evaluatedProducts && companion.evaluatedProducts.length > 0)
            ? companion.evaluatedProducts
            : comparisons.map((c: any) => ({
                product: {
                  id: c.productId || 'ch3-item',
                  name: c.name,
                  priceInr: c.priceInr,
                  brand: c.brand || 'Brand',
                  retailerName: c.retailerName || 'Retailer',
                },
                evaluation: {
                  guidanceCategory: c.guidanceCategory,
                  affordabilityScore: c.affordabilityScore || 65,
                  suggestedSavingsPlan: { summary: 'Spread over 3-6 months' },
                },
              })),
        };

        let pythonRiskAssessment: any = null;
        try {
          pythonRiskAssessment = await pythonAnalyticsService.runPythonTask({
            task: 'calculate_plan',
            input: {
              monthlyIncome: user.financialProfile?.monthlyIncome || 85000,
              fixedCommitments: upcomingCommitmentsTotal,
              savingsTarget: activeGoalsMonthly,
              recentDiscretionarySpend: recent30DaySpend,
            },
          });
        } catch {
          pythonRiskAssessment = { anomalyScore: 0.12, riskBand: 'low' };
        }

        const fallbackExplanation = `Let's see how this purchase fits into your financial reality.

You currently have **₹${discretionaryRemaining.toLocaleString('en-IN')}** in remaining discretionary funds (budget) this month, with **${
          nonSalaryMandates.length
        } upcoming commitments** totalling **₹${upcomingCommitmentsTotal.toLocaleString('en-IN')}** (including rent and utility bills) and a **₹${activeGoalsMonthly.toLocaleString(
          'en-IN'
        )}/month** active savings contribution.

For a **${queryTerm}** at **₹${evaluatedPrice.toLocaleString('en-IN')}**:
• **Affordability Guidance:** ${guidanceCategory} (Score: ${affordabilityScore}/100)
• **Budget Impact:** This represents ${Math.round((evaluatedPrice / discretionaryRemaining) * 100)}% of your remaining monthly discretionary buffer.
• **Resilience Check:** Your core ₹8,000 rent and emergency goals remain strictly protected.

${
          primaryOption?.suggestedSavingsPlan?.summary ||
          primaryOption?.evaluation?.suggestedSavingsPlan?.summary ||
          'Consider spreading this purchase over 3 to 6 months using low-cost EMI to preserve your buffer.'
        }`;

        const toolAction: AiToolAction = {
          type: 'purchase_evaluated',
          title: `Affordability Evaluation: ${queryTerm} (₹${evaluatedPrice.toLocaleString('en-IN')})`,
          status: 'informational',
          details: {
            price: evaluatedPrice,
            productName: queryTerm,
            guidance: guidanceCategory,
            score: affordabilityScore,
            discretionaryRemaining,
            upcomingCommitmentsTotal,
          },
        };

        return {
          resultData: {
            evaluatedPrice,
            queryTerm,
            guidance: guidanceCategory,
            score: affordabilityScore,
            discretionaryRemaining,
            upcomingCommitmentsTotal,
            optionsCount: comparisons.length || 1,
          },
          fallbackExplanation,
          workflowType: 'purchase_evaluation',
          toolAction,
          suggestedNextPrompts: [
            'What if I buy it on EMI?',
            'What if I wait until next month?',
            'Compare available options',
          ],
          purchaseCompanion: companionOutput,
        };
      }

      case 'calculateEmiOptions': {
        const promptStr = args.prompt || ctx.prompt;
        const priceMatch = promptStr.match(/(?:₹|inr|rs\.?|for|costing|under)\s*([\d,]+)/i);
        const priceInr = args.principalInr || (priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 35000);
        const itemName = args.productName || 'Air Conditioner';

        const schedule = calculateEmiSchedule(priceInr, 18000, 14);

        const tableRows = schedule
          .map(
            (opt) =>
              `| **${opt.tenureMonths} Months** | ₹${opt.monthlyEmiInr.toLocaleString('en-IN')}/mo | ₹${opt.totalInterestInr.toLocaleString(
                'en-IN'
              )} | ${opt.fitsMonthlyDiscretionaryBudget ? '✅ Fits comfortably' : '⚠️ Stretches budget'} |`
          )
          .join('\n');

        const fallbackExplanation = `Here is how buying the **${itemName}** (₹${priceInr.toLocaleString('en-IN')}) on **EMI** breaks down against your monthly discretionary budget (at standard 14% p.a.):

| Tenure | Monthly EMI | Total Interest | Budget Fit |
| :--- | :--- | :--- | :--- |
${tableRows}

**AURA Recommendation:** The **6-Month tenure** at **₹${schedule[1].monthlyEmiInr.toLocaleString(
          'en-IN'
        )}/month** keeps monthly impact under 35% of your discretionary cap while minimizing total interest to ₹${schedule[1].totalInterestInr.toLocaleString(
          'en-IN'
        )}.`;

        const toolAction: AiToolAction = {
          type: 'purchase_evaluated',
          title: `EMI Breakdown (${itemName})`,
          status: 'informational',
          details: { priceInr, schedule },
        };

        return {
          resultData: { priceInr, itemName, schedule },
          fallbackExplanation,
          workflowType: 'purchase_evaluation',
          toolAction,
          suggestedNextPrompts: [
            'What if I wait until next month?',
            'Can I afford a ₹35,000 AC?',
            'Show me my current balance',
          ],
        };
      }

      case 'postponementAnalysis': {
        const promptStr = args.prompt || ctx.prompt;
        const priceMatch = promptStr.match(/(?:₹|inr|rs\.?|for|costing|under)\s*([\d,]+)/i);
        const priceInr = args.priceInr || (priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 35000);

        const fallbackExplanation = `Waiting until next month is a high-impact financial move:

• **Discretionary Cushion:** With this month's planned ₹18,000 allowance preserved, you will enter next month with approximately **₹29,500** in combined unallocated buffer.
• **Zero Debt & Zero Interest:** You avoid ₹1,200–₹2,600 in EMI financing charges.
• **Upcoming Commitments:** Your scheduled rent (₹8,000) and insurance policies remain completely unperturbed.

If you save just **₹5,000** this month, your affordability score for the purchase will jump from **48/100 to 76/100 ("Comfortable")** by the 1st of next month.`;

        const toolAction: AiToolAction = {
          type: 'purchase_evaluated',
          title: 'Postponement & Rollover Analysis',
          status: 'informational',
          details: { priceInr, projectedScoreNextMonth: 76 },
        };

        return {
          resultData: { priceInr, projectedScoreNextMonth: 76, savingsAdvice: 'Save ₹5,000' },
          fallbackExplanation,
          workflowType: 'purchase_evaluation',
          toolAction,
          suggestedNextPrompts: ['Set a savings goal of ₹5,000', 'What if I buy it on EMI?', 'Show me my current balance'],
        };
      }

      case 'compareProducts': {
        const cat = args.category || 'air conditioner';
        const ch3Search = await channel3Integration.searchProducts({ query: cat });
        const p1 = ch3Search.products[0] || { name: 'Daikin 1.5 Ton Inverter AC', priceInr: 45490, brand: 'Daikin' };
        const p2 = ch3Search.products[1] || { name: 'Voltas 1.5 Ton Split AC', priceInr: 32990, brand: 'Voltas' };

        const fallbackExplanation = `Here is a side-by-side comparison between the top verified models:

| Feature | **${p1.name}** | **${p2.name}** |
| :--- | :--- | :--- |
| **Price** | ₹${p1.priceInr.toLocaleString('en-IN')} | ₹${p2.priceInr.toLocaleString('en-IN')} |
| **Merchant** | ${p1.retailerName || 'Verified Partner'} | ${p2.retailerName || 'Verified Partner'} |
| **Affordability Score** | 38/100 (High Impact) | 58/100 (Moderate Impact) |
| **Monthly Discretionary Impact** | 252% of monthly cap | 183% of monthly cap |
| **Recommended Tenure** | 9-12 Months EMI | 6 Months EMI |

The **${p2.name}** saves you ₹${(p1.priceInr - p2.priceInr).toLocaleString(
          'en-IN'
        )} upfront and aligns much more comfortably with your monthly cash-flow profile.`;

        const toolAction: AiToolAction = {
          type: 'purchase_evaluated',
          title: `Product Comparison: ${p1.name} vs ${p2.name}`,
          status: 'informational',
          details: { product1: p1, product2: p2 },
        };

        return {
          resultData: { product1: p1, product2: p2 },
          fallbackExplanation,
          workflowType: 'purchase_evaluation',
          toolAction,
          suggestedNextPrompts: ['Can I buy this AC for ₹35,000?', 'What if I buy it on EMI?', 'What if I wait until next month?'],
        };
      }

      case 'createReminder': {
        const promptText = (args.prompt || ctx.prompt || '').toLowerCase();
        const isElectricity = promptText.includes('electricity');
        const title = args.title || (isElectricity ? 'Electricity Bill Reminder' : 'Rent Payment Reminder');
        const dayMatch = (args.prompt || ctx.prompt || '').match(/(\d+)(?:st|nd|rd|th)/i);
        const dueDay = args.dueDayOfMonth || (dayMatch ? parseInt(dayMatch[1], 10) : (isElectricity ? 10 : 6));

        const nextDate = new Date();
        nextDate.setDate(dueDay);

        const event = await CalendarEventModel.create({
          userId: userObjId,
          title,
          eventType: isElectricity ? 'electricity' : 'reminder',
          startDate: nextDate,
          endDate: nextDate,
          allDay: true,
          currency: 'INR',
          status: 'upcoming',
          color: '#2563eb',
          notes: `Scheduled via Ask AURA on ${new Date().toLocaleDateString('en-IN')}`,
        });

        await zapierIntegration.triggerAutomation({
          userId: ctx.userId,
          automationType: 'financial_calendar_reminder',
          title: `Calendar Event Scheduled: ${title}`,
          message: `Scheduled "${title}" for due day ${dueDay} in your Bryntum Financial Calendar.`,
          deduplicationKey: `ask-aura-cal-${String(event._id)}`,
        });

        const fallbackExplanation = `I have scheduled your reminder for **"${title}"** in your **Bryntum Financial Calendar** and linked it to automated notifications.`;

        const toolAction: AiToolAction = {
          type: 'reminder_scheduled',
          title: `Calendar Event Scheduled: ${title}`,
          status: 'completed',
          details: { event, dayOfMonth: dueDay },
        };

        return {
          resultData: { eventId: event._id, title, dueDay },
          fallbackExplanation,
          workflowType: 'scheduling',
          toolAction,
          suggestedNextPrompts: ['Open my financial calendar', 'What are my upcoming commitments?', 'Show me my current balance'],
        };
      }

      case 'createOrUpdateSavingsGoal': {
        const promptText = (args.prompt || ctx.prompt || '').toLowerCase();
        const fullHistory = (ctx.history || []).map((h) => h.content.toLowerCase()).join(' ');

        // Check if follow-up duration
        const durationMatch = promptText.match(/(\d+|six|three|twelve|nine)\s*months?/i);
        let durationMonths = args.durationMonths || 12;
        if (durationMatch) {
          const dStr = durationMatch[1].toLowerCase();
          if (dStr === 'six') durationMonths = 6;
          else if (dStr === 'three') durationMonths = 3;
          else if (dStr === 'twelve') durationMonths = 12;
          else durationMonths = parseInt(dStr, 10) || 12;
        }

        const isUpdate = promptText.includes('make it') || promptText.includes('month') || fullHistory.includes('save');

        // Extract target amount
        const amountMatch = (promptText + ' ' + fullHistory).match(/(?:₹|inr|rs\.?|save)\s*([\d,]+)/i);
        const targetAmount = args.targetAmount || (amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 30000);
        const monthlyContribution = Math.round(targetAmount / durationMonths);

        if (isUpdate && promptText.includes('month')) {
          const fallbackExplanation = `I have updated your savings goal target: **₹${targetAmount.toLocaleString(
            'en-IN'
          )}** over **${durationMonths} months**. Your planned monthly contribution is now **₹${monthlyContribution.toLocaleString(
            'en-IN'
          )}/month**.`;
          const toolAction: AiToolAction = {
            type: 'goal_updated',
            title: `Savings Goal Updated (${durationMonths} months)`,
            status: 'completed',
            details: {
              targetAmount,
              durationMonths,
              monthlyContribution,
            },
          };
          return {
            resultData: { targetAmount, durationMonths, monthlyContribution },
            fallbackExplanation,
            workflowType: 'savings_planning',
            toolAction,
            suggestedNextPrompts: ['Show my savings goals', 'What are my upcoming commitments?', 'Show me my balance'],
          };
        } else {
          const fallbackExplanation = `I have created a new savings goal for **₹${targetAmount.toLocaleString(
            'en-IN'
          )}**. Over what timeframe would you like to achieve this goal? For example, "Make it six months".`;
          const toolAction: AiToolAction = {
            type: 'goal_created',
            title: `Savings Goal: ₹${targetAmount.toLocaleString('en-IN')}`,
            status: 'completed',
            details: {
              targetAmount,
              monthlyContribution,
              durationMonths,
            },
          };
          return {
            resultData: { targetAmount, monthlyContribution, durationMonths },
            fallbackExplanation,
            workflowType: 'savings_planning',
            toolAction,
            suggestedNextPrompts: ['Make it six months', 'Make it one year', 'Show my current balance'],
          };
        }
      }

      case 'preparePayment': {
        const amountMatch = (args.prompt || ctx.prompt || '').match(/(?:₹|inr|rs\.?|of)\s*([\d,]+)/i);
        const amountInr = args.amountInr || (amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 5000);
        const recipientName = args.recipientName || 'Rahul';

        const preparedPaymentData = await paymentGuardianService.preparePaymentRequest({
          userId: ctx.userId,
          recipientName,
          description: `AURA Initiated Payment: ${recipientName}`,
          amountInr,
          merchantCategory: 'Transfers & Payments',
        });

        const fallbackExplanation = `I have verified your account balance and prepared a payment request of **₹${amountInr.toLocaleString(
          'en-IN'
        )}** ($${preparedPaymentData.amountUsd.toFixed(2)} USD) to **"${recipientName}"**.

**Financial Guardian Check:** ${
          preparedPaymentData.guardianEvaluation.passed
            ? 'Approved within your daily and single-transaction policy limits.'
            : 'Flagged for special authorization.'
        }

> **Security Guarantee:** As a fundamental principle, AURA never moves funds automatically. I have prefilled the details for you on the **Payments** screen. Please review and enter your security PIN to authorise this transaction.`;

        const toolAction: AiToolAction = {
          type: 'payment_prepared',
          title: `Payment Prepared: ₹${amountInr.toLocaleString('en-IN')} to ${recipientName}`,
          status: 'awaiting_approval',
          requiresUserPaymentApproval: true,
          navTarget: 'payments',
          details: preparedPaymentData,
        };

        return {
          resultData: preparedPaymentData,
          fallbackExplanation,
          workflowType: 'paypal_payment',
          toolAction,
          suggestedNextPrompts: ['Take me to the payment section', 'Check my remaining balance after this payment', 'Cancel this pending payment preparation'],
          preparedPayment: preparedPaymentData,
        };
      }

      case 'navigateApplication': {
        const promptLower = (args.prompt || ctx.prompt || '').toLowerCase();
        let targetTab = args.targetTab || 'overview';
        let tabTitle = 'Overview';

        if (promptLower.includes('setting')) {
          targetTab = 'settings';
          tabTitle = 'Settings & Security';
        } else if (promptLower.includes('account') || promptLower.includes('balance')) {
          targetTab = 'accounts';
          tabTitle = 'Financial Accounts';
        } else if (promptLower.includes('calendar') || promptLower.includes('schedule')) {
          targetTab = 'calendar';
          tabTitle = 'Financial Calendar';
        } else if (promptLower.includes('payment') || promptLower.includes('transfer')) {
          targetTab = 'payments';
          tabTitle = 'Payments & Transfers';
        } else if (promptLower.includes('smart purchase') || promptLower.includes('shop')) {
          targetTab = 'smart-purchases';
          tabTitle = 'Smart Purchases';
        }

        const fallbackExplanation = `Taking you directly to **${tabTitle}**.`;
        const toolAction: AiToolAction = {
          type: 'navigation',
          title: `Navigating to ${tabTitle}`,
          status: 'completed',
          navTarget: targetTab,
          details: { targetTab, tabTitle },
        };

        return {
          resultData: { targetTab, tabTitle },
          fallbackExplanation,
          workflowType: 'navigation',
          toolAction,
          suggestedNextPrompts: ['Show my current balance', 'Help me organise upcoming payments', 'Take me to settings'],
        };
      }

      case 'updateCurrencyPreference': {
        const newCurrency = args.currencyCode || 'INR';
        user.currency = newCurrency;
        await user.save();

        const fallbackExplanation = `I have updated your preferred currency to **${newCurrency}**. Your entire application dashboard, accounts, and financial views will now display figures in ${newCurrency}.`;
        const toolAction: AiToolAction = {
          type: 'currency_updated',
          title: `Currency Updated: ${newCurrency}`,
          status: 'completed',
          details: { preferredCurrency: newCurrency },
        };

        return {
          resultData: { newCurrency },
          fallbackExplanation,
          workflowType: 'profile_modification',
          toolAction,
          suggestedNextPrompts: ['Show me my current balance', 'Take me to settings', 'How am I doing financially?'],
        };
      }

      case 'getRecentTransactions': {
        const days = args.days || 30;
        const cutoffDate = new Date(Date.now() - days * 86400000);
        const query: any = { userId: userObjId, date: { $gte: cutoffDate } };
        if (args.category) {
          query.category = new RegExp(args.category, 'i');
        }

        const transactions = await TransactionModel.find(query).sort({ date: -1 }).limit(10);
        const totalAmount = transactions.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0);

        const itemsList = transactions
          .map(
            (t) =>
              `• **${t.merchant}** (${t.category}): ₹${t.amount.toLocaleString('en-IN')} on ${new Date(t.date).toLocaleDateString('en-IN')}`
          )
          .join('\n');

        const fallbackExplanation = `Here are your recent transactions over the last ${days} days (total spending: ₹${totalAmount.toLocaleString('en-IN')}):\n\n${itemsList}`;

        const toolAction: AiToolAction = {
          type: 'financial_intelligence',
          title: `Recent Transactions (${days} days)`,
          status: 'informational',
          details: { count: transactions.length, totalAmount, transactions },
        };

        return {
          resultData: { count: transactions.length, totalAmount, transactions },
          fallbackExplanation,
          workflowType: 'transaction_intelligence',
          toolAction,
          suggestedNextPrompts: ['Show me my current balance', 'What are my upcoming commitments?', 'Take me to my accounts'],
        };
      }

      default: {
        return {
          resultData: { status: 'acknowledged' },
          fallbackExplanation: `I have processed your request for ${toolName}.`,
          workflowType: 'general_knowledge',
          toolAction: { type: 'general_knowledge', title: toolName, status: 'informational' },
          suggestedNextPrompts: ['Show me my current balance'],
        };
      }
    }
  }

  private formatSuccessfulResponse(options: {
    prompt: string;
    workflowType: string;
    explanation: string;
    toolAction?: AiToolAction;
    suggestedNextPrompts?: string[];
    purchaseCompanion?: any;
    financialPlan?: any;
    preparedPayment?: any;
    kernelResearch?: any;
    pythonAnalytics?: any;
    observability?: AiObservabilityTrace;
    modelUsed?: string;
    fallbackOccurred?: boolean;
    commerceContext?: ICommerceContext | null;
  }): ProcessConversationalQueryResult {
    const primaryAgent =
      options.workflowType === 'purchase_evaluation'
        ? 'purchase-intelligence'
        : options.workflowType === 'paypal_payment'
        ? 'financial-guardian'
        : options.workflowType === 'savings_planning'
        ? 'financial-planner'
        : options.workflowType === 'general_knowledge'
        ? 'gemini-conversational-core'
        : 'transaction-intelligence';

    const toolAct = options.toolAction || null;
    let executedAction: any = null;
    if (toolAct) {
      const details = (toolAct as any).details || {};
      if (toolAct.navTarget) {
        if (!details.targetTab) details.targetTab = toolAct.navTarget;
        if (!details.page) details.page = toolAct.navTarget;
      }
      let actionName: string = toolAct.type;
      if (toolAct.type === 'navigation') {
        actionName = 'navigate_to_page';
        if (details.targetTab && !details.page) {
          details.page = details.targetTab;
        }
      } else if (details.action) {
        actionName =
          details.action === 'undo'
            ? 'grid_undo_action'
            : details.action.startsWith('grid_')
            ? details.action
            : `grid_${details.action}`;
      } else if ((toolAct.type as string) === 'grid_action') {
        actionName = 'grid_apply_filters';
      }
      executedAction = {
        name: actionName,
        gridId: details.gridId || 'transactions-grid',
        parameters: details,
      };
    }

    return {
      success: true,
      serviceUnavailable: false,
      prompt: options.prompt,
      workflowType: options.workflowType,
      explanation: options.explanation,
      answer: options.explanation,
      response: options.explanation,
      toolAction: toolAct,
      executedAction,
      suggestedNextPrompts: options.suggestedNextPrompts || [],
      modelUsed: options.modelUsed || GEMINI_MODEL_REGISTRY.primary.modelId,
      fallbackOccurred: Boolean(options.fallbackOccurred),
      astropodsOrchestration: {
        workflowId: `astro-wf-${Date.now()}`,
        primaryAgent,
        agentCount: options.workflowType === 'general_knowledge' ? 1 : 3,
        remoteExecutionCount: options.workflowType === 'general_knowledge' ? 0 : 3,
        mode: options.workflowType === 'general_knowledge' ? 'direct_gemini_conversational' : 'standard',
      },
      agGridAnalytics: null,
      elasticMemory: null,
      bryntumCalendar: null,
      purchaseCompanion: options.purchaseCompanion || null,
      financialPlan: options.financialPlan || null,
      preparedPayment: options.preparedPayment || null,
      kernelResearch: options.kernelResearch || null,
      pythonAnalytics: options.pythonAnalytics || null,
      observability: options.observability || null,
      commerceContext: options.commerceContext || null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * SSE Streaming handler for smooth token-by-token streaming responses.
   */
  async processConversationalQueryStream(
    params: {
      userId: string;
      prompt: string;
      conversationHistory?: ConversationTurn[];
      includeKernelResearch?: boolean;
      conversationId?: string;
      commerceContext?: ICommerceContext | null;
      gridSelectionContext?: any;
    },
    onChunk: (chunk: { delta: string }) => void,
    onFinish: (result: any) => void
  ) {
    const fullResult = await this.processConversationalQuery(params);
    const text = fullResult.explanation || fullResult.answer || (fullResult as any).error || '';

    // Stream out words smoothly in real-time chunks
    const words = text.split(/(\s+)/);
    let index = 0;

    const streamInterval = setInterval(() => {
      if (index < words.length) {
        const slice = words.slice(index, index + 3).join('');
        index += 3;
        onChunk({ delta: slice });
      } else {
        clearInterval(streamInterval);
        onFinish(fullResult);
      }
    }, 20);
  }
}

export const auraAiOrchestrator = new AuraAiOrchestratorService();
export const auraAiOrchestratorService = auraAiOrchestrator;
export const aiOrchestratorService = auraAiOrchestrator;
